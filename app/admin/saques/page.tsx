import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import ProcessarSaqueBotao from '@/components/ProcessarSaqueBotao';

export default async function SaquesPage() {
  const check = await requireAdmin();
  if (!check.ok) redirect('/admin/mfa');

  const admin = createAdminClient();
  const { data: saques } = await admin
    .from('withdrawals')
    .select('*, profiles(display_name, email, mcx_express_number)')
    .in('status', ['pending', 'processing'])
    .order('requested_at', { ascending: true });

  return (
    <main className="page">
      <h1>Pedidos de saque</h1>
      <table>
        <thead><tr><th>Usuário</th><th>Valor</th><th>Pedido em</th><th></th></tr></thead>
        <tbody>
          {saques?.map((s) => {
            const horasDesdeOPedido = (Date.now() - new Date(s.requested_at).getTime()) / 3_600_000;
            const dentroDaJanela = horasDesdeOPedido < 24;
            return (
              <tr key={s.id}>
                <td>{s.profiles?.display_name ?? s.profiles?.email}</td>
                <td>{s.amount_kz} Kz</td>
                <td>{new Date(s.requested_at).toLocaleString('pt-AO')}</td>
                <td><ProcessarSaqueBotao withdrawalId={s.id} podeProcessar={!dentroDaJanela} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!saques?.length && <p>Nenhum saque pendente.</p>}
    </main>
  );
}
