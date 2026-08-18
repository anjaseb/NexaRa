// Aplica, no servidor (nunca confiar no cliente), as regras:
//  - aquecimento de 6 min contínuos por CONTA, medido a partir do
//    início real da sessão (active_sessions), não de tempo já creditado
//  - tecto de 1 min (60s) por vídeo
//  - peso reduzido para contas novas/pouco diversificadas
//  - o "delta_seconds" enviado pelo cliente é sempre limitado ao tempo
//    real decorrido desde o último heartbeat, para impedir que alguém
//    chame a API directamente a inventar segundos
//  - tecto de 1000 Kz/dia por conta, SÓ para assinantes (free não ganha
//    dinheiro) — aplicado de verdade aqui, não só exibido na tela
//
// A escrita de seconds_credited/earned_kz corre inteira dentro da RPC
// creditar_watch_time (ver migration 0005) — leitura+cálculo+escrita
// como uma operação atómica no Postgres (com "select ... for update"),
// para que pedidos concorrentes não leiam o mesmo valor desatualizado
// e ultrapassem os tectos. Fazer isso em JavaScript com leituras e
// escritas separadas, como antes, é uma condição de corrida.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const AQUECIMENTO_SEGUNDOS = 6 * 60;
const TECTO_POR_VIDEO_SEGUNDOS = 60;
const DELTA_MAXIMO_POR_CHAMADA = 5; // ninguém assiste "de repente" 500s numa só chamada
const LIMITE_DIARIO_KZ = 1000;
// Taxa de conversão segundo creditado -> Kz. É uma estimativa em tempo
// real para aplicar o tecto; a receita exacta de anúncios só se sabe
// nos relatórios diários do Google (AdSense/AdMob) e pode ser
// reconciliada depois — isso é ajuste financeiro, não código.
const KZ_POR_SEGUNDO_CREDITADO = 0.5;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const limitado = await rateLimit(`watch-time:${user.id}`, 30, 60);
  if (!limitado.ok) {
    return NextResponse.json({ error: 'Muitos pedidos, aguarda um pouco' }, { status: 429 });
  }

  const { video_id, delta_seconds } = await request.json();

  if (typeof delta_seconds !== 'number' || delta_seconds < 0) {
    return NextResponse.json({ error: 'delta_seconds inválido' }, { status: 400 });
  }
  if (typeof video_id !== 'string' || !video_id) {
    return NextResponse.json({ error: 'video_id inválido' }, { status: 400 });
  }

  // 1. Confirma o início real da sessão contínua nesta conta
  const { data: sessao } = await supabase
    .from('active_sessions')
    .select('started_at, last_heartbeat_at')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!sessao) {
    return NextResponse.json({ credited: 0, warming_up: true, reason: 'sem_sessao_ativa' });
  }

  // O heartbeat é enviado a cada ~10s enquanto a aba está visível e em
  // primeiro plano (ver useHeartbeat.ts). Se o último heartbeat está
  // velho demais, a "continuidade" foi quebrada — aba minimizada, app
  // em segundo plano no telemóvel, wifi caiu, etc. Sem esta checagem,
  // um vídeo em loop numa aba escondida continuaria a creditar tempo
  // indefinidamente sem ninguém realmente a assistir.
  const TOLERANCIA_HEARTBEAT_SEGUNDOS = 25;
  const segundosDesdeUltimoHeartbeat = Math.floor(
    (Date.now() - new Date(sessao.last_heartbeat_at).getTime()) / 1000
  );

  if (segundosDesdeUltimoHeartbeat > TOLERANCIA_HEARTBEAT_SEGUNDOS) {
    // Continuidade quebrada — reinicia o aquecimento (regra da spec:
    // sair/perder continuidade antes do fim reinicia o contador)
    await supabase
      .from('active_sessions')
      .update({ started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })
      .eq('profile_id', user.id);

    return NextResponse.json({ credited: 0, warming_up: true, reason: 'continuidade_quebrada' });
  }

  const segundosDeSessao = Math.floor(
    (Date.now() - new Date(sessao.started_at).getTime()) / 1000
  );

  if (segundosDeSessao < AQUECIMENTO_SEGUNDOS) {
    return NextResponse.json({
      credited: 0,
      warming_up: true,
      faltam_segundos: AQUECIMENTO_SEGUNDOS - segundosDeSessao,
    });
  }

  // 2. Limita o delta ao tempo real decorrido desde o último heartbeat
  //    (impede inflacionar tempo chamando a API directamente com valores grandes)
  const deltaSeguro = Math.min(delta_seconds, DELTA_MAXIMO_POR_CHAMADA);

  const { data: profile } = await supabase.rpc('meu_perfil');
  const peso = profile?.account_age_weight ?? 0.2;

  // 3. Tudo a partir daqui (tecto por vídeo, tecto diário, escrita)
  //    corre atomicamente dentro da função — ver migration 0005.
  const { data: resultado, error } = await supabase.rpc('creditar_watch_time', {
    p_viewer_id: user.id,
    p_video_id: video_id,
    p_delta_seconds: deltaSeguro,
    p_peso: peso,
    p_is_subscriber: profile?.is_subscriber ?? false,
    p_tecto_por_video: TECTO_POR_VIDEO_SEGUNDOS,
    p_limite_diario_kz: LIMITE_DIARIO_KZ,
    p_kz_por_segundo: KZ_POR_SEGUNDO_CREDITADO,
  });

  if (error) {
    return NextResponse.json({ error: 'Não foi possível creditar o tempo' }, { status: 500 });
  }

  const linha = resultado?.[0];
  return NextResponse.json({
    credited: linha?.credited ?? 0,
    capped: linha?.capped ?? false,
    daily_cap_reached: linha?.daily_cap_reached ?? false,
  });
}
