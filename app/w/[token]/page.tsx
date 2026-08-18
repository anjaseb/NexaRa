import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import FeedItem from '@/components/FeedItem';

const VALIDADE_URL_ASSINADA_SEGUNDOS = 60 * 60; // 1h, igual ao feed principal

export default async function VideoPartilhadoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: video } = await supabase
    .from('videos')
    .select('*, profiles(display_name, avatar_url)')
    .eq('share_token', token)
    .gt('expires_at', new Date().toISOString()) // link só funciona se o vídeo ainda não expirou
    .maybeSingle();

  if (!video) {
    // Vídeo expirou (24h) ou o token não existe
    notFound();
  }

  // Bug corrigido: esta página passava "video" directamente ao
  // FeedItem sem gerar signed_url — o componente só toca o vídeo se
  // video.signed_url existir (bucket privado, sem link público), então
  // o link partilhado nunca reproduzia nada. Gera aqui, com o cliente
  // de serviço, exactamente como app/page.tsx faz para o feed normal.
  const admin = createAdminClient();
  const { data: urlAssinada } = await admin.storage
    .from('videos')
    .createSignedUrl(video.storage_path, VALIDADE_URL_ASSINADA_SEGUNDOS);

  return (
    <main className="feed">
      <FeedItem video={{ ...video, signed_url: urlAssinada?.signedUrl ?? null }} activo />
    </main>
  );
}
