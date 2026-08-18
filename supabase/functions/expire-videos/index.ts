// Supabase Edge Function — apaga vídeos e comentários expirados (24h).
// Configurar como cron job no Supabase Dashboard: Edge Functions >
// expire-videos > Cron: "*/10 * * * *" (roda a cada 10 min).
//
// Deploy: supabase functions deploy expire-videos
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: expirados } = await supabase
    .from('videos')
    .select('id, storage_path')
    .lt('expires_at', new Date().toISOString());

  if (!expirados?.length) {
    return new Response(JSON.stringify({ apagados: 0 }), { status: 200 });
  }

  // Apaga os ficheiros do Storage
  const paths = expirados.map((v) => v.storage_path);
  await supabase.storage.from('videos').remove(paths);

  // Apaga as linhas (comentários apagam em cascata pela foreign key)
  const ids = expirados.map((v) => v.id);
  await supabase.from('videos').delete().in('id', ids);

  return new Response(JSON.stringify({ apagados: ids.length }), { status: 200 });
});
