import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const JANELA_MINIMA_HORAS = 24;

export async function POST(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { withdrawal_id } = await request.json();
  const admin = createAdminClient();

  const { data: pedido } = await admin
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawal_id)
    .single();

  if (!pedido) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }

  const horasDesdePedido =
    (Date.now() - new Date(pedido.requested_at).getTime()) / 1000 / 60 / 60;

  if (horasDesdePedido < JANELA_MINIMA_HORAS) {
    return NextResponse.json(
      { error: `Ainda dentro da janela de ${JANELA_MINIMA_HORAS}h de segurança` },
      { status: 400 }
    );
  }

  // Atómico: só marca como pago se ainda estiver pending (evita duplo pagamento
  // se o admin clicar duas vezes ou dois admins processarem ao mesmo tempo)
  const { data: atualizado, error } = await admin
    .from('withdrawals')
    .update({ status: 'paid', processed_at: new Date().toISOString() })
    .eq('id', withdrawal_id)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !atualizado) {
    return NextResponse.json({ error: 'Pedido já foi processado' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
