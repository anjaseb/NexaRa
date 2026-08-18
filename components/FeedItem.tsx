'use client';
// Um vídeo dentro do feed. O tempo assistido é reportado ao servidor em
// pequenos incrementos (máx 5s por chamada, ver watch-time/route.ts) —
// a decisão de contar ou não (aquecimento, tecto) é sempre do servidor,
// este componente só informa "o usuário esteve a ver X segundos".
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import LeftPanel from '@/components/LeftPanel';
import CommentsPanel from '@/components/CommentsPanel';

export default function FeedItem({ video, activo }: { video: any; activo: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [viewersAgora, setViewersAgora] = useState(video.viewers_now ?? 0);
  const [painelEsquerdoAberto, setPainelEsquerdoAberto] = useState(false);
  const [comentariosAbertos, setComentariosAbertos] = useState(false);
  const [jaDenunciado, setJaDenunciado] = useState(false);
  const creditedRef = useRef(0);
  const supabase = createClient();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Cache local (Cache API) do vídeo já assistido nas últimas 24h — evita
  // recarregar/regastar dados móveis se o usuário voltar ao mesmo vídeo.
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      const chaveCache = `nexara-video-${video.id}`;
      try {
        const cache = await caches.open('nexara-videos-v1');
        const guardado = await cache.match(chaveCache);
        if (guardado) {
          const blob = await guardado.blob();
          if (!cancelado) setVideoUrl(URL.createObjectURL(blob));
          return;
        }
        if (!video.signed_url) return;
        const resp = await fetch(video.signed_url);
        const clone = resp.clone();
        if (!cancelado) setVideoUrl(URL.createObjectURL(await resp.blob()));
        // Guarda em cache com chave estável (o video.id), ignorando que a
        // signed URL muda a cada geração — a chave de cache é sempre a mesma
        await cache.put(chaveCache, new Response(await clone.blob()));
      } catch {
        // Cache API pode não estar disponível (modo privado, etc.) —
        // usa a signed URL directamente como fallback
        if (!cancelado) setVideoUrl(video.signed_url);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [video.id, video.signed_url]);

  // Contador "assistindo agora" em tempo real via Supabase Realtime Presence
  useEffect(() => {
    const canal = supabase.channel(`video-${video.id}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState();
        setViewersAgora(Object.keys(estado).length);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await canal.track({ entrou_em: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  async function registarTempo(deltaBruto: number) {
    if (deltaBruto <= 0) return;
    const resp = await fetch('/api/watch-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: video.id, delta_seconds: deltaBruto }),
    });
    const dados = await resp.json();
    if (typeof dados.credited === 'number') {
      creditedRef.current += dados.credited;
    }
  }

  useEffect(() => {
    if (!activo) return;
    const el = videoRef.current;
    if (!el) return;

    let ultimoTick = Date.now();
    let acumuladoDesdeUltimoEnvio = 0;

    function onTimeUpdate() {
      const agora = Date.now();
      if (el && !el.paused && document.visibilityState === 'visible') {
        acumuladoDesdeUltimoEnvio += (agora - ultimoTick) / 1000;
      }
      ultimoTick = agora;

      // Envia em pequenos lotes (~2s) em vez de a cada frame — reduz
      // chamadas à API e já respeita o limite de 5s/chamada do servidor
      if (acumuladoDesdeUltimoEnvio >= 2) {
        registarTempo(Math.floor(acumuladoDesdeUltimoEnvio));
        acumuladoDesdeUltimoEnvio = 0;
      }
    }

    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, video.id]);

  async function denunciar() {
    if (jaDenunciado) return;
    const motivo = window.prompt('Motivo da denúncia:');
    if (!motivo?.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    const { error } = await supabase.from('reports').insert({
      video_id: video.id,
      reporter_id: user.id,
      reason: motivo.trim(),
    });

    if (!error) {
      setJaDenunciado(true);
      alert('Denúncia enviada. Obrigado.');
    }
  }

  return (
    <div className="feed-item">
      {videoUrl && (
        <video ref={videoRef} src={videoUrl} autoPlay loop playsInline muted />
      )}

      <div className="feed-overlay-top">
        <span>{viewersAgora} a assistir agora</span>
        <span>{Math.floor(video.total_watch_seconds / 60)} min nas últimas 24h</span>
      </div>

      {video.caption && (
        <div className="feed-overlay-bottom">
          <p>{video.caption}</p>
        </div>
      )}

      <div className="feed-side-actions">
        <button title="Criador" onClick={() => setPainelEsquerdoAberto(true)}>👤</button>
        <button title="Comentários" onClick={() => setComentariosAbertos(true)}>
          💬 {video.comment_count}
        </button>
        <button title="Partilhar" onClick={() => partilhar(video.share_token)}>↗</button>
        <button title="Denunciar" onClick={denunciar} disabled={jaDenunciado}>
          {jaDenunciado ? '✓' : '⚑'}
        </button>
      </div>

      {painelEsquerdoAberto && (
        <LeftPanel video={video} onClose={() => setPainelEsquerdoAberto(false)} />
      )}
      {comentariosAbertos && (
        <CommentsPanel videoId={video.id} onClose={() => setComentariosAbertos(false)} />
      )}
    </div>
  );
}

function partilhar(token: string) {
  const url = `${window.location.origin}/w/${token}`;
  if (navigator.share) {
    navigator.share({ url });
  } else {
    navigator.clipboard.writeText(url);
    alert('Link copiado (válido por 24h)');
  }
}
