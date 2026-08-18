'use client';
import { useEffect, useRef, useState } from 'react';
import FeedItem from '@/components/FeedItem';
import AdSenseUnit from '@/components/AdSenseUnit';
import { useHeartbeat } from '@/lib/useHeartbeat';

const VIDEOS_A_PRE_CARREGAR = 3;

export default function FeedClient({
  feed,
  isSubscriber,
  loggedIn,
  precisaVerificar,
}: {
  feed: any[];
  isSubscriber: boolean;
  loggedIn: boolean;
  precisaVerificar?: boolean;
}) {
  const [indice, setIndice] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useHeartbeat(loggedIn);

  // Pré-carregamento silencioso dos próximos N vídeos (estilo TikTok) —
  // usa elementos <video> escondidos só para forçar o browser a fazer
  // buffer do ficheiro; cancela automaticamente se o usuário avançar
  // rápido, porque só mantemos os próximos 3 a partir do índice actual.
  useEffect(() => {
    const preloadEls: HTMLVideoElement[] = [];
    for (let i = 1; i <= VIDEOS_A_PRE_CARREGAR; i++) {
      const proximo = feed[indice + i];
      if (!proximo?.signed_url) continue;
      const v = document.createElement('video');
      v.src = proximo.signed_url;
      v.preload = 'auto';
      v.muted = true;
      v.style.display = 'none';
      document.body.appendChild(v);
      preloadEls.push(v);
    }
    return () => {
      preloadEls.forEach((v) => {
        v.src = '';
        v.remove();
      });
    };
  }, [indice, feed]);

  function onWheelOuTouch(direcao: 1 | -1) {
    setIndice((i) => Math.min(feed.length - 1, Math.max(0, i + direcao)));
  }

  useEffect(() => {
    let startY = 0;
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      startY = e.touches[0].clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dy) > 60) onWheelOuTouch(dy < 0 ? 1 : -1);
    }
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.length]);

  if (feed.length === 0) {
    return (
      <main className="feed">
        <div className="feed-item">
          <p>Ainda não há vídeos. Sê o primeiro a publicar.</p>
        </div>
      </main>
    );
  }

  const video = feed[indice];

  return (
    <main className="feed" ref={containerRef}>
      {loggedIn && precisaVerificar && (
        <div className="verify-banner" style={{ position: 'absolute', top: 60, left: 16, right: 16, zIndex: 30 }}>
          Confirma o teu email ou telefone para poderes publicar e assinar.
        </div>
      )}
      <FeedItem key={video.id} video={video} activo />
      {isSubscriber && (indice + 1) % 5 === 0 && (
        <div className="feed-item" style={{ background: '#0a0a0a' }}>
          <AdSenseUnit slot="0000000000" />
        </div>
      )}
    </main>
  );
}
