'use client';
// Formulário de saque: primeiro garante que o número Multicaixa Express
// está configurado (regra da spec: dado só pedido ao activar modo ganho,
// não no cadastro, pra não gerar fricção desnecessária), depois permite
// pedir o saque em si. O saldo real é sempre recalculado no servidor.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SolicitarSaqueForm({
  saldoDisponivel,
  mcxAtual,
}: {
  saldoDisponivel: number;
  mcxAtual: string | null;
}) {
  const [mcx, setMcx] = useState(mcxAtual ?? '');
  const [valor, setValor] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function guardarMcx(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ mcx_express_number: mcx.trim() })
      .eq('id', user.id);

    setLoading(false);
    if (error) {
      setErro('Não foi possível guardar o número.');
      return;
    }
    router.refresh();
  }

  async function pedirSaque(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    setMensagem(null);

    const resp = await fetch('/api/withdrawals/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_kz: Number(valor) }),
    });
    const dados = await resp.json();

    setLoading(false);
    if (!resp.ok) {
      setErro(dados.error ?? 'Não foi possível pedir o saque.');
      return;
    }
    setMensagem('Pedido de saque criado! Fica pendente por 24-48h antes de ser processado.');
    setValor('');
    router.refresh();
  }

  if (!mcxAtual) {
    return (
      <form onSubmit={guardarMcx} className="card">
        <p>Configura o teu número Multicaixa Express para poderes sacar</p>
        <input
          type="text"
          placeholder="9XX XXX XXX"
          value={mcx}
          onChange={(e) => setMcx(e.target.value)}
          required
        />
        {erro && <p className="auth-error">{erro}</p>}
        <button type="submit" disabled={loading}>{loading ? '...' : 'Guardar número'}</button>
      </form>
    );
  }

  return (
    <form onSubmit={pedirSaque} className="card">
      <p>Saldo disponível para saque</p>
      <p className="stat-big">{saldoDisponivel.toFixed(0)} Kz</p>
      <input
        type="number"
        placeholder="Valor a sacar (mín. 2000 Kz)"
        min={2000}
        max={saldoDisponivel}
        step={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        required
      />
      {erro && <p className="auth-error">{erro}</p>}
      {mensagem && <p style={{ color: 'var(--cor-texto-fraco)', fontSize: 14 }}>{mensagem}</p>}
      <button type="submit" disabled={loading || saldoDisponivel < 2000}>
        {loading ? '...' : 'Pedir saque'}
      </button>
    </form>
  );
}
