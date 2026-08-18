-- ============================================================
-- NEXARA — Políticas RLS do Storage (faltava — sem isto, o bucket
-- privado "videos" recusa TODO acesso por padrão, incluindo o
-- próprio upload do criador). Rodar depois de 0003.
--
-- Convenção de path usada no código: "{user_id}/{timestamp}.ext"
-- — por isso as políticas comparam o primeiro segmento do path
-- com auth.uid(), usando storage.foldername(name).
-- ============================================================

-- O criador pode enviar (INSERT) para a sua própria pasta
create policy "criador envia para sua pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- O criador pode ler/baixar (SELECT) os seus próprios ficheiros
-- (usado no botão "Guardar vídeo" do painel esquerdo)
create policy "criador le seus proprios ficheiros"
  on storage.objects for select
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- O criador pode apagar os seus próprios ficheiros (apagar vídeo manualmente)
create policy "criador apaga seus proprios ficheiros"
  on storage.objects for delete
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- NOTA: não existe política de SELECT pública aqui — de propósito.
-- A visualização no feed passa sempre por signed URLs geradas no
-- servidor com o cliente de serviço (createAdminClient), que ignora
-- RLS. Isso é o que garante que ninguém acede ao vídeo de outra
-- pessoa por link direto sem passar pela expiração de 24h e pela
-- validade de 1h da signed URL.
