-- ============================================================
-- NEXARA — Correções da revisão de segurança (sétima ronda)
-- Rodar depois de 0008_corrige_string_vazia_unique.sql
-- ============================================================

-- ------------------------------------------------------------
-- BUG no webhook de pagamento (app/api/webhook/appypay/route.ts):
-- ao confirmar uma assinatura paga, a rota fazia DUAS escritas
-- separadas — update em subscriptions, depois update em profiles
-- — sem verificar o erro de nenhuma das duas, e sempre respondia
-- {received:true} (200) no final, mesmo que uma delas falhasse.
--
-- Isso cria dois problemas reais:
--   1) Se a primeira escrita tiver sucesso e a segunda falhar (ou
--      vice-versa), fica-se com um estado inconsistente: a
--      subscription diz "active" mas profiles.is_subscriber
--      continua false (ou o oposto) — sem transação, não há
--      garantia de as duas acontecerem juntas.
--   2) Como a rota sempre respondia 200 mesmo quando algo falhava,
--      a AppyPay nunca saberia que precisava reenviar o webhook —
--      a maioria dos gateways de pagamento só reenvia quando
--      recebem um código de erro (4xx/5xx).
--
-- Corrigido com uma função que faz as duas escritas na mesma
-- transação (atómica por definição, ao correr dentro de uma única
-- função Postgres), e a rota passa a devolver erro 500 (para pedir
-- reenvio) se a função disser que a assinatura pendente não foi
-- encontrada nem actualizada.
-- ------------------------------------------------------------
create or replace function public.confirmar_assinatura_paga(
  p_profile_id uuid,
  p_reference text,
  p_plan_kz integer,
  p_expira_em timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas_atualizadas integer;
begin
  update public.subscriptions
  set status = 'active', payment_reference = p_reference
  where profile_id = p_profile_id and status = 'pending';

  get diagnostics v_linhas_atualizadas = row_count;

  -- Se não havia nenhuma assinatura pendente para este perfil (ex:
  -- webhook duplicado, já processado antes, ou profile_id errado),
  -- não faz sentido continuar e marcar o perfil como assinante —
  -- devolve false para a rota decidir o que fazer (normalmente:
  -- responder 200 sem erro, porque "já estava feito" também é um
  -- resultado válido de um webhook reenviado).
  if v_linhas_atualizadas = 0 then
    return false;
  end if;

  update public.profiles
  set is_subscriber = true,
      subscription_plan = p_plan_kz,
      subscription_expires_at = p_expira_em
  where id = p_profile_id;

  return true;
end;
$$;

grant execute on function public.confirmar_assinatura_paga(
  uuid, text, integer, timestamptz
) to service_role;
