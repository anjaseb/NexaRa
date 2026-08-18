'use client';
// Painel de comentários — expira junto com o vídeo (a linha some
// automaticamente porque a foreign key tem "on delete cascade").
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CommentsPanel({
  videoId,
  onClose,
}: {
  videoId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles(display_name)')
      .eq('video_id', videoId)
      .order('created_at', { ascending: true });
    setComentarios(data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    const { error } = await supabase.from('comments').insert({
      video_id: videoId,
      author_id: user.id,
      content: texto.trim(),
    });

    if (!error) {
      await supabase.rpc('incrementar_comment_count', { p_video_id: videoId });
      setTexto('');
      await carregar();
    }
    setEnviando(false);
  }

  return (
    <div className="side-panel" onClick={onClose}>
      <div className="comments-panel-content" onClick={(e) => e.stopPropagation()}>
        <button className="side-panel-close" onClick={onClose}>✕</button>
        <h3>Comentários</h3>

        <div className="comments-list">
          {carregando && <p>A carregar...</p>}
          {!carregando && comentarios.length === 0 && <p>Sê o primeiro a comentar.</p>}
          {comentarios.map((c) => (
            <div key={c.id} className="comment-row">
              <strong>{c.profiles?.display_name ?? 'Usuário'}</strong>
              <p>{c.content}</p>
            </div>
          ))}
        </div>

        <form onSubmit={enviar} className="comments-form">
          <input
            type="text"
            placeholder="Escreve um comentário..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={280}
          />
          <button type="submit" disabled={enviando || !texto.trim()}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
