# Publicar THE GHOST </> na Vercel

O projeto contém frontend Vite e função Express em api/index.mjs. Node 24.x, npm ci e npm run build; pasta de saída dist. vercel.json preserva as rotas /api e o fallback da aplicação.

## Banco e configuração

Antes da publicação funcional, configure DATABASE_URL com uma conexão PostgreSQL de um provedor que você controla. Pode usar a integração de banco disponível na Vercel. O backend cria suas tabelas ao inicializar, com TLS verificado nas conexões remotas.

Não coloque credenciais no código nem no chat. Configure as variáveis privadas no projeto Vercel e em seu ambiente seguro de desenvolvimento. Sem banco persistente, a função responde 503; não grava vendas em disco temporário.

Variáveis:

- DATABASE_URL: conexão PostgreSQL, necessária para autenticação/CRM/financeiro na Vercel.
- GOOGLE_PLACES_API_KEY: chave Places, necessária somente para a pesquisa externa.
- ALLOW_GOOGLE_PROSPECTING: true após conferir as condições aplicáveis ao uso; padrão false.
- AI_API_KEY: opcional para geração com IA; modelos locais continuam disponíveis.
- AI_BASE_URL e AI_MODEL: opcionais para o provedor de IA.
- APP_ORIGIN: origem pública do aplicativo, quando desejado.

## Pelo painel

Importe este repositório e selecione a branch que contém o aplicativo. Mantenha o preset Vite, pasta raiz do repositório e configurações do vercel.json. Configure o banco, publique e crie sua própria conta pela tela inicial.

## Pela CLI

Com sua conta autenticada na CLI Vercel e o projeto vinculado:

~~~bash
npm ci
npm run build
vercel link
vercel env add DATABASE_URL production
vercel --prod
~~~

Ao usar automação, VERCEL_TOKEN e os IDs do projeto/equipe ficam nas configurações seguras. A saída da publicação é a fonte do endereço real; não é possível deduzi-lo do nome do projeto.

## Conferência após publicar

Abra a URL retornada e confirme cadastro/login. Cadastre seus próprios clientes e vendas. Verifique recebimento parcial, despesa, indicadores, persistência após recarregar, notificações e atualização em outra sessão. Mantenha BRL, EUR e USD separados.

Confirme as consultas Places com sua própria chave e conta do provedor. Testes com respostas simuladas não confirmam conectividade ou quota externas.

SQLite é exclusivo do desenvolvimento local. Dados de testes ficam em banco temporário separado; nenhum cliente ou venda demonstrativa é inserido na conta de uso.
