// Limita pedidos por chave (ex: "watch-time:<user_id>", "login:<ip>").
//
// IMPORTANTE: o fallback em memória só funciona correctamente num único
// processo — a Vercel corre funções serverless em várias instâncias, por
// isso em produção real este limite "em memória" NÃO é fiável (cada
// instância tem a sua própria contagem). Para produção, configura
// UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN (grátis até um certo
// volume em upstash.com) — o código já usa automaticamente quando presentes.

type ResultadoLimite = { ok: boolean; restantes: number };

const memoria = new Map<string, { contagem: number; expiraEm: number }>();

async function rateLimitMemoria(
  chave: string,
  maxPedidos: number,
  janelaSegundos: number
): Promise<ResultadoLimite> {
  const agora = Date.now();
  const registo = memoria.get(chave);

  if (!registo || registo.expiraEm < agora) {
    memoria.set(chave, { contagem: 1, expiraEm: agora + janelaSegundos * 1000 });
    return { ok: true, restantes: maxPedidos - 1 };
  }

  if (registo.contagem >= maxPedidos) {
    return { ok: false, restantes: 0 };
  }

  registo.contagem += 1;
  return { ok: true, restantes: maxPedidos - registo.contagem };
}

async function rateLimitUpstash(
  chave: string,
  maxPedidos: number,
  janelaSegundos: number
): Promise<ResultadoLimite> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  // Falha aberta: se o Upstash estiver em baixo, mal configurado, ou
  // devolver algo inesperado, isto não pode derrubar login/upload/
  // watch-time inteiros — só regista o erro e deixa passar o pedido,
  // tratando-o como se não estivesse limitado desta vez. Um rate
  // limiter indisponível é preferível a uma app indisponível.
  try {
    const respIncr = await fetch(`${url}/incr/${encodeURIComponent(chave)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!respIncr.ok) {
      console.error('rate-limit: Upstash respondeu com erro', respIncr.status);
      return { ok: true, restantes: maxPedidos };
    }

    const { result: contagem } = await respIncr.json();
    if (typeof contagem !== 'number') {
      console.error('rate-limit: resposta inesperada do Upstash', contagem);
      return { ok: true, restantes: maxPedidos };
    }

    if (contagem === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(chave)}/${janelaSegundos}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => console.error('rate-limit: falha ao definir expiração', err));
    }

    return { ok: contagem <= maxPedidos, restantes: Math.max(0, maxPedidos - contagem) };
  } catch (err) {
    console.error('rate-limit: erro a contactar o Upstash', err);
    return { ok: true, restantes: maxPedidos };
  }
}

export async function rateLimit(
  chave: string,
  maxPedidos: number,
  janelaSegundos: number
): Promise<ResultadoLimite> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return rateLimitUpstash(chave, maxPedidos, janelaSegundos);
  }
  return rateLimitMemoria(chave, maxPedidos, janelaSegundos);
}
