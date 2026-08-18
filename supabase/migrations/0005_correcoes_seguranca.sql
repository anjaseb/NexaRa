-- ============================================================
-- NEXARA — Correções da revisão de segurança (terceira ronda)
-- Rodar depois de 0004_storage_policies.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) BUG CRÍTICO: daily_earnings só tinha política de SELECT.
-- A rota /api/watch-time grava nesta tabela usando o cliente
-- ligado à sessão do usuário (sujeito a RLS) — sem política de
-- insert/update, o upsert falhava silenciosamente e o saldo de
-- ganhos NUNCA era gravado. Resultado: ninguém acumulava saldo
-- de saque de verdade, apesar do tecto diário "funcionar" na
-- aparência (porque a leitura também devolvia sempre vazio).
--
-- Corrigido de duas formas complementares (defesa em profundidade):
--   a) política de RLS correta aqui, para qualquer código que
--      escreva com o cliente do usuário;
--   b) a lógica de crédito passa a correr inteira dentro da
--      função creditar_watch_time (abaixo), que é SECURITY
--      DEFINER e não depende de RLS — é o caminho que a rota
--      /api/watch-time passa a usar.
-- ------------------------------------------------------------
create policy "usuario regista seus ganhos"
  on public.daily_earnings for insert
  with check (auth.uid() = profile_id);

create policy "usuario atualiza seus ganhos"
  on public.daily_earnings for update
  using (auth.uid() = profile_id);

-- ------------------------------------------------------------
-- 2) Condição de corrida em /api/watch-time: a rota antiga lia
-- seconds_credited/earned_kz, calculava em JavaScript, e só
-- depois escrevia — duas chamadas quase simultâneas (rate limit
-- permite até 30/min) podiam ler o mesmo valor "antigo" e
-- ambas creditarem, ultrapassando ligeiramente o tecto por
-- vídeo ou o tecto diário.
--
-- Esta função faz leitura+cálculo+escrita como uma operação
-- atómica no Postgres: usa "select ... for update" para travar
-- a linha até ao fim da transação, então chamadas concorrentes
-- para o mesmo (viewer, video) ou (profile, data) ficam em fila
-- em vez de correrem sobre o mesmo valor desatualizado.
-- ------------------------------------------------------------
create or replace function public.creditar_watch_time(
  p_viewer_id uuid,
  p_video_id uuid,
  p_delta_seconds numeric,
  p_peso numeric,
  p_is_subscriber boolean,
  p_tecto_por_video integer,
  p_limite_diario_kz numeric,
  p_kz_por_segundo numeric
)
returns table(
  credited numeric,
  capped boolean,
  daily_cap_reached boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja_creditado integer;
  v_novo_total integer;
  v_credito_real numeric;
  v_hoje date := current_date;
  v_ja_ganho numeric;
  v_kz_ganho numeric;
  v_daily_cap_reached boolean := false;
begin
  -- Garante que a linha existe, depois trava-a (lock) até ao fim
  -- desta transação: qualquer chamada concorrente para o mesmo
  -- (viewer_id, video_id) espera aqui em vez de ler um valor stale.
  insert into public.watch_sessions (viewer_id, video_id, seconds_credited)
  values (p_viewer_id, p_video_id, 0)
  on conflict (viewer_id, video_id) do nothing;

  select seconds_credited into v_ja_creditado
  from public.watch_sessions
  where viewer_id = p_viewer_id and video_id = p_video_id
  for update;

  if v_ja_creditado >= p_tecto_por_video then
    return query select 0::numeric, true, false;
    return;
  end if;

  v_novo_total := least(p_tecto_por_video, v_ja_creditado + floor(p_delta_seconds)::integer);
  v_credito_real := v_novo_total - v_ja_creditado;

  if v_credito_real <= 0 then
    return query select 0::numeric, false, false;
    return;
  end if;

  update public.watch_sessions
  set seconds_credited = v_novo_total
  where viewer_id = p_viewer_id and video_id = p_video_id;

  update public.videos
  set total_watch_seconds = total_watch_seconds + round(v_credito_real * p_peso)
  where id = p_video_id;

  if p_is_subscriber then
    insert into public.daily_earnings (profile_id, earning_date, earned_kz)
    values (p_viewer_id, v_hoje, 0)
    on conflict (profile_id, earning_date) do nothing;

    select earned_kz into v_ja_ganho
    from public.daily_earnings
    where profile_id = p_viewer_id and earning_date = v_hoje
    for update;

    if v_ja_ganho >= p_limite_diario_kz then
      v_daily_cap_reached := true;
    else
      v_kz_ganho := v_credito_real * p_peso * p_kz_por_segundo;
      update public.daily_earnings
      set earned_kz = least(p_limite_diario_kz, v_ja_ganho + v_kz_ganho)
      where profile_id = p_viewer_id and earning_date = v_hoje;
    end if;
  end if;

  return query select v_credito_real, false, v_daily_cap_reached;
end;
$$;

-- A função corre como o dono (security definer), mas ainda assim
-- precisa de permissão explícita de EXECUTE para o papel usado
-- pelo cliente autenticado do browser/servidor.
grant execute on function public.creditar_watch_time(
  uuid, uuid, numeric, numeric, boolean, integer, numeric, numeric
) to authenticated;
