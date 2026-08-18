-- ============================================================
-- NEXARA — Correções da revisão de segurança (sexta ronda)
-- Rodar depois de 0007_corrige_ordem_tecto_diario.sql
-- ============================================================

-- ------------------------------------------------------------
-- BUG CRÍTICO no trigger criado em 0006: public.profiles.phone
-- e public.profiles.email têm UNIQUE. No auth.users do Supabase,
-- o campo que a conta NÃO usou para se registar (ex: "phone" para
-- quem se regista por email) fica frequentemente como STRING
-- VAZIA (''), não NULL — comportamento conhecido do GoTrue (o
-- motor de autenticação por trás do Supabase Auth), documentado
-- em vários relatos da comunidade.
--
-- '' conta como valor igual para efeitos de UNIQUE (NULL não).
-- Então o SEGUNDO usuário a registar-se por email batia num erro
-- de "duplicate key value violates unique constraint" ao tentar
-- inserir phone='' pela segunda vez — e como o trigger corre
-- DEPOIS do insert em auth.users, um erro nele reverte a criação
-- da conta inteira. Ou seja: só a primeira conta por email e a
-- primeira conta por telefone conseguiam completar o registo.
--
-- Corrigido: converte '' para NULL antes de gravar, com nullif().
-- ------------------------------------------------------------
create or replace function public.criar_perfil_novo_usuario()
returns trigger as $$
begin
  insert into public.profiles (id, email, phone, display_name)
  values (
    new.id,
    nullif(new.email, ''),
    nullif(new.phone, ''),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(nullif(new.email, ''), nullif(new.phone, ''), 'usuario'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- O trigger em si (trg_criar_perfil_novo_usuario) não precisa ser
-- recriado — "create or replace function" já actualiza o
-- comportamento para o mesmo trigger existente.

-- ------------------------------------------------------------
-- Se alguém já bateu neste erro antes desta migração (ficou com
-- conta em auth.users mas sem linha em profiles, porque o insert
-- fez rollback), repara manualmente depois de aplicar isto:
--
--   insert into public.profiles (id, email, phone, display_name)
--   select u.id, nullif(u.email, ''), nullif(u.phone, ''),
--          coalesce(u.raw_user_meta_data->>'display_name', 'Usuário')
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.id is null;
-- ------------------------------------------------------------
