// Confirma que quem está a chamar uma rota administrativa é mesmo um
// admin autenticado com MFA activo (AAL2) — corrige a falha em que
// qualquer usuário logado conseguia abrir /admin.
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function requireAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: 'Não autenticado' };
  }

  // Exige segundo factor (TOTP) activo para qualquer acção administrativa
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    return { ok: false, status: 401, error: 'Verificação em duas etapas exigida' };
  }

  // Lê is_admin com o cliente de serviço (nunca confiar na política de
  // RLS "perfis visiveis a todos" para decidir permissão administrativa)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return { ok: false, status: 403, error: 'Sem permissão de administrador' };
  }

  return { ok: true, userId: user.id };
}
