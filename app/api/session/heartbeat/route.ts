// Chamado a cada ~10s pelo cliente enquanto a aba está visível e activa
// (ver hook useHeartbeat). Isto é o que substitui o "proxy" errado do
// código anterior — agora medimos o tempo real decorrido no servidor,
// não o tempo já creditado.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Upsert atómico em vez de "ler para ver se existe, depois decidir
  // insert ou update" — a versão anterior tinha uma pequena corrida:
  // duas chamadas quase simultâneas (ex: duas abas abertas ao mesmo
  // tempo) podiam ambas ler "não existe" e uma delas falhar ao tentar
  // inserir (profile_id é chave primária). O ON CONFLICT resolve isso
  // numa única operação, e "started_at" só é definido na primeira vez
  // (não é sobrescrito em updates seguintes) via a cláusula abaixo.
  const { data: sessao, error } = await supabase
    .from('active_sessions')
    .upsert(
      { profile_id: user.id, last_heartbeat_at: new Date().toISOString() },
      { onConflict: 'profile_id', ignoreDuplicates: false }
    )
    .select('started_at')
    .single();

  if (error || !sessao) {
    return NextResponse.json({ error: 'Não foi possível registar o heartbeat' }, { status: 500 });
  }

  const segundosDeSessao = Math.floor(
    (Date.now() - new Date(sessao.started_at).getTime()) / 1000
  );

  return NextResponse.json({ segundos_de_sessao: segundosDeSessao });
}
