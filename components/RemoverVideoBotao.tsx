'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RemoverVideoBotao({ videoId }: { videoId: string }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function remover() {
    if (!confirm('Remover este vídeo permanentemente?')) return;
    setLoading(true);
    setErro(null);
    const resp = await fetch('/api/admin/remove-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
    });
    setLoading(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.error ?? 'Falha ao remover');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button onClick={remover} disabled={loading}>
        {loading ? '...' : 'Remover vídeo'}
      </button>
      {erro && <span style={{ color: 'red', marginLeft: 8 }}>{erro}</span>}
    </div>
  );
}
