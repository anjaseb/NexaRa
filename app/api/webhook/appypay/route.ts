// Webhook real da AppyPay. Valida a assinatura criptográfica antes de
// aceitar qualquer "pago" (regra da spec, secção 7 — nunca confiar
// só porque o pedido diz que é da AppyPay).
//
// IMPORTANTE: o formato exato da assinatura (header usado, algoritmo)
// depende da documentação que a AppyPay entrega no momento da aprovação
// como comerciante — isto ainda não existe publicamente sem conta.
// A validação abaixo usa HMAC-SHA256 sobre o corpo bruto, o padrão mais
// comum em gateways de pagamento — confirma o header exato com o gerente
// de conta da AppyPay quando a aprovação sair, e ajusta a constante
// APPYPAY_SIGNATURE_HEADER se for diferente.
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const APPYPAY_SIGNATURE_HEADER = 'x-appypay-signature';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const assinaturaRecebida = request.headers.get(APPYPAY_SIGNATURE_HEADER);

  if (!assinaturaRecebida || !process.env.APPYPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Assinatura ausente' }, { status: 401 });
  }

  const assinaturaEsperada = createHmac('sha256', process.env.APPYPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const valido =
    assinaturaRecebida.length === assinaturaEsperada.length &&
    timingSafeEqual(Buffer.from(assinaturaRecebida), Buffer.from(assinaturaEsperada));

  if (!valido) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const supabase = createAdminClient();

  // Payload esperado (ajustar aos nomes reais de campo da AppyPay quando disponíveis)
  const { reference, status, profile_id, plan_kz, type } = payload;

  if (type === 'subscription' && status === 'paid') {
    // Mesmo com a assinatura HMAC já validada (o pedido é mesmo da
    // AppyPay), vale confirmar que plan_kz é um dos planos válidos
    // antes de gravar — protege contra um erro de integração do lado
    // deles (campo trocado, valor inesperado) gravar algo estranho
    // no perfil do usuário. A tabela subscriptions já tem este check
    // por constraint; aqui evitamos sequer tentar actualizar profiles
    // com um valor fora do esperado.
    if (plan_kz !== 500 && plan_kz !== 1000) {
      return NextResponse.json({ error: 'plan_kz inválido' }, { status: 400 });
    }

    const expiraEm = new Date();
    expiraEm.setMonth(expiraEm.getMonth() + 1);

    // As duas escritas (subscriptions + profiles) acontecem juntas,
    // na mesma transação, dentro da função — evita ficar com estado
    // inconsistente se uma escrita tiver sucesso e a outra falhar.
    const { data: confirmado, error } = await supabase.rpc('confirmar_assinatura_paga', {
      p_profile_id: profile_id,
      p_reference: reference,
      p_plan_kz: plan_kz,
      p_expira_em: expiraEm.toISOString(),
    });

    if (error) {
      // Erro real (BD em baixo, etc.) — devolve 4xx/5xx para a AppyPay
      // reenviar o webhook mais tarde, em vez de responder 200 e
      // perder o evento para sempre.
      console.error('webhook appypay: falha ao confirmar assinatura', error);
      return NextResponse.json({ error: 'Falha ao processar' }, { status: 500 });
    }

    if (!confirmado) {
      // Não havia assinatura pendente para este perfil. Pode ser um
      // webhook duplicado de um evento já processado — nesse caso não
      // é um erro, é o resultado esperado de um reenvio. Responde 200
      // para a AppyPay não voltar a tentar para sempre.
      console.warn('webhook appypay: nenhuma assinatura pendente para', profile_id);
    }
  }

  if (type === 'payout' && status === 'paid') {
    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'paid', processed_at: new Date().toISOString() })
      .eq('payment_reference', reference);

    if (error) {
      console.error('webhook appypay: falha ao marcar saque como pago', error);
      return NextResponse.json({ error: 'Falha ao processar' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
