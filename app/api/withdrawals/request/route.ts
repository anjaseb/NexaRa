// Cria um pedido de saque — valida o valor mínimo (2000 Kz) E o saldo
// disponível de verdade (nunca confia no valor que o cliente manda,
// recalcula tudo aqui a partir do histórico real de ganhos e saques).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const VALOR_MINIMO_KZ = 2000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const limitado = await rateLimit(`withdrawal-request:${user.id}`, 5, 60 * 60);
  if (!limitado.ok) {
    return NextResponse.json({ error: 'Muitos pedidos, tenta mais tarde' }, { status: 429 });
  }

  const { amount_kz } = await request.json();
  if (typeof amount_kz !== 'number' || !Number.isInteger(amount_kz) || amount_kz < VALOR_MINIMO_KZ) {
    return NextResponse.json(
      { error: `O valor mínimo de saque é ${VALOR_MINIMO_KZ} Kz e tem de ser um número inteiro` },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase.rpc('meu_perfil');

  if (!profile?.is_subscriber) {
    return NextResponse.json({ error: 'Só assinantes podem sacar' }, { status: 403 });
  }

  if (!profile.mcx_express_number) {
    return NextResponse.json(
      { error: 'Configura o teu número Multicaixa Express antes de sacar' },
      { status: 400 }
    );
  }

  // Saldo real = soma de tudo que já foi ganho - soma do que já foi
  // sacado ou está com saque pendente/em processamento (nunca deixa
  // pedir saque duas vezes do mesmo dinheiro)
  const { data: ganhos } = await supabase
    .from('daily_earnings')
    .select('earned_kz')
    .eq('profile_id', user.id);
  const totalGanho = ganhos?.reduce((soma, g) => soma + Number(g.earned_kz), 0) ?? 0;

  const { data: saquesExistentes } = await supabase
    .from('withdrawals')
    .select('amount_kz')
    .eq('profile_id', user.id)
    .in('status', ['pending', 'processing', 'paid']);
  const totalJaSacadoOuPendente =
    saquesExistentes?.reduce((soma, s) => soma + Number(s.amount_kz), 0) ?? 0;

  const saldoDisponivel = totalGanho - totalJaSacadoOuPendente;

  if (amount_kz > saldoDisponivel) {
    return NextResponse.json(
      { error: `Saldo insuficiente. Disponível: ${saldoDisponivel.toFixed(0)} Kz` },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('withdrawals').insert({
    profile_id: user.id,
    amount_kz,
    status: 'pending',
  });

  if (error) {
    return NextResponse.json({ error: 'Não foi possível criar o pedido' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saldo_restante: saldoDisponivel - amount_kz });
}
