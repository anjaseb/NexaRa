'use client';
// Painel esquerdo (regra da spec, secção 4): nome/avatar do criador,
// e "guardar" — só visível se o usuário logado for o dono do vídeo.
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export default function LeftPanel({
  video,
  onClose,
}: {
  video: any;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [souODono, setSouODono] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSouODono(data.user?.id === video.creator_id);
    });
  }, [video.creator_id]);

  async function guardar() {
    setAGuardar(true);
    try {
      // Baixa o ficheiro original (o criador tem permissão via RLS
      // do bucket, porque é dono do storage_path)
      const { data, error } = await supabase.storage
        .from('videos')
        .download(video.storage_path);
      if (error || !data) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexara-${video.id}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Não foi possível guardar o vídeo.');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <div className="side-panel" onClick={onClose}>
      <div className="side-panel-content" onClick={(e) => e.stopPropagation()}>
        <button className="side-panel-close" onClick={onClose}>✕</button>

        <div className="creator-row">
          {video.profiles?.avatar_url ? (
            <img src={video.profiles.avatar_url} alt="" className="avatar" />
          ) : (
            <div className="avatar avatar-placeholder">
              {(video.profiles?.display_name ?? '?')[0]?.toUpperCase()}
            </div>
          )}
          <p>{video.profiles?.display_name ?? 'Usuário'}</p>
        </div>

        {souODono && (
          <button onClick={guardar} disabled={aGuardar}>
            {aGuardar ? 'A guardar...' : 'Guardar vídeo'}
          </button>
        )}
      </div>
    </div>
  );
}
