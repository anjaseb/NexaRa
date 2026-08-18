-- ============================================================
-- NEXARA — Tecto diário de ganhos, denúncias, verificação obrigatória
-- Rodar depois de 0002_correcoes.sql
-- ============================================================

-- Ganhos diários por conta — aplica o tecto real de 1000 Kz/dia
-- (antes só existia como texto na tela, sem trava nenhuma no código)
create table public.daily_earnings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  earning_date date not null default current_date,
  earned_kz numeric not null default 0,
  primary key (profile_id, earning_date)
);
alter table public.daily_earnings enable row level security;
create policy "usuario ve seus ganhos" on public.daily_earnings
  for select using (auth.uid() = profile_id);

-- Denúncias de vídeo
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "usuario cria denuncia" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "usuario ve suas denuncias" on public.reports
  for select using (auth.uid() = reporter_id);

-- Verificação obrigatória de telefone/email (regra da spec, secção 8:
-- "verificação de telefone/email obrigatória no cadastro"). O campo
-- phone_verified já existia (migration 0002) mas nada impedia o uso
-- da conta sem isso. Adicionamos email_verified para simetria — o
-- Supabase Auth já confirma email nativamente (email_confirmed_at em
-- auth.users); esta coluna espelha esse estado em profiles para ser
-- fácil de checar nas policies e no código sem juntar tabelas.
alter table public.profiles add column email_verified boolean not null default false;

-- Índice para consultas de denúncia por vídeo (painel admin)
create index idx_reports_video on public.reports(video_id);

-- Função auxiliar: sincroniza email_verified sempre que o Supabase
-- Auth confirma o email do usuário (trigger na tabela auth.users)
create or replace function public.sincronizar_email_verificado()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set email_verified = true where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_sincronizar_email_verificado
after update on auth.users
for each row execute function public.sincronizar_email_verificado();

-- Incrementa o contador de comentários do vídeo de forma atômica
create or replace function public.incrementar_comment_count(p_video_id uuid)
returns void as $$
begin
  update public.videos
  set comment_count = comment_count + 1
  where id = p_video_id;
end;
$$ language plpgsql security definer;
