# Publicar THE GHOST </> com seu Supabase

O projeto contém frontend Vite e função Express em api/index.mjs. Node 24.x, npm ci, npm run build e dist; vercel.json preserva as rotas /api e o fallback da aplicação.

## Conectar seu projeto existente

1. No Supabase, abra seu projeto e o SQL Editor. Execute [supabase/schema.sql](supabase/schema.sql). O script cria somente estruturas, permissões e funções transacionais; nenhum registro comercial demonstrativo é inserido. Veja [supabase/README.md](supabase/README.md).
2. Copie a Project URL em Settings → Data API. Em Settings → API Keys, use uma chave **secret** de servidor ou a chave legada **service_role**. Não use anon/publishable para o backend.
3. No projeto Vercel, abra Settings → Environment Variables. Adicione SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY). Use escopo Production e Preview se ambos forem utilizados. Não adicione VITE_ ao nome de uma chave privada. Não publique chaves no chat ou repositório.
4. Faça Redeploy após salvar a configuração. Não é necessário fornecer DATABASE_URL.

## Abrir direto, só para você

GHOST_ACCESS_MODE=owner é o padrão. O aplicativo não solicita cadastro, e-mail ou senha: abre seu workspace pessoal quando banco e proteção estão prontos. Configure seu nome em Configurações dentro do app.

Na Vercel, abra Settings → Deployment Protection → Vercel Authentication e selecione **All Deployments**, incluindo produção. Use seu projeto pessoal, com acesso somente à sua conta. Não conceda convidados, links de compartilhamento ou bypasses de proteção. Todas as rotas, incluindo /api, devem estar protegidas. A primeira visita pode solicitar autenticação da própria Vercel; quando já estiver conectado à Vercel, não há formulário de login adicional no aplicativo.

O backend verifica pela API da Vercel que o projeto está em All Deployments antes de disponibilizar o workspace pessoal. Adicione VERCEL_TOKEN nas variáveis privadas do servidor com acesso ao projeto e VERCEL_PROJECT_ID. Se o projeto pertence a uma equipe, também VERCEL_ORG_ID. O token nunca é enviado ao navegador. Se faltar proteção/conexão, a API permanece indisponível em vez de liberar os dados pessoais na Internet.

Para dados de uma instalação anterior em modo accounts, GHOST_OWNER_USER_ID pode apontar para o ID da conta existente. Não altere esse campo depois de iniciar uma operação nova sem verificar onde os dados foram gravados. Modo accounts e conexão direta por pg são compatibilidade legada, não são necessários para a instalação pessoal via Supabase.

## Vincular à Vercel

Importe misake920/NOVA-DEV, branch the-ghost, ou reivindique uma implantação temporária antes que expire. A prévia temporária anônima não é uma conta/projeto privado permanente. Mantenha preset Vite, raiz do repositório e vercel.json.

Com sua conta autenticada na CLI e o projeto vinculado:

~~~bash
vercel link
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SECRET_KEY production
vercel env add VERCEL_TOKEN production
vercel env add VERCEL_PROJECT_ID production
vercel --prod
~~~

Não cole credenciais na linha de comando; vercel env add solicita valores interativamente. Ative a proteção All Deployments no painel do projeto. A saída da publicação é a fonte do endereço real.

## Integrações opcionais

- GOOGLE_PLACES_API_KEY: pesquisa externa Places.
- ALLOW_GOOGLE_PROSPECTING: true após conferir as condições aplicáveis ao uso; padrão false.
- AI_API_KEY: opcional para geração com IA; modelos locais continuam disponíveis.
- AI_BASE_URL e AI_MODEL: opcionais para o provedor de IA.
- APP_ORIGIN: origem pública exata do aplicativo, caso o proxy altere o Host.

As consultas reais dependem das suas credenciais. Código compilado e mocks não comprovam conexão remota.

SQLite é exclusivo do desenvolvimento local. Acesso pessoal local exige loopback. Vercel não grava seus dados de uso em disco temporário e não simula vendas ou clientes quando o banco está ausente.
