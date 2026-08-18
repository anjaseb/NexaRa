'use client';
// Bloco de anúncio real do AdSense. Só é chamado para usuários
// assinantes (free não vê anúncio — regra da tua tabela de monetização).
// Antes da aprovação do Google, isto renderiza um espaço vazio
// (sem quebrar o layout), porque o adsbygoogle.js só existe depois
// da key estar preenchida em NEXT_PUBLIC_ADSENSE_CLIENT_ID.
import { useEffect } from 'react';

export default function AdSenseUnit({ slot }: { slot: string }) {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  useEffect(() => {
    if (!adsenseId) return;
    try {
      // @ts-ignore — adsbygoogle é injetado pelo script externo do Google
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error', e);
    }
  }, [adsenseId]);

  if (!adsenseId) return null; // ainda não aprovado — não renderiza nada

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={adsenseId}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
