# NexaRa

Vídeos que duram 24h. Tempo assistido é o que conta.

## O que já está pronto (código real, não protótipo)

- Login e registo com Supabase Auth
- Feed com busca real de vídeos (50% populares / 50% recentes)
- Upload de vídeo com validação real de tipo de ficheiro
- Registo de tempo assistido com as regras da spec: aquecimento de
  6 min por conta, tecto de 1 min por vídeo, peso reduzido para contas novas
- Perfil com estatísticas reais
- Assinatura (500/1000 Kz) com fila de confirmação manual no admin
- Painel admin: visão geral, assinaturas pendentes, saques, alertas de fingerprint
- Webhook da AppyPay com validação de assinatura HMAC
- Link de partilha com token (`/w/[token]`), expira com o vídeo
- Edge Function que apaga vídeos e comentários às 24h
- RLS ativo em todas as tabelas

## Passos para pôr no ar (nesta ordem)

### 1. Supabase
1. Cria um projeto em https://supabase.com/dashboard
2. Vai em **SQL Editor** e roda o conteúdo de `supabase/migrations/0001_init.sql`
3. Vai em **Storage** e cria um bucket chamado `videos` (privado)
4. Copia **Project URL** e **anon key** de Settings > API
5. Copia a **service_role key** (a mesma página, é secreta)

### 2. Preencher as chaves
1. Copia `.env.local.example` para `.env.local`
2. Cola os valores do Supabase
3. (Os campos da AppyPay ficam vazios até a aprovação — ver nota abaixo)

### 3. GitHub + Vercel
1. Sobe este projeto para um repositório no GitHub (dá pra fazer direto do Spck)
2. Em https://vercel.com, importa o repositório
3. Cola as mesmas variáveis de `.env.local` em Vercel > Settings > Environment Variables
4. A Vercel instala tudo (`npm install`) e publica sozinha — não precisas de terminal local

### 4. Domínio
No Vercel > Domains, aponta o domínio comprado (ex: nexara.co.ao) e segue as
instruções de DNS. Depois, configura a Cloudflare por cima (WAF, DNSSEC) —
como já está descrito na tua spec original, secção 8.

### 5. AppyPay — o único passo que não é só código
A AppyPay exige aprovação como comerciante, o que exige o NIF empresarial
(já previsto na tua spec, secção 7 e 12). Isto é um processo externo, fora
do código: formalizar a empresa, depois abrir conta comerciante na AppyPay.
Só depois disso eles entregam as chaves reais — que vão exatamente nos
campos `APPYPAY_*` do `.env.local`. O código do webhook já está pronto para
receber e validar essas chaves assim que existirem.

### 6. Google AdSense (site)
1. Cria conta em https://www.google.com/adsense
2. Adiciona o teu domínio (nexara.co.ao) para revisão
3. O Google demora normalmente alguns dias a semanas a aprovar — exige
   conteúdo real e algum tráfego, não aprova sites vazios
4. Depois de aprovado, copia o **Publisher ID** (algo como `ca-pub-XXXXXXXXXX`)
   para `NEXT_PUBLIC_ADSENSE_CLIENT_ID` no `.env.local` / Vercel
5. O código já está pronto: enquanto essa chave estiver vazia, nenhum
   anúncio aparece (sem erro, sem espaço quebrado) — assim que preencheres,
   liga sozinho, sem precisar tocar em mais nada
6. Cria um "ad unit" dentro do painel do AdSense e substitui o valor
   `"0000000000"` em `app/page.tsx` (prop `slot`) pelo ID real desse
   bloco de anúncio

Nota: por regra da tua spec, só assinantes veem anúncios — isso já está
implementado (o anúncio só é inserido no feed se `is_subscriber` for
verdadeiro), inserido a cada 5 vídeos.

### 7. Google AdMob (app futura, Flutter)
Isto só entra quando a app Flutter existir — o AdMob é integrado direto
no código Flutter (SDK próprio), não faz parte deste projeto Next.js.
Por agora, cria a conta em https://apps.admob.com e guarda o **App ID**
em `ADMOB_APP_ID` no `.env.local`, só para não esquecer o valor quando
chegar a hora.

## O que ainda precisa de decisão tua (não é código, é produto)

- Compressão automática do vídeo (ffmpeg) — ver nota no topo de
  `app/api/upload/route.ts`. Funciona sem isso por agora, mas os vídeos
  não ficam comprimidos ao alvo de 6-8MB até isso ser ligado.
- Cron da Edge Function `expire-videos` — precisa de ser agendado no
  painel do Supabase (Edge Functions > Cron), não roda sozinho até isso.

---

## Correções e funcionalidades adicionadas (segunda revisão)

Esta versão corrige os problemas encontrados na revisão de segurança e implementa o que faltava da spec. Passos de configuração necessários antes de correr em produção:

### 1. Rodar a nova migração
No SQL Editor do Supabase, corre `supabase/migrations/0002_correcoes.sql` depois da 0001.

### 2. Criar o primeiro admin manualmente
Não existe ainda nenhuma conta admin — cria a tua conta normalmente pelo site, depois no SQL Editor do Supabase:
```sql
update public.profiles set is_admin = true where email = 'o-teu-email@exemplo.com';
```

### 3. Activar MFA na tua conta admin
Ao entrares em `/admin` pela primeira vez, és redirecionado para `/admin/mfa` — lê o QR code com Google Authenticator ou Authy e confirma o código. Isto é obrigatório, o middleware bloqueia `/admin/*` sem MFA activo (AAL2).

### 4. Configurar o provedor de SMS no Supabase (verificação de telefone)
Auth > Providers > Phone, no painel do Supabase. Sem isto configurado, o passo de verificação por SMS no cadastro não envia mensagens reais. A Twilio é a opção mais comum para integrar.

### 5. Configurar Upstash Redis (rate limiting fiável em produção)
Cria uma base de dados grátis em upstash.com, cola `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no `.env.local` e na Vercel. Sem isto, o rate limiting usa memória local, que não funciona correctamente com várias instâncias serverless da Vercel.

### 6. Configurar o cron de recalcular confiança
Supabase Dashboard > Edge Functions > `recalc-trust` > Cron: `0 * * * *` (a cada hora).

### 7. Limitação da compressão de vídeo (ffmpeg)
A rota `/api/compress` usa ffmpeg dentro de uma função Vercel — funciona para o volume inicial, mas tem limite de tempo de execução (ver comentário no topo do ficheiro `app/api/compress/route.ts`). Se os vídeos começarem a expirar antes de comprimir (timeout), migra essa função para um worker externo (Fly.io, Render, etc.).

### O que foi corrigido nesta revisão
- Bug do aquecimento de 6 minutos (nunca creditava tempo nenhum) — agora usa sessão real no servidor (`active_sessions`)
- Painel admin sem verificação de admin real — agora exige `is_admin=true` + MFA (AAL2)
- Botões de admin que falhavam silenciosamente por causa da RLS — agora passam por rotas `/api/admin/*` com service role
- Vídeos entregues por link público permanente — agora por signed URL (1h de validade), gerada no servidor
- Sem limite de tamanho de upload — agora com tecto de 25MB antes de comprimir, alvo de 6-8MB depois
- Verificação de tipo de ficheiro falsa (confiava no header do browser) — agora lê a assinatura binária real
- `delta_seconds` do tempo assistido confiado sem validação — agora limitado a 5s por chamada e ligado à sessão real
- Fingerprinting de dispositivo implementado, com limite de 5 contas e acesso limitado acima disso
- Verificação de telefone por SMS implementada no cadastro
- Pré-carregamento dos próximos 3 vídeos implementado
- Contagem de "assistindo agora" ligada ao Supabase Realtime (Presence)
- Cache local (Cache API) para vídeos já assistidos nas últimas 24h
- Rate limiting em login, upload e watch-time (com aviso sobre Upstash em produção)
- Content Security Policy e cabeçalhos de segurança adicionados
- Compressão automática via ffmpeg implementada (com limitações documentadas)
- Job de recalcular peso de confiança por idade/diversidade da conta

---

## Correções e funcionalidades adicionadas (terceira revisão)

Esta revisão corrigiu falhas mais profundas do que as anteriores — uma delas impedia
qualquer conta nova de funcionar, e outra foi uma regressão introduzida durante a
própria correção da condição de corrida (documentado abaixo com honestidade, porque é
um lembrete de por que vale a pena rever de novo depois de qualquer refactor).

### Passos de configuração necessários antes de correr em produção

1. No SQL Editor do Supabase, corre `0005_correcoes_seguranca.sql`,
   `0006_corrige_criacao_perfil.sql`, `0007_corrige_ordem_tecto_diario.sql`,
   `0008_corrige_string_vazia_unique.sql`, `0009_atomicidade_webhook_pagamento.sql`,
   `0010_limites_tamanho_texto.sql` e `0011_corrige_fuga_dados_pessoais.sql`,
   nesta ordem, depois de `0004_storage_policies.sql`.
2. **Se já testaste o cadastro antes da migração 0006**, essas contas ficaram sem
   linha em `profiles` (ver bug abaixo) — o SQL para as reparar manualmente está em
   comentário no topo da própria migração `0006_corrige_criacao_perfil.sql`.
3. `npm install` de novo depois de atualizar `package.json` (Next.js subiu de 14
   para 15 — ver nota abaixo).

### O que foi corrigido nesta revisão

- **Saldo de ganhos nunca era gravado** — `daily_earnings` só tinha política de RLS
  de leitura; a escrita pelo cliente do usuário falhava sempre em silêncio (o erro
  nem era verificado no código). Ninguém acumulava saldo de saque de verdade, apesar
  do tecto diário parecer funcionar na aparência. Corrigido com política de RLS
  correta e, mais importante, movendo a escrita para dentro de uma função no
  Postgres que não depende de RLS (ver ponto seguinte).
- **Condição de corrida no crédito de tempo assistido** — a rota lia
  `seconds_credited`/`earned_kz`, calculava em JavaScript e só depois escrevia;
  pedidos quase simultâneos podiam ler o mesmo valor desatualizado e ultrapassar
  ligeiramente os tectos. Agora todo o cálculo corre atomicamente dentro da função
  `creditar_watch_time` no Postgres, com `select ... for update` para travar a linha
  certa até ao fim da operação.
- **Contas novas ficavam sem perfil** (bug mais grave desta revisão) —
  `public.profiles` nunca teve política de RLS de `insert` em nenhuma migração
  anterior. O cadastro criava a conta no Supabase Auth com sucesso e a escrita em
  `profiles` falhava sempre, sem o erro ser verificado — a app inteira depende dessa
  linha existir (middleware, upload, watch-time, feed). Corrigido com um trigger em
  `auth.users` que cria o perfil no servidor, independente de sessão ou RLS.
- **Regressão introduzida ao corrigir a condição de corrida acima**: a nova função
  `creditar_watch_time` deixou de bloquear o tempo assistido quando o assinante
  atingia o tecto diário de 1000 Kz — só bloqueava os ganhos. O código original
  bloqueava os dois. Corrigido para checar o tecto diário primeiro, como antes.
- **Link de partilha (`/w/[token]`) nunca reproduzia o vídeo** — a página não gerava
  signed URL antes de passar o vídeo ao componente; sem isso, o vídeo nunca tinha uma
  fonte para tocar. Corrigido para gerar a signed URL da mesma forma que o feed
  principal.
- **Rate limit de login não era realmente aplicado** — o cliente chamava a checagem
  de limite e o login real como dois pedidos separados; nada obrigava a passar pelo
  primeiro. Login e rate limit agora correm juntos, na mesma rota do servidor.
- Validação de `plan_kz` no webhook da AppyPay antes de gravar (mesmo com a
  assinatura HMAC já validada).
- Extensão do ficheiro temporário de compressão corrigida (usava sempre `.mp4`,
  mesmo para vídeos webm).
- Botão de remover vídeo no admin agora mostra erro se a remoção falhar (antes
  falhava em silêncio).
- Valor de saque agora tem de ser um número inteiro (evita erro genérico da base de
  dados se alguém digitar casas decimais).
- Corrida pequena no heartbeat de sessão (várias abas abertas) resolvida com
  `upsert` em vez de "ler para decidir depois".
- `package.json` atualizado de Next.js 14 para 15 — o código já usava as convenções
  assíncronas do 15 (`params` como Promise, `cookies()` assíncrono); funcionava por
  acidente sob o 14 mas a versão declarada estava desalinhada com o que o código
  realmente precisa.
- **Registo quebrava a partir da segunda conta por email (ou por telefone)** — o
  Supabase Auth costuma gravar o campo não usado no registo (ex: `phone` para quem
  se regista por email) como string vazia `''`, não `NULL`. Como `profiles.email` e
  `profiles.phone` têm `unique`, e `''` conta como valor igual (`NULL` não), o
  trigger de criação de perfil rebentava com "duplicate key" na segunda conta —
  e por ser um trigger `after insert` em `auth.users`, isso revertia a criação da
  conta toda. Corrigido convertendo `''` em `NULL` antes de gravar (`nullif`).
- **Rate limit do Upstash sem tratamento de erro** — se o Upstash estivesse em
  baixo, mal configurado, ou devolvesse algo inesperado, a exceção não tratada
  rebentava a rota inteira que estava a usar o rate limit (login, upload,
  watch-time). Corrigido com fail-open: se o Upstash falhar, o pedido passa
  (o rate limit fica indisponível por instantes, mas a app não cai).
- **Webhook de pagamento sem atomicidade nem verificação de erro** — confirmar
  uma assinatura paga fazia duas escritas separadas (`subscriptions` e
  `profiles`) sem transação nem checagem de erro, e respondia sempre 200 mesmo
  quando uma delas falhava — a AppyPay nunca saberia que precisava reenviar o
  webhook. Corrigido com uma função que faz as duas escritas na mesma transação,
  e a rota agora devolve erro real (500) quando algo falha, para o gateway poder
  reenviar.
- **Limites de tamanho de texto só existiam no HTML, nunca na base de dados** —
  `maxLength` num `<input>` é cosmético; qualquer pessoa pode chamar a API do
  Supabase directamente (com a sessão dela) e enviar um comentário ou nome de
  perfil de qualquer tamanho. Adicionadas constraints reais na base de dados
  (280 caracteres para comentários, 60 para nome de perfil) — e o trigger de
  criação de perfil passou a truncar o nome antes de gravar, para não reverter
  a criação da conta caso alguém envie um nome gigante no cadastro.
- **`app/perfil/page.tsx` rebentava para qualquer assinante com ganhos no dia** —
  `earned_kz` é `numeric` no Postgres, e o PostgREST devolve colunas `numeric`
  como *string* em JSON (para não perder precisão), não como número. O código
  chamava `.toFixed(0)` directamente nesse valor sem o converter primeiro —
  `String.prototype.toFixed` não existe, por isso a página crashava. Os outros
  sítios do ficheiro (e a rota de saque) já envolviam isto com `Number(...)`
  corretamente; só faltava aqui.
- **🔴 O achado mais grave de toda a revisão: `profiles` deixava ler email,
  telefone e número Multicaixa Express de QUALQUER usuário.** A política de RLS
  `"perfis visiveis a todos" using (true)` controla quais LINHAS são visíveis,
  mas RLS no Postgres não restringe COLUNAS — então "todos podem ver a linha"
  também significava "todos podem ler todas as colunas dessa linha", incluindo
  as sensíveis, directamente pela API REST do Supabase, sem passar pela app.
  Corrigido restringindo por coluna: anon/authenticated só podem seleccionar
  `id, display_name, avatar_url, is_subscriber, created_at` (exactamente o que
  já era mostrado no feed e nos comentários); o próprio dono lê o perfil
  completo através da nova função `meu_perfil()`, que devolve só a linha de
  quem chama, verificado no servidor. Seis ficheiros que liam o próprio perfil
  pelo cliente do browser foram actualizados para usar esta função.
- **Mesmo padrão do bug do webhook (0009), desta vez na confirmação manual de
  assinatura pelo admin** — `confirm-subscription` escrevia em `subscriptions` e
  depois em `profiles` sem verificar o erro da segunda escrita; se falhasse, a
  assinatura ficava "active" mas o perfil continuava sem `is_subscriber=true`,
  e o admin via "ok" na mesma. Corrigido para verificar o erro e avisar
  claramente que precisa de verificação manual, em vez de fingir sucesso.

