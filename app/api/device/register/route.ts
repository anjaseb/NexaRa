// Chamado logo após login/registo bem-sucedido, com o fingerprint gerado
// no cliente (ver lib/fingerprint.ts). Aplica o limite de 5 contas por
// dispositivo definido na spec — mas nunca bloqueia sozinho, só sinaliza
// para revisão no painel admin quando ultrapassado (fingerprint tem falsos
// positivos, ver nota em lib/fingerprint.ts).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const LIMITE_CONTAS_POR_DISPOSITIVO = 5;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { fingerprint } = await request.json();
  if (!fingerprint || typeof fingerprint !== 'string') {
    return NextResponse.json({ error: 'Fingerprint inválido' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Já associado? Só actualiza, não conta para o limite de novo
  const { data: existente } = await admin
    .from('device_fingerprints')
    .select('*')
    .eq('fingerprint', fingerprint)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (existente) {
    return NextResponse.json({ ok: true, ja_registado: true });
  }

  const { count } = await admin
    .from('device_fingerprints')
    .select('*', { count: 'exact', head: true })
    .eq('fingerprint', fingerprint);

  const excedeuLimite = (count ?? 0) >= LIMITE_CONTAS_POR_DISPOSITIVO;

  await admin.from('device_fingerprints').insert({
    fingerprint,
    profile_id: user.id,
    flagged_suspicious: excedeuLimite,
  });

  // Acesso restrito (definido na spec): conta além do limite navega
  // normalmente, mas não gera tempo/dinheiro nem pode activar modo ganho
  if (excedeuLimite) {
    await admin
      .from('profiles')
      .update({ account_age_weight: 0 })
      .eq('id', user.id);
  }

  return NextResponse.json({ ok: true, acesso_limitado: excedeuLimite });
}
