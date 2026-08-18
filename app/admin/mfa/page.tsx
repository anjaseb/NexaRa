'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminMfaPage() {
  const supabase = createClient();
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [temFactorPendente, setTemFactorPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function verificarFactores() {
      const { data } = await supabase.auth.mfa.listFactors();
      const totpVerificado = data?.totp?.find((f) => f.status === 'verified');

      if (totpVerificado) {
        // Já tem TOTP — só falta desafiar (pedir o código de 6 dígitos)
        setFactorId(totpVerificado.id);
        setTemFactorPendente(true);
        return;
      }

      // Ainda não tem — inicia o registo (mostra QR code)
      const { data: enrolData } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrolData) {
        setQrCode(enrolData.totp.qr_code);
        setFactorId(enrolData.id);
      }
    }
    verificarFactores();
  }, [supabase]);

  async function confirmar() {
    if (!factorId) return;
    setErro(null);

    if (temFactorPendente) {
      // Fluxo de desafio (já tinha TOTP configurado nesta conta)
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError || !challenge) {
        setErro('Não foi possível iniciar a verificação.');
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: codigo,
      });
      if (verifyError) {
        setErro('Código incorrecto.');
        return;
      }
    } else {
      // Fluxo de primeiro registo
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge!.id,
        code: codigo,
      });
      if (verifyError) {
        setErro('Código incorrecto — confirma que leste bem o QR code.');
        return;
      }
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-form">
        <h1>Verificação em duas etapas</h1>
        {qrCode && (
          <>
            <p>Lê este QR code com o Google Authenticator ou Authy:</p>
            <img src={qrCode} alt="QR code TOTP" style={{ width: 200, height: 200 }} />
          </>
        )}
        {temFactorPendente && <p>Introduz o código de 6 dígitos da tua app autenticadora.</p>}
        <input
          type="text"
          placeholder="000000"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        {erro && <p className="auth-error">{erro}</p>}
        <button onClick={confirmar}>Confirmar</button>
      </div>
    </main>
  );
}
