import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import RemoverVideoBotao from '@/components/RemoverVideoBotao';

export default async function AlertasPage() {
  const check = await requireAdmin();
  if (!check.ok) redirect('/admin/mfa');

  const admin = createAdminClient();

  const { data: fingerprintsSuspeitos } = await admin
    .from('device_fingerprints')
    .select('fingerprint, profile_id, profiles(display_name, email)')
    .eq('flagged_suspicious', true);

  const { data: denuncias } = await admin
    .from('reports')
    .select('id, reason, created_at, video_id, videos(caption, creator_id, profiles(display_name))')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <main className="page">
      <h1>Alertas de segurança</h1>

      <div className="card">
        <p>Denúncias de vídeo</p>
        {denuncias?.length ? (
          <table>
            <thead><tr><th>Criador</th><th>Motivo</th><th></th></tr></thead>
            <tbody>
              {denuncias.map((d: any) => (
                <tr key={d.id}>
                  <td>{d.videos?.profiles?.display_name ?? '—'}</td>
                  <td>{d.reason}</td>
                  <td><RemoverVideoBotao videoId={d.video_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nenhuma denúncia no momento.</p>
        )}
      </div>

      <div className="card">
        <p>Fingerprints sinalizados (possível farm de contas)</p>
        {fingerprintsSuspeitos?.length ? (
          <table>
            <thead><tr><th>Fingerprint</th><th>Conta</th></tr></thead>
            <tbody>
              {fingerprintsSuspeitos.map((f: any) => (
                <tr key={f.profile_id}>
                  <td>{f.fingerprint.slice(0, 10)}...</td>
                  <td>{f.profiles?.display_name ?? f.profiles?.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nenhum alerta no momento.</p>
        )}
      </div>
    </main>
  );
}
