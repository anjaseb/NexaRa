import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import FeedClient from '@/components/FeedClient';

const VALIDADE_URL_ASSINADA_SEGUNDOS = 60 * 60; // 1h, conforme a spec

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSubscriber = false;
  let precisaVerificar = false;
  if (user) {
    const { data: profile } = await supabase.rpc('meu_perfil');
    isSubscriber = profile?.is_subscriber ?? false;
    precisaVerificar = !(profile?.email_verified || profile?.phone_verified);
  }

  const { data: populares } = await supabase
    .from('videos')
    .select('*, profiles(display_name, avatar_url)')
    .gt('expires_at', new Date().toISOString())
    .order('total_watch_seconds', { ascending: false })
    .limit(10);

  const { data: recentes } = await supabase
    .from('videos')
    .select('*, profiles(display_name, avatar_url)')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  const vistos = new Set<string>();
  const feed: any[] = [];
  const maiorLen = Math.max(populares?.length ?? 0, recentes?.length ?? 0);
  for (let i = 0; i < maiorLen; i++) {
    if (populares?.[i] && !vistos.has(populares[i].id)) {
      feed.push(populares[i]);
      vistos.add(populares[i].id);
    }
    if (recentes?.[i] && !vistos.has(recentes[i].id)) {
      feed.push(recentes[i]);
      vistos.add(recentes[i].id);
    }
  }

  // Gera signed URLs para TODO o feed já aqui no servidor (nunca link
  // público permanente — corrige a falha da versão anterior) usando o
  // cliente de serviço, porque o bucket é privado.
  const admin = createAdminClient();
  const feedComUrls = await Promise.all(
    feed.map(async (video) => {
      const { data } = await admin.storage
        .from('videos')
        .createSignedUrl(video.storage_path, VALIDADE_URL_ASSINADA_SEGUNDOS);
      return { ...video, signed_url: data?.signedUrl ?? null };
    })
  );

  return (
    <FeedClient
      feed={feedComUrls}
      isSubscriber={isSubscriber}
      loggedIn={!!user}
      precisaVerificar={precisaVerificar}
    />
  );
}
