'use client';
// Chama a rota /api/admin/confirm-subscription (service role + verificação
// real de admin+MFA), em vez de escrever directamente na base de dados
// com o cliente do browser — a versão anterior falhava silenciosamente
// porque a RLS não permitia a um não-dono editar estas tabelas.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfirmarAssinaturaBotao({
  subscriptionId,
}: {
  subscriptionId: string;
  profileId: string;
  planoKz: number;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function confirmar() {
    setLoading(true);
    setErro(null);
    const resp = await fetch('/api/admin/confirm-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    });
    setLoading(false);
    if (!resp.ok) {
      const dados = await resp.json();
      setErro(dados.error ?? 'Falha ao confirmar');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button onClick={confirmar} disabled={loading}>
        {loading ? '...' : 'Confirmar'}
      </button>
      {erro && <span style={{ color: 'red', marginLeft: 8 }}>{erro}</span>}
    </div>
  );
}
