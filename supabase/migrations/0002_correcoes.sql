-- ============================================================
-- NEXARA — Correções de segurança e funcionalidades em falta
-- Rodar depois de 0001_init.sql
-- ============================================================

-- Papel de admin real (não existia — o middleware antigo só
-- verificava "está logado", não "é admin")
alter table public.profiles add column is_admin boolean not null default false;
alter table public.profiles add column phone_verified boolean not null default false;

-- Sessão activa por conta — resolve o bug do aquecimento.
-- Antes, o "aquecimento" era medido pelo tempo já creditado,
-- o que criava um ciclo impossível (nunca creditava nada).
-- Agora medimos o tempo real decorrido desde que a conta entrou.
create table public.active_sessions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);
alter table public.active_sessions enable row level security;
create policy "usuario ve sua sessao ativa" on public.active_sessions for select using (auth.uid() = profile_id);
create policy "usuario gere sua sessao ativa" on public.active_sessions for insert with check (auth.uid() = profile_id);
create policy "usuario atualiza sua sessao ativa" on public.active_sessions for update using (auth.uid() = profile_id);
create policy "usuario apaga sua sessao ativa" on public.active_sessions for delete using (auth.uid() = profile_id);

-- Peso de confiança: função que promove a conta com o tempo/comportamento
-- (idade da conta + diversidade de criadores assistidos)
create or replace function public.recalcular_peso_confianca(p_profile_id uuid)
returns void as $$
declare
  v_idade_dias integer;
  v_criadores_distintos integer;
  v_peso numeric;
begin
  select extract(day from now() - created_at) into v_idade_dias
  from public.profiles where id = p_profile_id;

  select count(distinct v.creator_id) into v_criadores_distintos
  from public.watch_sessions ws
  join public.videos v on v.id = ws.video_id
  where ws.viewer_id = p_profile_id;

  v_peso := least(1.0, 0.2 + (least(v_idade_dias, 30) / 30.0) * 0.5
                      + (least(v_criadores_distintos, 10) / 10.0) * 0.3);

  update public.profiles set account_age_weight = v_peso where id = p_profile_id;
end;
$$ language plpgsql security definer;

-- Índice para as consultas de fraude por fingerprint feitas pelo painel admin
create index if not exists idx_fingerprints_profile on public.device_fingerprints(profile_id);

-- Nota: as acções de admin (confirmar assinatura, processar saque) passam a
-- correr sempre pelo cliente de serviço (service role) dentro de rotas de
-- API dedicadas, nunca pelo cliente do browser — por isso não criamos
-- políticas de RLS "admin edita tudo" aqui: o service role já ignora RLS,
-- e mantê-lo assim reduz a superfície de ataque (uma política RLS mal
-- escrita para admin seria um risco a mais).
