-- ============================================================
-- NEXARA — Correções da revisão de segurança (nona ronda)
-- Rodar depois de 0010_limites_tamanho_texto.sql
-- ============================================================

-- ------------------------------------------------------------
-- BUG MAIS GRAVE DE TODA A REVISÃO: public.profiles tinha uma
-- única política de SELECT, "using (true)" — ou seja, QUALQUER
-- linha é visível para quem quer que satisfaça essa política
-- (todos). RLS no Postgres controla LINHAS, não COLUNAS — então
-- "using (true)" não só deixa ver o display_name/avatar_url
-- (o que era a intenção, para aparecer no feed/comentários), como
-- deixa ler email, phone e mcx_express_number (dado financeiro)
-- de QUALQUER usuário, directamente pela API REST do Supabase,
-- sem passar pela interface da app.
--
-- Correcção em duas partes:
--
-- 1) Troca a permissão ao nível da TABELA por permissão ao nível
--    das COLUNAS: anon/authenticated só podem seleccionar as
--    colunas genuinamente públicas (id, display_name, avatar_url,
--    is_subscriber, created_at) — exactamente o que o feed, os
--    comentários e o painel esquerdo já mostravam. As colunas
--    sensíveis deixam de estar acessíveis por SELECT directo, para
--    qualquer linha, mesmo a própria.
--
-- 2) Como o dono da conta continua a precisar de ler o PRÓPRIO
--    perfil completo (a página /perfil, a verificação de telefone/
--    email antes de publicar, etc.), cria-se a função
--    meu_perfil() — a segurança de uma função SECURITY DEFINER
--    depende dos privilégios de quem a criou, não de quem a chama,
--    por isso continua a funcionar mesmo sem grant de coluna do
--    lado do chamador. O "where id = auth.uid()" dentro da função
--    garante que ninguém consegue usá-la para ler o perfil de
--    outra pessoa — só o próprio.
-- ------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;

grant select (id, display_name, avatar_url, is_subscriber, created_at)
  on public.profiles to anon, authenticated;

create or replace function public.meu_perfil()
returns public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from public.profiles where id = auth.uid();
$$;

grant execute on function public.meu_perfil() to authenticated;

-- ------------------------------------------------------------
-- NOTA: as políticas de RLS "perfis visiveis a todos" (select) e
-- "usuario edita o proprio perfil" (update) continuam a existir e
-- não precisam de mudar — o UPDATE do próprio perfil (ex: guardar
-- mcx_express_number) não é afectado por este revoke, que é só de
-- SELECT. A política de select "using(true)" também não precisa
-- de mudar, porque agora é a permissão de coluna que decide o que
-- é visível, não a política de linha.
-- ------------------------------------------------------------
