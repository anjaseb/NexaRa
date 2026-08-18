import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SairBotao from '@/components/SairBotao';
import SolicitarSaqueForm from '@/components/SolicitarSaqueForm';

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Lê o perfil completo (email, phone, mcx_express_number, etc.)
  // através de meu_perfil() — desde a migration 0011, o cliente do
  // browser deixou de ter acesso directo às colunas sensíveis da
  // tabela profiles (ver essa migração para o porquê); esta função
  // devolve só a própria linha, verificado no servidor.
  const { data: profile } = await supabase.rpc('meu_perfil');

  const { data: sessoes } = await supabase
    .from('watch_sessions')
    .select('seconds_credited, video_id, videos(creator_id, profiles(display_name))')
    .eq('viewer_id', user.id);

  const totalSegundosSemana =
    sessoes?.reduce((soma, s) => soma + s.seconds_credited, 0) ?? 0;

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: ganhoHoje } = await supabase
    .from('daily_earnings')
    .select('earned_kz')
    .eq('profile_id', user.id)
    .eq('earning_date', hoje)
    .maybeSingle();
  const kzHoje = Number(ganhoHoje?.earned_kz ?? 0);
  const LIMITE_DIARIO_KZ = 1000;

  // Saldo disponível pra saque = tudo que já foi ganho - tudo que já
  // foi sacado ou está com saque pendente/em processamento
  let saldoDisponivel = 0;
  if (profile?.is_subscriber) {
    const { data: ganhos } = await supabase
      .from('daily_earnings')
      .select('earned_kz')
      .eq('profile_id', user.id);
    const totalGanho = ganhos?.reduce((soma, g) => soma + Number(g.earned_kz), 0) ?? 0;

    const { data: saques } = await supabase
      .from('withdrawals')
      .select('amount_kz')
      .eq('profile_id', user.id)
      .in('status', ['pending', 'processing', 'paid']);
    const totalSacado = saques?.reduce((soma, s) => soma + Number(s.amount_kz), 0) ?? 0;

    saldoDisponivel = totalGanho - totalSacado;
  }

  return (
    <main className="page">
      <h1>Perfil</h1>

      <div className="card">
        <p>Tempo assistido esta semana</p>
        <p className="stat-big">{Math.floor(totalSegundosSemana / 60)} min</p>
      </div>

      <div className="card">
        <p>Pessoas assistidas</p>
        <p>{sessoes?.length ?? 0}</p>
      </div>

      <div className="card">
        <p>Modo ganho</p>
        {profile?.is_subscriber ? (
          <>
            <p>Ativo — plano {profile.subscription_plan} Kz/mês</p>
            <p style={{ marginTop: 8 }}>Ganho hoje</p>
            <p className="stat-big">{kzHoje.toFixed(0)} / {LIMITE_DIARIO_KZ} Kz</p>
            {kzHoje >= LIMITE_DIARIO_KZ && (
              <p style={{ fontSize: 13, color: 'var(--cor-texto-fraco)' }}>
                Tecto diário atingido — volta a contar amanhã.
              </p>
            )}
          </>
        ) : (
          <>
            <p>Ainda não estás no modo ganho.</p>
            <a href="/assinar"><button>Assinar agora</button></a>
          </>
        )}
      </div>

      {profile?.is_subscriber && (
        <SolicitarSaqueForm
          saldoDisponivel={saldoDisponivel}
          mcxAtual={profile.mcx_express_number}
        />
      )}

      <SairBotao />
    </main>
  );
}
