import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { subscription_id } = await request.json();
  const admin = createAdminClient();

  // Só confirma se ainda estiver pending — evita reprocessar/duplicar
  // se dois admins clicarem ao mesmo tempo (condição de corrida)
  const { data: sub, error: subError } = await admin
    .from('subscriptions')
    .update({ status: 'active', confirmed_by: check.userId })
    .eq('id', subscription_id)
    .eq('status', 'pending')
    .select()
    .single();

  if (subError || !sub) {
    return NextResponse.json(
      { error: 'Assinatura não encontrada ou já processada' },
      { status: 409 }
    );
  }

  const expiraEm = new Date();
  expiraEm.setMonth(expiraEm.getMonth() + 1);

  const { error: perfilError } = await admin
    .from('profiles')
    .update({
      is_subscriber: true,
      subscription_plan: sub.plan_kz,
      subscription_expires_at: expiraEm.toISOString(),
    })
    .eq('id', sub.profile_id);

  if (perfilError) {
    // A assinatura já ficou "active" na escrita anterior, mas o perfil não
    // foi actualizado — sem transação entre as duas tabelas, isto pode
    // ficar inconsistente. Avisa claramente em vez de responder ok:true
    // como se estivesse tudo bem (o mesmo erro que já foi corrigido no
    // webhook da AppyPay, ver migration 0009 — aqui aplica-se ao clique
    // manual do admin).
    console.error('confirm-subscription: assinatura activa mas perfil não actualizado', perfilError);
    return NextResponse.json(
      { error: 'Assinatura confirmada mas o perfil não foi actualizado — verifica manualmente' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
