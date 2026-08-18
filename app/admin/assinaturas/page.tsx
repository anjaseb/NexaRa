import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import ConfirmarAssinaturaBotao from '@/components/ConfirmarAssinaturaBotao';

export default async function AssinaturasPendentesPage() {
  const check = await requireAdmin();
  if (!check.ok) redirect('/admin/mfa');

  const admin = createAdminClient();
  const { data: pendentes } = await admin
    .from('subscriptions')
    .select('*, profiles(display_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return (
    <main className="page">
      <h1>Assinaturas pendentes</h1>
      <table>
        <thead><tr><th>Usuário</th><th>Plano</th><th>Pedido em</th><th></th></tr></thead>
        <tbody>
          {pendentes?.map((s) => (
            <tr key={s.id}>
              <td>{s.profiles?.display_name ?? s.profiles?.email}</td>
              <td>{s.plan_kz} Kz</td>
              <td>{new Date(s.created_at).toLocaleString('pt-AO')}</td>
              <td><ConfirmarAssinaturaBotao subscriptionId={s.id} profileId={s.profile_id} planoKz={s.plan_kz} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!pendentes?.length && <p>Nenhuma assinatura pendente.</p>}
    </main>
  );
}
