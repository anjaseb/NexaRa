-- ============================================================
-- NEXARA — Correções da revisão de segurança (oitava ronda)
-- Rodar depois de 0009_atomicidade_webhook_pagamento.sql
-- ============================================================

-- ------------------------------------------------------------
-- Limites de tamanho existiam SÓ no HTML (maxLength no <input>),
-- nunca na base de dados. Qualquer pessoa com o devtools aberto
-- pode chamar supabase.from('comments').insert(...) directamente
-- com o token de sessão dela — a RLS já impede escrever em nome
-- de outra conta, mas nunca limitou o TAMANHO do conteúdo. Sem
-- limite no servidor, um comentário (ou nome de perfil) podia ter
-- megabytes de texto: abuso de armazenamento e potencial de
-- quebrar o layout de quem visse esse conteúdo.
--
-- content not null já existia; falta o limite de tamanho.
-- ------------------------------------------------------------
alter table public.comments
  add constraint comments_content_tamanho
  check (char_length(content) > 0 and char_length(content) <= 280);

alter table public.profiles
  add constraint profiles_display_name_tamanho
  check (display_name is null or char_length(display_name) <= 60);

-- ------------------------------------------------------------
-- A constraint acima protege escritas vindas do cliente do browser
-- (ex: alguém editando o próprio perfil no futuro), mas o trigger de
-- criação de perfil (migration 0006) grava display_name a partir de
-- raw_user_meta_data, que vem do signUp() e não é validado em lado
-- nenhum antes disso. Sem truncar aqui, um display_name gigante
-- enviado no cadastro faria o INSERT falhar na constraint — e por
-- ser um trigger after insert em auth.users, isso reverteria a
-- criação da conta inteira. O mesmo tipo de problema que a migração
-- 0008 corrigiu para email/phone vazios.
-- ------------------------------------------------------------
create or replace function public.criar_perfil_novo_usuario()
returns trigger as $$
begin
  insert into public.profiles (id, email, phone, display_name)
  values (
    new.id,
    nullif(new.email, ''),
    nullif(new.phone, ''),
    left(
      coalesce(
        nullif(new.raw_user_meta_data->>'display_name', ''),
        split_part(coalesce(nullif(new.email, ''), nullif(new.phone, ''), 'usuario'), '@', 1)
      ),
      60
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
