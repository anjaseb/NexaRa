// As consultas do admin usam o cliente de serviço (service role), porque
// as políticas de RLS destas tabelas só permitem que cada usuário veja
// os seus PRÓPRIOS dados — um admin autenticado normalmente NÃO veria
// as contas/assinaturas de outras pessoas sem isto (falha encontrada
// na revisão: as páginas antigas usavam o cliente de sessão comum e
// ficavam sempre vazias ou incompletas para o admin).
import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function AdminHomePage() {
  const check = await requireAdmin();
  if (!check.ok) redirect('/admin/mfa');

  const admin = createAdminClient();

  const { count: totalUsuarios } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const { count: assinantesAtivos } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_subscriber', true);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const { count: videosHoje } = await admin
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', hoje.toISOString());

  // Receita do mês: soma dos planos das assinaturas confirmadas
  // (status "active") desde o início do mês corrente
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);
  const { data: assinaturasDoMes } = await admin
    .from('subscriptions')
    .select('plan_kz')
    .eq('status', 'active')
    .gte('created_at', inicioDoMes.toISOString());
  const receitaDoMes = assinaturasDoMes?.reduce((soma, s) => soma + s.plan_kz, 0) ?? 0;

  // Ranking de criadores por tempo assistido gerado (regra da spec, secção 10)
  const { data: videosComCriador } = await admin
    .from('videos')
    .select('creator_id, total_watch_seconds, profiles(display_name, email)')
    .order('total_watch_seconds', { ascending: false })
    .limit(200);

  const porCriador = new Map<string, { nome: string; segundos: number }>();
  videosComCriador?.forEach((v: any) => {
    const atual = porCriador.get(v.creator_id) ?? {
      nome: v.profiles?.display_name ?? v.profiles?.email ?? '—',
      segundos: 0,
    };
    atual.segundos += v.total_watch_seconds;
    porCriador.set(v.creator_id, atual);
  });
  const ranking = [...porCriador.values()]
    .sort((a, b) => b.segundos - a.segundos)
    .slice(0, 10);

  return (
    <main className="page">
      <h1>Painel administrativo</h1>
      <div className="card"><p>Usuários totais</p><p className="stat-big">{totalUsuarios}</p></div>
      <div className="card"><p>Assinantes ativos</p><p className="stat-big">{assinantesAtivos}</p></div>
      <div className="card"><p>Vídeos publicados hoje</p><p className="stat-big">{videosHoje}</p></div>
      <div className="card"><p>Receita do mês</p><p className="stat-big">{receitaDoMes} Kz</p></div>

      <div className="card">
        <p>Ranking de criadores (tempo assistido)</p>
        {ranking.length ? (
          <table>
            <thead><tr><th>Criador</th><th>Min. assistidos</th></tr></thead>
            <tbody>
              {ranking.map((c, i) => (
                <tr key={i}>
                  <td>{c.nome}</td>
                  <td>{Math.floor(c.segundos / 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Ainda sem dados.</p>
        )}
      </div>

      <nav style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <a href="/admin/assinaturas">Assinaturas pendentes</a>
        <a href="/admin/saques">Saques</a>
        <a href="/admin/alertas">Alertas</a>
      </nav>
    </main>
  );
}
