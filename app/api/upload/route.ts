// Recebe o vídeo, valida o tipo REAL do ficheiro pelos primeiros bytes
// (assinatura binária — o cabeçalho "file.type" enviado pelo browser é
// facilmente falsificável e NÃO prova nada sozinho), aplica o limite de
// tamanho, envia para o Supabase Storage e dispara a compressão.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const DURACAO_MAXIMA_SEGUNDOS = 60;
const TAMANHO_ALVO_BYTES = 8 * 1024 * 1024; // 6-8MB, alvo pós-compressão
const TAMANHO_MAXIMO_ACEITE_BYTES = 25 * 1024 * 1024; // hard cap antes de comprimir

// Assinaturas binárias (magic numbers) dos formatos aceites.
// mp4/mov usam a caixa "ftyp" a partir do byte 4; webm começa com EBML.
function tipoRealDoFicheiro(buffer: Buffer): 'video/mp4' | 'video/quicktime' | 'video/webm' | null {
  if (buffer.length < 12) return null;

  const ftyp = buffer.toString('ascii', 4, 8);
  if (ftyp === 'ftyp') {
    const marca = buffer.toString('ascii', 8, 12);
    if (marca.startsWith('qt')) return 'video/quicktime';
    return 'video/mp4'; // isom, mp42, M4V, etc.
  }

  const ebml = buffer.subarray(0, 4);
  if (ebml[0] === 0x1a && ebml[1] === 0x45 && ebml[2] === 0xdf && ebml[3] === 0xa3) {
    return 'video/webm';
  }

  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Verificação obrigatória de telefone/email antes de publicar
  // (regra da spec, secção 8) — checa o perfil, não confia no token sozinho
  const { data: perfil } = await supabase.rpc('meu_perfil');

  if (!perfil?.email_verified && !perfil?.phone_verified) {
    return NextResponse.json(
      { error: 'Confirma o teu email ou telefone antes de publicar' },
      { status: 403 }
    );
  }

  const limitado = await rateLimit(`upload:${user.id}`, 10, 60 * 10);
  if (!limitado.ok) {
    return NextResponse.json({ error: 'Muitos uploads, aguarda uns minutos' }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const caption = (formData.get('caption') as string | null)?.slice(0, 300) ?? null;
  const durationSeconds = Number(formData.get('duration_seconds'));

  if (!file) {
    return NextResponse.json({ error: 'Nenhum ficheiro enviado' }, { status: 400 });
  }

  if (file.size > TAMANHO_MAXIMO_ACEITE_BYTES) {
    return NextResponse.json(
      { error: `Ficheiro demasiado grande (máx ${TAMANHO_MAXIMO_ACEITE_BYTES / 1024 / 1024}MB antes de comprimir)` },
      { status: 400 }
    );
  }

  if (!durationSeconds || durationSeconds > DURACAO_MAXIMA_SEGUNDOS) {
    return NextResponse.json(
      { error: `Duração máxima é ${DURACAO_MAXIMA_SEGUNDOS}s` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const tipoReal = tipoRealDoFicheiro(buffer);

  if (!tipoReal) {
    return NextResponse.json(
      { error: 'Ficheiro não reconhecido como vídeo válido (mp4/mov/webm)' },
      { status: 400 }
    );
  }

  const path = `${user.id}/${Date.now()}.${tipoReal === 'video/webm' ? 'webm' : 'mp4'}`;

  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(path, buffer, { contentType: tipoReal });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: video, error: dbError } = await supabase
    .from('videos')
    .insert({
      creator_id: user.id,
      storage_path: path,
      caption,
      duration_seconds: durationSeconds,
      file_size_bytes: buffer.byteLength,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Dispara a compressão em segundo plano (não bloqueia a resposta ao
  // usuário) — ver app/api/compress/route.ts e a nota de limitações lá.
  if (buffer.byteLength > TAMANHO_ALVO_BYTES) {
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/compress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({ video_id: video.id, storage_path: path }),
    }).catch(() => {
      // Falha na compressão não deve derrubar o upload — o vídeo fica
      // disponível na qualidade original, só maior do que o alvo
    });
  }

  return NextResponse.json({ video });
}
