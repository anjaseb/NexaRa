-- ============================================================
-- NEXARA — Correções da revisão de segurança (quinta ronda)
-- Rodar depois de 0006_corrige_criacao_perfil.sql
-- ============================================================

-- ------------------------------------------------------------
-- REGRESSÃO na função creditar_watch_time (introduzida na
-- migration 0005, ao corrigir a condição de corrida): o código
-- original em JavaScript verificava o tecto diário de 1000 Kz
-- ANTES de escrever seja o que for — ao atingir o tecto, um
-- assinante deixava de acumular tempo assistido (watch_sessions,
-- total_watch_seconds) por completo até ao dia seguinte, não só
-- de ganhar dinheiro. A versão em SQL trocou a ordem por engano:
-- creditava o tempo assistido primeiro e só depois verificava o
-- tecto diário — ou seja, o tempo continuava a contar mesmo
-- depois do tecto, só os ganhos paravam. Isto muda o
-- comportamento do produto sem ter sido pedido.
--
-- Corrigido: verifica e trava (for update) a linha de
-- daily_earnings do assinante PRIMEIRO — se já atingiu o tecto,
-- devolve credited=0 e não escreve nada, exatamente como o
-- código original fazia. A ordem nova também mantém a operação
-- atómica (o lock da linha de daily_earnings serializa pedidos
-- concorrentes do mesmo dia, tal como antes).
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
begin
  -- 1) Se for assinante, checa o tecto diário PRIMEIRO — igual ao
  -- comportamento original. Trava a linha do dia (for update) até
  -- ao fim da função, para que dois pedidos quase simultâneos não
  -- passem os dois pela mesma checagem "ainda não atingiu".
  if p_is_subscriber then
    insert into public.daily_earnings (profile_id, earning_date, earned_kz)
    values (p_viewer_id, v_hoje, 0)
    on conflict (profile_id, earning_date) do nothing;

    select earned_kz into v_ja_ganho
    from public.daily_earnings
    where profile_id = p_viewer_id and earning_date = v_hoje
    for update;

    if v_ja_ganho >= p_limite_diario_kz then
      return query select 0::numeric, false, true;
      return;
    end if;
  end if;

  -- 2) Trava (ou cria) a linha de watch_sessions deste (viewer, vídeo)
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
    v_kz_ganho := v_credito_real * p_peso * p_kz_por_segundo;
    update public.daily_earnings
    set earned_kz = least(p_limite_diario_kz, v_ja_ganho + v_kz_ganho)
    where profile_id = p_viewer_id and earning_date = v_hoje;
  end if;

  return query select v_credito_real, false, false;
end;
$$;

grant execute on function public.creditar_watch_time(
  uuid, uuid, numeric, numeric, boolean, integer, numeric, numeric
) to authenticated;
