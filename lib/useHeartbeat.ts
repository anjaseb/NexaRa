'use client';
import { useEffect } from 'react';

// Mantém a sessão activa "viva" no servidor enquanto a aba está visível
// e em primeiro plano — só sessões realmente activas contam para o
// aquecimento de 6 minutos (spec secção 9). Minimizar ou trocar de aba
// pausa o heartbeat; se passar 25s sem um heartbeat novo, o servidor
// (ver app/api/watch-time/route.ts) considera a continuidade quebrada
// e reinicia o aquecimento — isso é checado de verdade, não é só teoria.
export function useHeartbeat(activo: boolean) {
  useEffect(() => {
    if (!activo) return;

    function enviar() {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => {});
    }

    enviar();
    const intervalo = setInterval(enviar, 10_000);

    function aoSair() {
      navigator.sendBeacon?.('/api/session/end');
    }
    window.addEventListener('beforeunload', aoSair);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('beforeunload', aoSair);
    };
  }, [activo]);
}
