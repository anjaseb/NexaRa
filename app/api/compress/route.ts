// Comprime o vídeo para o alvo de ~6-8MB definido na spec, usando ffmpeg.
//
// SEGURANÇA: esta rota só deve ser chamada pelo próprio servidor (a partir
// de app/api/upload/route.ts), nunca directamente por um cliente — senão
// qualquer pessoa na internet conseguiria forçar processamento pesado
// (custo de compute) ou tentar sobrescrever ficheiros de outros usuários
// passando um storage_path arbitrário. Por isso exige um cabeçalho com
// um segredo partilhado, gerado uma vez e guardado só no .env (nunca
// exposto ao browser, por isso NÃO leva o prefixo NEXT_PUBLIC_).
//
// LIMITAÇÃO REAL IMPORTANTE (ler antes de pôr em produção):
// A Vercel (funções serverless) tem limite de tempo de execução — 10s no
// plano Hobby, 60s no Pro por padrão (configurável até 300s no Pro/Enterprise
// via `maxDuration`). Comprimir vídeo é lento; um vídeo de 60s pode demorar
// mais do que isso consoante o hardware alocado. Duas soluções reais:
//   1. Aumentar `maxDuration` aqui (linha abaixo) e aceitar o custo/risco
//      de timeout ocasional em vídeos maiores — aceitável para o volume
//      inicial (poucos usuários).
//   2. Migrar esta função para um worker fora da Vercel (ex: Supabase Edge
//      Function separada, ou um pequeno servidor Node num Fly.io/Render)
//      quando o volume crescer — mais robusto, sem limite de tempo rígido.
// Por agora implementamos a opção 1 (mais simples para o MVP).
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export const maxDuration = 120; // segundos — ajustar conforme o plano Vercel

ffmpeg.setFfmpegPath(ffmpegPath.path);

const TAMANHO_ALVO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const segredoRecebido = request.headers.get('x-internal-secret');
  if (
    !process.env.INTERNAL_API_SECRET ||
    segredoRecebido !== process.env.INTERNAL_API_SECRET
  ) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { video_id, storage_path } = await request.json();
  const admin = createAdminClient();

  // Confirma que o storage_path pertence mesmo ao video_id informado —
  // impede reprocessar/sobrescrever um ficheiro que não corresponde
  const { data: videoConferido } = await admin
    .from('videos')
    .select('storage_path')
    .eq('id', video_id)
    .single();

  if (!videoConferido || videoConferido.storage_path !== storage_path) {
    return NextResponse.json({ error: 'Vídeo não corresponde ao path' }, { status: 400 });
  }

  const { data: original, error: baixarErro } = await admin.storage
    .from('videos')
    .download(storage_path);

  if (baixarErro || !original) {
    return NextResponse.json({ error: 'Não foi possível ler o vídeo original' }, { status: 500 });
  }

  // Usa a extensão real do ficheiro guardado (mp4 ou webm) para o
  // ficheiro temporário de entrada — antes estava sempre fixo em
  // ".mp4" mesmo para webm, o que não impedia o ffmpeg de funcionar
  // (ele lê pelo conteúdo, não pela extensão) mas não deixava de ser
  // uma inconsistência a corrigir. A saída é sempre .mp4 de propósito:
  // é o formato alvo da compressão, independente da entrada.
  const extensaoEntrada = storage_path.split('.').pop() || 'mp4';
  const entradaPath = join(tmpdir(), `${video_id}-in.${extensaoEntrada}`);
  const saidaPath = join(tmpdir(), `${video_id}-out.mp4`);
  await writeFile(entradaPath, Buffer.from(await original.arrayBuffer()));

  // Calcula um bitrate alvo simples a partir do tamanho e duração,
  // deixando uma margem de 10% para o áudio/overhead do container
  const { data: videoRow } = await admin
    .from('videos')
    .select('duration_seconds')
    .eq('id', video_id)
    .single();
  const duracao = videoRow?.duration_seconds ?? 30;
  const bitrateAlvoKbps = Math.max(
    300,
    Math.floor(((TAMANHO_ALVO_BYTES * 8) / duracao / 1000) * 0.9)
  );

  await new Promise<void>((resolve, reject) => {
    ffmpeg(entradaPath)
      .videoBitrate(bitrateAlvoKbps)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('64k')
      .outputOptions(['-preset veryfast', '-movflags +faststart'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(saidaPath);
  });

  const comprimido = await readFile(saidaPath);

  // Se a compressão não ajudou (ficheiro já pequeno/eficiente), mantém o original
  if (comprimido.byteLength < original.size) {
    await admin.storage.from('videos').update(storage_path, comprimido, {
      contentType: 'video/mp4',
      upsert: true,
    });
    await admin
      .from('videos')
      .update({ file_size_bytes: comprimido.byteLength })
      .eq('id', video_id);
  }

  await unlink(entradaPath).catch(() => {});
  await unlink(saidaPath).catch(() => {});

  return NextResponse.json({ ok: true, tamanho_final: comprimido.byteLength });
}
