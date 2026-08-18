// Admin remove um vídeo denunciado — apaga o ficheiro do storage e a
// linha do banco (comentários e denúncias apagam em cascata).
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { video_id } = await request.json();
  const admin = createAdminClient();

  const { data: video } = await admin
    .from('videos')
    .select('storage_path')
    .eq('id', video_id)
    .single();

  if (!video) {
    return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  }

  await admin.storage.from('videos').remove([video.storage_path]);
  await admin.from('videos').delete().eq('id', video_id);

  return NextResponse.json({ ok: true });
}
