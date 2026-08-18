// Cliente Supabase para componentes do lado do browser ("use client")
// Usa a chave pública (anon key) — segura para expor no cliente,
// porque toda a proteção real está nas políticas RLS do banco.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
