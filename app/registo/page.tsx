'use client';
// Cadastro com escolha entre email OU telefone como identificador
// principal — cada um continua único por conta (colunas email/phone
// têm UNIQUE na base de dados), a pessoa só precisa de escolher um.
// Verificação por SMS exige provedor configurado no Supabase (Auth >
// Providers > Phone) — ver README.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { gerarFingerprint } from '@/lib/fingerprint';

type Metodo = 'email' | 'telefone';

export default function RegistoPage() {
  const [metodo, setMetodo] = useState<Metodo>('email');
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [codigoSms, setCodigoSms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function registarFingerprintERedirecionar() {
    try {
      const fp = await gerarFingerprint();
      await fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp }),
      });
    } catch {
      // sinal extra, não bloqueia o fluxo se falhar
    }
    router.push('/');
    router.refresh();
  }

  // O perfil em public.profiles é criado automaticamente por um
  // trigger no servidor assim que a conta nasce no Supabase Auth
  // (ver migration 0006) — display_name vem de raw_user_meta_data,
  // passado como "options.data" nas chamadas a signUp() abaixo.
  // Não é preciso (nem seguro) inserir isso pelo cliente do browser.

  // --- Fluxo por EMAIL (senha + confirmação por email do Supabase) ---
  async function handleSignupEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (signUpError || !data.user) {
      setLoading(false);
      setError(signUpError?.message ?? 'Não foi possível criar a conta.');
      return;
    }

    setLoading(false);
    await registarFingerprintERedirecionar();
  }

  // --- Fluxo por TELEFONE (senha + código SMS, em duas etapas) ---
  async function handleSignupTelefoneEtapa1(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({
      phone: telefone,
      password,
      options: { data: { display_name: displayName } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message ?? 'Não foi possível enviar o SMS. Confirma o número.');
      return;
    }
    setEtapa(2);
  }

  async function confirmarCodigoSms(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: telefone,
      token: codigoSms,
      type: 'sms',
    });

    if (verifyError || !data.user) {
      setLoading(false);
      setError('Código incorrecto.');
      return;
    }

    // O trigger já criou o perfil (ver migration 0006); aqui só falta
    // marcar phone_verified=true, agora que a sessão já está activa.
    await supabase.from('profiles').update({ phone_verified: true }).eq('id', data.user.id);

    setLoading(false);
    await registarFingerprintERedirecionar();
  }

  if (metodo === 'telefone' && etapa === 2) {
    return (
      <main className="auth-page">
        <form onSubmit={confirmarCodigoSms} className="auth-form">
          <h1>Confirma o código</h1>
          <p>Enviámos um SMS para {telefone}.</p>
          <input
            type="text"
            placeholder="Código de 6 dígitos"
            value={codigoSms}
            onChange={(e) => setCodigoSms(e.target.value)}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? '...' : 'Confirmar'}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form
        onSubmit={metodo === 'email' ? handleSignupEmail : handleSignupTelefoneEtapa1}
        className="auth-form"
      >
        <h1>Criar conta</h1>

        <div className="auth-toggle" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setMetodo('email')}
            style={{ fontWeight: metodo === 'email' ? 700 : 400 }}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setMetodo('telefone')}
            style={{ fontWeight: metodo === 'telefone' ? 700 : 400 }}
          >
            Telefone
          </button>
        </div>

        <input
          type="text"
          placeholder="Nome"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          required
        />

        {metodo === 'email' ? (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        ) : (
          <input
            type="tel"
            placeholder="+244 9XX XXX XXX"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
          />
        )}

        <input
          type="password"
          placeholder="Senha (mín. 6 caracteres)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'A criar conta...' : metodo === 'email' ? 'Criar conta' : 'Enviar SMS'}
        </button>
        <a href="/login">Já tem conta? Entrar</a>
      </form>
    </main>
  );
}
