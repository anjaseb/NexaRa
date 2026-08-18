'use client';
// Chama /api/admin/process-withdrawal (service role + admin+MFA real,
// com verificação atómica de estado "pending" para nunca pagar duas vezes)
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProcessarSaqueBotao({
  withdrawalId,
  podeProcessar,
}: {
  withdrawalId: string;
  podeProcessar: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function processar() {
    setLoading(true);
    setErro(null);
    const resp = await fetch('/api/admin/process-withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawal_id: withdrawalId }),
    });
    setLoading(false);
    if (!resp.ok) {
      const dados = await resp.json();
      setErro(dados.error ?? 'Falha ao processar');
      return;
    }
    router.refresh();
  }

  if (!podeProcessar) {
    return <span style={{ color: 'var(--cor-texto-fraco)' }}>Dentro da janela de 24h</span>;
  }

  return (
    <div>
      <button onClick={processar} disabled={loading}>
        {loading ? '...' : 'Marcar como pago'}
      </button>
      {erro && <span style={{ color: 'red', marginLeft: 8 }}>{erro}</span>}
    </div>
  );
}
