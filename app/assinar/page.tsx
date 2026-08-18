'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const PLANOS = [500, 1000];

export default function AssinarPage() {
  const [loading, setLoading] = useState<number | null>(null);
  const [feito, setFeito] = useState(false);
  const [verificado, setVerificado] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function checar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      const { data: perfil } = await supabase.rpc('meu_perfil');
      setVerificado(Boolean(perfil?.email_verified || perfil?.phone_verified));
    }
    checar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function assinar(plano: number) {
    setLoading(plano);
    setErro(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    if (!verificado) {
      setLoading(null);
      setErro('Confirma o teu email ou telefone antes de assinar.');
      return;
    }

    // Cria o pedido de assinatura como "pending" — confirmação manual
    // no início (regra da spec), evolui para automática via webhook AppyPay
    await supabase.from('subscriptions').insert({
      profile_id: user.id,
      plan_kz: plano,
      status: 'pending',
    });

    setLoading(null);
    setFeito(true);
  }

  if (feito) {
    return (
      <main className="page">
        <div className="card">
          <p>Pedido registado! Confirma o pagamento pela AppyPay/Multicaixa Express.</p>
          <p>A tua assinatura fica ativa depois da confirmação (até 24h no início, depois automático).</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Modo ganho</h1>
      {verificado === false && (
        <div className="verify-banner">
          Precisas de confirmar o teu email ou telefone antes de assinar.
        </div>
      )}
      {erro && <p className="auth-error">{erro}</p>}
      {PLANOS.map((plano) => (
        <div key={plano} className="card">
          <p className="stat-big">{plano} Kz/mês</p>
          <button
            disabled={loading === plano || verificado === false}
            onClick={() => assinar(plano)}
          >
            {loading === plano ? 'A processar...' : 'Assinar'}
          </button>
        </div>
      ))}
      <p style={{ fontSize: 13, color: 'var(--cor-texto-fraco)' }}>
        Ganho máximo: 1000 Kz/dia por conta.
      </p>
    </main>
  );
}
