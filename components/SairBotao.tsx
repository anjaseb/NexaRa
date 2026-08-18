'use client';
// Encerra a sessão de verdade: limpa a sessão activa no servidor
// (regra da spec — sair antes dos 6 min reinicia o aquecimento) e
// só depois faz o signOut do Supabase Auth.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SairBotao() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function sair() {
    setLoading(true);
    await fetch('/api/session/end', { method: 'POST' }).catch(() => {});
    await supabase.auth.signOut();
    setLoading(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      disabled={loading}
      style={{ background: 'transparent', color: 'var(--cor-texto-fraco)', marginTop: 24 }}
    >
      {loading ? '...' : 'Sair'}
    </button>
  );
}
