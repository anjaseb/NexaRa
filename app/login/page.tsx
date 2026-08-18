'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gerarFingerprint } from '@/lib/fingerprint';

type Metodo = 'email' | 'telefone';

export default function LoginPage() {
  const [metodo, setMetodo] = useState<Metodo>('email');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // O login e o rate limit acontecem juntos, na mesma rota do
    // servidor (ver app/api/auth/login/route.ts) — assim ninguém
    // que use o nosso formulário consegue pular a checagem de
    // tentativas chamando só uma parte do fluxo.
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        metodo === 'email' ? { email, password } : { phone: telefone, password }
      ),
    });
    const data = await resp.json();

    if (!resp.ok) {
      setLoading(false);
      setError(data.error ?? 'Não foi possível entrar.');
      return;
    }

    // Regista/actualiza o fingerprint a cada login (não só no cadastro),
    // para apanhar o caso de a mesma conta ser usada em vários dispositivos
    try {
      const fp = await gerarFingerprint();
      await fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp }),
      });
    } catch {
      // Não bloqueia o login se o fingerprint falhar — é um sinal extra, não um requisito
    }

    setLoading(false);
    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-page">
      <form onSubmit={handleLogin} className="auth-form">
        <h1>Entrar</h1>
        <div className="auth-toggle" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setMetodo('email')} style={{ fontWeight: metodo === 'email' ? 700 : 400 }}>
            Email
          </button>
          <button type="button" onClick={() => setMetodo('telefone')} style={{ fontWeight: metodo === 'telefone' ? 700 : 400 }}>
            Telefone
          </button>
        </div>
        {metodo === 'email' ? (
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        ) : (
          <input type="tel" placeholder="+244 9XX XXX XXX" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
        )}
        <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'A entrar...' : 'Entrar'}</button>
        <a href="/registo">Não tem conta? Regista-te</a>
      </form>
    </main>
  );
}
