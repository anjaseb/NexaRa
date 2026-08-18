// Cliente com a chave de serviço (service role) — ignora RLS completamente.
// NUNCA importar isto num componente "use client".
// Só usar dentro de app/api/**/route.ts, e sempre validando antes
// que quem chamou é realmente um admin (ver lib/auth.ts).
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
