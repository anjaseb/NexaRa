-- ============================================================
-- NEXARA — Correções da revisão de segurança (quarta ronda)
-- Rodar depois de 0005_correcoes_seguranca.sql
-- ============================================================

-- ------------------------------------------------------------
-- BUG CRÍTICO: public.profiles nunca teve política de RLS de
-- INSERT em nenhuma migração anterior. O cadastro (app/registo)
-- criava a conta no Supabase Auth com sucesso e DEPOIS tentava
-- inserir a linha em profiles usando o cliente do browser — sem
-- política de insert, essa escrita era sempre bloqueada pela RLS
-- (e o erro nem era verificado no código, então falhava em
-- silêncio). Resultado: toda conta nova ficava sem perfil, e
-- quase tudo depende dessa linha existir (middleware, upload,
-- watch-time, feed, assinatura).
--
-- Há ainda um problema adicional em inserir pelo cliente do
-- browser mesmo com a política corrigida: se a confirmação de
-- email estiver ativada no projecto Supabase, signUp() não deixa
-- uma sessão activa até o email ser confirmado — nesse caso
-- auth.uid() fica nulo no momento do insert, e a política falha
-- de qualquer forma, mesmo estando correta.
--
-- A solução correta (e o padrão recomendado pelo próprio
-- Supabase) é um trigger em auth.users que cria o perfil no
-- servidor, independente de sessão ou RLS — o mesmo padrão já
-- usado em 0003 para sincronizar email_verified.
-- ------------------------------------------------------------
create or replace function public.criar_perfil_novo_usuario()
returns trigger as $$
begin
  insert into public.profiles (id, email, phone, display_name)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email, new.phone, 'usuario'), '@', 1)
    )
  )
  on conflict (id) do nothing; -- idempotente, caso o trigger corra mais que uma vez
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_criar_perfil_novo_usuario
after insert on auth.users
for each row execute function public.criar_perfil_novo_usuario();

-- Rede de segurança: mantém também a política de RLS correta,
-- para qualquer código que no futuro precise inserir em profiles
-- pelo cliente do browser (ex: correção manual, ferramenta admin
-- futura que não use service role).
create policy "usuario cria seu perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- NOTA IMPORTANTE PARA CONTAS JÁ CRIADAS ANTES DESTA MIGRAÇÃO:
-- o trigger só corre para contas novas a partir de agora. Se já
-- testaste o cadastro antes desta correção, essas contas ficaram
-- sem perfil e precisam de uma linha criada manualmente. Corre
-- isto (ou o que for aplicável) depois desta migração:
--
--   insert into public.profiles (id, email, phone, display_name)
--   select u.id, u.email, u.phone, coalesce(u.raw_user_meta_data->>'display_name', 'Usuário')
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.id is null;
-- ------------------------------------------------------------
