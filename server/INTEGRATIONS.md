# Backend do THE GHOST </>

O servidor atende na interface local `127.0.0.1`, com JSON em `/api`. Em produção, também serve `dist` quando o build está presente. As credenciais Places e IA ficam somente no servidor; a chave de Maps no navegador é deliberadamente pública e precisa de restrições por domínio/referrer e por API.

## Autenticação e persistência

Cadastro e login usam senhas derivadas por scrypt, sessões aleatórias com somente o hash armazenado no banco e cookies HttpOnly/SameSite. Cookies Secure são usados em produção. Logout revoga a sessão no servidor. Cada conta possui seu workspace isolado; IDs de outra conta não podem atualizar seus registros ou ser usados como relacionamento.

Sem PostgreSQL, fora de Vercel, o backend usa SQLite no arquivo `GHOST_DATABASE_PATH`, padrão `/workspace/ghost-data/the-ghost.sqlite`, fora do checkout. O processo requer Node.js 22.13 ou superior; o ambiente usado na validação possui Node.js 24.19.0. SQLite precisa de volume persistente e backup; não utilizar o arquivo do ambiente como substituto de um banco na nuvem.

Quando `DATABASE_URL` ou `POSTGRES_URL` está definida, o adapter utiliza PostgreSQL através de `pg`. Em Vercel, PostgreSQL é obrigatório: sua ausência resulta em 503 e `databaseReady:false`, sem usar filesystem efêmero. O adapter mantém verificação TLS. A URL precisa chegar ao servidor, nunca ao frontend. A validação nesta máquina cobre SQLite, inclusive reinício; PostgreSQL exige conexão e validação na implantação de destino.

O estado JSON versionado da conta, o histórico de comandos e seus resultados são gravados na mesma transação. `expectedVersion` evita sobrescrever outra sessão quando informado; `requestId` evita executar uma atualização novamente, inclusive após reinício. Reusar o mesmo identificador com outra operação ou payload é rejeitado. O histórico de atividades e notificações faz parte dos dados persistidos. A atualização entre telas e sessões utiliza polling real do workspace a cada cinco segundos, sem simular eventos de negócios.

O financeiro valida valores inteiros em centavos para BRL, EUR e USD. Cada valor fica limitado a `1_000_000_000_000` centavos, e totais são mantidos dentro da precisão inteira do contrato JavaScript. Comparações e reconciliação no servidor usam BigInt. Desconto não pode superar o bruto e parcelas precisam somar exatamente o líquido. Recebimentos e estornos são registros imutáveis; pagamento excessivo, edição financeira após recebimento e estorno acima do recebido são rejeitados. Cancelar uma venda conserva seus pagamentos e histórico e impede novos recebimentos. Ganhar uma oportunidade não confirma recebimento nem cria venda automática.

Clientes e oportunidades com registros dependentes não podem ser removidos silenciosamente. Notificações de tarefas, follow-ups e parcelas vencidas consideram o fuso do perfil e são deduplicadas por entidade e vencimento. Novas contas recebem apenas etapas estruturais; não há clientes ou valores demonstrativos gravados no banco.

## Variáveis

| Variável                   | Uso                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_MAPS_BROWSER_KEY`  | Renderização do mapa; restringir a Maps JavaScript API e aos domínios autorizados.                                                            |
| `GOOGLE_PLACES_API_KEY`    | Places API (New); chave separada e restrita para o servidor.                                                                                  |
| `ALLOW_GOOGLE_PROSPECTING` | `false` por padrão. Definir como `true` somente após revisar os termos aplicáveis ao uso comercial e ao tratamento de dados pela IA.          |
| `AI_API_KEY`               | Credencial do provedor de IA compatível com Chat Completions.                                                                                 |
| `AI_MODEL`                 | Modelo, padrão `gpt-4.1-mini`.                                                                                                                |
| `AI_BASE_URL`              | Endpoint HTTPS base, padrão `https://api.openai.com/v1`; o provedor precisa aceitar `response_format: json_object` e `max_completion_tokens`. |
| `APP_ORIGIN`               | Origem exata autorizada para POSTs quando um proxy de produção alterar o Host.                                                                |
| `PORT`                     | Porta da API, padrão `3001`.                                                                                                                  |
| `GHOST_DATABASE_PATH` | Arquivo SQLite local, fora de Vercel; padrão `/workspace/ghost-data/the-ghost.sqlite`. |
| `DATABASE_URL` / `POSTGRES_URL` | URL PostgreSQL privada; obrigatória em Vercel. |

Nunca colocar chaves privadas em variáveis `VITE_*`, no código do cliente, em commits ou nas instruções públicas. O cadastro manual, CRM e financeiro funcionam sem credenciais externas. Credenciais ausentes produzem estados de indisponibilidade, sem simular buscas nem gerações reais.

## Uso somente com Places

A chave `GOOGLE_PLACES_API_KEY` permite busca e detalhes em lista. `GOOGLE_MAPS_BROWSER_KEY` e `AI_API_KEY` são opcionais. Quando não há chave de mapa, a interface não coloca resultados Google sobre o mapa ilustrativo: mostra apenas a lista e atribuição textual Google Maps. Sem IA, o usuário pode produzir rascunhos locais identificados. A ativação comercial continua sujeita à revisão descrita abaixo.

Se a chave foi digitada na configuração, salve/aplique a alteração para que chegue ao processo. Não repita o cadastro da chave apenas porque a atualização ainda não foi aplicada. A variável precisa estar disponível como `GOOGLE_PLACES_API_KEY`; não coloque seu valor no chat.

## Google: revisão necessária antes da ativação

O código usa apenas a API oficial Text Search (New), Place Details (New), máscaras de campos explícitas, idioma e país de consulta. `regionCode` influencia a pesquisa e a formatação; não garante que todo resultado esteja dentro de uma fronteira. Buscas repetidas simultâneas idênticas compartilham uma requisição. Resultados completos não são armazenados em banco, arquivo ou cache pelo servidor; respostas usam `Cache-Control: no-store`. Atribuições de terceiros são devolvidas para exibição pelo cliente.

Antes de ativar, verificar a documentação e os termos atuais, o plano contratado e a jurisdição aplicável:

- [Políticas do Places](https://developers.google.com/maps/documentation/places/web-service/policies): atribuição, exibição no mapa, retenção e restrições de armazenamento/exportação.
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search): parâmetros, campos, paginação e cobrança.
- [Termos específicos](https://cloud.google.com/maps-platform/terms/maps-service-terms): usos permitidos de conteúdo Google, diretórios/listas, prospecção e aplicações de IA.

A tentativa de consulta dessas páginas durante o desenvolvimento foi bloqueada pelo proxy da execução, com `403` no túnel. Não foi possível confirmar a política vigente nesta máquina. Por isso, a busca real e o envio de empresas de origem Google ao modelo permanecem bloqueados por padrão. Não há afirmação de que a combinação Google + prospecção + IA seja permitida; o proprietário precisa verificar o uso específico antes de configurar a flag. Dados próprios inseridos manualmente não dependem dessa flag. Não usar scraping para contornar as condições do fornecedor.

Chamadas de detalhes acrescentam website e telefone somente se fornecidos. A ausência de website não comprova que a empresa não tenha site. As chamadas são faturáveis conforme campos/SKUs e configuração da conta; configurar alertas e quotas no Google Cloud. O servidor limita pesquisas a 30/minuto, detalhes a 45/minuto e IA a 15/minuto por endereço de cliente. Esses limites em memória reiniciam junto com o processo.

## Limites operacionais

Os dados necessários da empresa são enviados ao provedor de IA configurado somente quando o usuário solicita a geração. O provedor recebe nome, categoria, endereço, oferta e contexto de abordagem; não recebe a chave privada do Google nem dados extras do resultado. Dados externos ficam no conteúdo da mensagem, separados das instruções de sistema. Toda mensagem precisa de revisão humana. A aplicação não envia campanhas nem registra entregas de email/WhatsApp.

Os endpoints Places e IA exigem uma sessão autenticada. A exceção é explicitamente `NODE_ENV=test` para os testes isolados do contrato antigo, nunca configuração de produção. Pausar a prospecção no perfil bloqueia novas buscas e gerações reais. Os limites por IP e tentativas de autenticação permanecem em memória e são apropriados para este produto pessoal; uma implantação pública com muitos usuários exige controle distribuído de quotas e abuso. Não configurar confiança indiscriminada em cabeçalhos de proxy. O endpoint aceita POSTs da mesma origem, de loopback para desenvolvimento ou de `APP_ORIGIN` explicitamente configurada, e não expõe CORS aberto.

Os testes em `tests/server.test.mjs` usam provedores simulados para validação de contratos, erros, cotas, privacidade de segredos e controle de chamadas. `tests/workspace.test.mjs` verifica autenticação, autorização, persistência após reinício SQLite, idempotência, conflitos de versão, CRUD, recebimentos, estornos e notificações por fuso. Não executam requisições faturáveis nem comprovam conectividade, faturamento ou acesso real aos provedores.
