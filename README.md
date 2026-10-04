# THE GHOST </>

Centro de prospecção internacional, abordagens comerciais, CRM e gestão financeira em preto e neon vermelho, criado com a skill atommic.

## Executar

Node.js 24.x e npm:

~~~bash
npm ci
npm run dev
~~~

Frontend Vite e API Express; o desenvolvimento local usa SQLite em /workspace/ghost-data/the-ghost.sqlite. Use GHOST_DATABASE_PATH para outro arquivo de banco. Nenhum cliente, venda ou outro registro comercial é criado automaticamente.

Para produção local:

~~~bash
npm run build
npm start
~~~

## Funcionalidades

- Cadastro/login com sessões privadas, dados isolados por conta e perfil persistente.
- Dashboard com saudação por fuso, relógio, indicadores financeiros, gráficos, funil, metas, tarefas e atividade real.
- Atualização entre sessões por consulta ao servidor a cada cinco segundos, com status e última atualização.
- Clientes, contatos, etiquetas, notas, histórico, revisão de duplicatas, propostas e tarefas.
- Funil com etapas configuráveis, arraste e alternativa por seletor, motivo de perda e venda vinculada após confirmação.
- Vendas, descontos, parcelas, recebimentos parciais, despesas, cancelamentos e estornos com histórico.
- Valores monetários inteiros, pagamentos e datas separados e totais BRL/EUR/USD separados.
- CSV de registros próprios, impressão/PDF de relatórios/propostas e exportação JSON da conta.
- Prospecção Places em Brasil, Espanha, Itália, Estados Unidos e Holanda; filtros salvos e qualificação explicável.
- Abordagens em cinco idiomas, modelos locais ou IA opcional, revisão, edição, cópia e histórico manual do contato.
- Biblioteca de objeções, metas, agenda, busca global e notificações reais.
- Globo Three.js com geografia real, câmera por país, materiais grafite, contornos neon, atmosfera, navegação e fallback.
- GSAP, partículas, pausa, movimento reduzido e telas adaptadas ao celular.

A fonte não informar um site não confirma a ausência de site. A interface distingue os estados e permite registrar verificação manual. Abrir WhatsApp/e-mail não confirma envio de mensagem. Os modelos locais traduzem a estrutura; campos livres permanecem como escritos, com revisão ou IA opcional para tradução completa.

## Publicação na Vercel

Veja [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). A aplicação usa uma função Express e PostgreSQL externo com TLS. DATABASE_URL é necessário para autenticação e dados de negócio na Vercel. Sem banco configurado, a API informa indisponibilidade; não utiliza SQLite efêmero como armazenamento de produção.

Configure credenciais somente nas variáveis privadas da hospedagem. .env.example contém nomes, sem valores. Places precisa de sua chave e das condições de uso aplicáveis; IA e Maps JavaScript API são opcionais. [Detalhes das integrações](server/INTEGRATIONS.md).

## Validar

~~~bash
npm run build
npm test
npm run test:e2e
~~~

A suíte de navegador inicia e encerra seu servidor automaticamente e usa SQLite exclusivo em /tmp/the-ghost-e2e. Seus registros de teste não entram no banco do produto. Os testes de API validam autenticação, isolamento, persistência, concorrência, parcelas, idempotência e estornos. Provedores externos são simulados nesses testes; isso não confirma chave, quota ou conexão real.

## Stack e assets

React, TypeScript, Vite, Express, pg, Three.js, GSAP e Lucide. SQLite local e PostgreSQL na publicação. Fontes Inter e Space Grotesk com licença OFL. Geometria world-atlas/Natural Earth em domínio público. Sem imagens externas necessárias.

Skill instalada: [.agents/skills/atommic/SKILL.md](.agents/skills/atommic/SKILL.md).
