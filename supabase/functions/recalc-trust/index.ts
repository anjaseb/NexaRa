// Supabase Edge Function — recalcula account_age_weight para todas as
// contas (spec secção 9: peso de confiança cresce com idade + diversidade
// de criadores assistidos). Configurar como cron: "0 * * * *" (a cada hora).
// Deploy: supabase functions deploy recalc-trust
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: perfis } = await supabase.from('profiles').select('id');
  if (!perfis?.length) {
    return new Response(JSON.stringify({ atualizados: 0 }), { status: 200 });
  }

  for (const perfil of perfis) {
    await supabase.rpc('recalcular_peso_confianca', { p_profile_id: perfil.id });
  }

  return new Response(JSON.stringify({ atualizados: perfis.length }), { status: 200 });
});
