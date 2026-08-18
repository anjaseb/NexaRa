-- ============================================================
-- NEXARA — Schema inicial
-- Rodar isto em: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Perfis de usuário (estende auth.users do Supabase)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  email text unique,
  display_name text,
  avatar_url text,
  is_subscriber boolean not null default false,
  subscription_plan integer, -- 500 ou 1000 (Kz)
  subscription_expires_at timestamptz,
  mcx_express_number text, -- só preenchido ao activar modo ganho
  device_fingerprint text,
  account_age_weight numeric not null default 0.3, -- peso reduzido pra contas novas
  created_at timestamptz not null default now()
);

-- Vídeos (expiram em 24h)
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption text, -- legenda opcional, mostrada embaixo da tela
  share_token text unique not null default substr(md5(random()::text), 1, 10),
  duration_seconds integer not null,
  file_size_bytes bigint not null,
  total_watch_seconds bigint not null default 0,
  viewers_now integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- Comentários (expiram junto com o vídeo)
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Registo de tempo assistido (regra: aquecimento 6min, tecto 1min/vídeo)
create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  seconds_credited integer not null default 0, -- máx 60 (1 min) por vídeo
  session_started_at timestamptz not null default now(),
  unique (viewer_id, video_id)
);

-- Fingerprint de dispositivo (até 5 contas por dispositivo)
create table public.device_fingerprints (
  fingerprint text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  flagged_suspicious boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (fingerprint, profile_id)
);

-- Assinaturas (confirmação manual no início, depois via webhook)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_kz integer not null check (plan_kz in (500, 1000)),
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'rejected')),
  payment_reference text,
  confirmed_by uuid references public.profiles(id), -- admin que confirmou manualmente
  created_at timestamptz not null default now()
);

-- Pedidos de saque (janela 24-48h)
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_kz integer not null check (amount_kz >= 2000),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Índices úteis
create index idx_videos_expires_at on public.videos(expires_at);
create index idx_videos_creator on public.videos(creator_id);
create index idx_watch_sessions_video on public.watch_sessions(video_id);
create index idx_fingerprints_fp on public.device_fingerprints(fingerprint);

-- ============================================================
-- ROW LEVEL SECURITY — obrigatório em toda tabela (regra da spec)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.comments enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.device_fingerprints enable row level security;
alter table public.subscriptions enable row level security;
alter table public.withdrawals enable row level security;

-- Perfis: qualquer um vê perfis públicos básicos, só o dono edita o seu
create policy "perfis visiveis a todos" on public.profiles for select using (true);
create policy "usuario edita o proprio perfil" on public.profiles for update using (auth.uid() = id);

-- Vídeos: todos veem vídeos não expirados; só o criador cria/apaga os seus
create policy "videos nao expirados sao visiveis" on public.videos for select using (expires_at > now());
create policy "criador insere seus videos" on public.videos for insert with check (auth.uid() = creator_id);
create policy "criador apaga seus videos" on public.videos for delete using (auth.uid() = creator_id);

-- Comentários: visíveis se o vídeo ainda existe; qualquer usuário autenticado comenta
create policy "comentarios visiveis" on public.comments for select using (true);
create policy "usuario autenticado comenta" on public.comments for insert with check (auth.uid() = author_id);

-- Watch sessions: cada um só vê/insere as suas próprias
create policy "usuario ve suas sessoes" on public.watch_sessions for select using (auth.uid() = viewer_id);
create policy "usuario insere suas sessoes" on public.watch_sessions for insert with check (auth.uid() = viewer_id);
create policy "usuario atualiza suas sessoes" on public.watch_sessions for update using (auth.uid() = viewer_id);

-- Fingerprints: só leitura pelo próprio dono da conta (admin usa service role, ignora RLS)
create policy "usuario ve seu fingerprint" on public.device_fingerprints for select using (auth.uid() = profile_id);

-- Assinaturas: usuário só vê/cria as suas próprias (mais restrito, é dinheiro)
create policy "usuario ve suas assinaturas" on public.subscriptions for select using (auth.uid() = profile_id);
create policy "usuario cria sua assinatura" on public.subscriptions for insert with check (auth.uid() = profile_id);

-- Saques: usuário só vê/cria os seus próprios (mais restrito, é dinheiro)
create policy "usuario ve seus saques" on public.withdrawals for select using (auth.uid() = profile_id);
create policy "usuario cria seu saque" on public.withdrawals for insert with check (auth.uid() = profile_id);

-- Função auxiliar: incrementa total_watch_seconds de forma atômica
create or replace function incrementar_watch_time(p_video_id uuid, p_segundos integer)
returns void as $$
begin
  update public.videos
  set total_watch_seconds = total_watch_seconds + p_segundos
  where id = p_video_id;
end;
$$ language plpgsql security definer;
