---
name: atommic
description: Criar, melhorar ou especificar sites e frontends com identidade própria, design impactante, fontes elegantes, hero 3D realista em Three.js, animações GSAP, Motion, scroll e referências 21st.dev, mantendo funcionalidades reais, mobile-first e execução econômica em créditos. Usar quando o usuário invocar atommic, pedir um prompt supremo de site ou solicitar esse padrão visual para qualquer nicho, landing page, portfólio, e-commerce, restaurante, imobiliária, sistema, dashboard ou site de agendamento. Adaptar os módulos ao projeto; não restringir a skill a agendamentos.
---

# atommic

Trabalhar em português brasileiro, salvo pedido contrário. Transformar a intenção de impacto supremo em decisões de direção de arte, qualidade de assets, movimento, interação e operação verificáveis. Aplicar o padrão a qualquer tipo de site; ativar apenas funcionalidades pertinentes ao pedido.

## 1. Definir a entrega e respeitar o escopo

1. Distinguir pedido de prompt, criação de site, melhoria visual e correção funcional. Ao pedir somente prompt, entregar um único texto pronto para copiar, sem iniciar código, deploy, geração de imagens ou configuração de serviços. Ao pedir implementação, executar o trabalho autorizado e conferir os fluxos afetados.
2. Consolidar requisitos e correções recentes. Aproveitar marca, imagens, referências, stack e regras comerciais fornecidas. Não importar nomes, cores, contatos ou bancos de outros projetos.
3. Para projeto existente, ler arquivos afetados e dependências necessárias. Preservar dados, autenticação, rotas, variáveis, integrações e comportamento fora do escopo. Corrigir um botão sem redesenhar o site; reformular o visual somente quando solicitado.
4. Para projeto novo, escolher arquitetura simples compatível com a entrega. Não forçar Next.js, Supabase, um gateway ou todas as bibliotecas sobre qualquer stack. Quando React for apropriado, considerar Three.js com React Three Fiber e Drei para a cena, GSAP para sequências e scroll e Motion para estados da interface.
5. Resolver detalhes reversíveis pelo contexto. Perguntar apenas sobre informação indispensável que não possa ser inferida. Deixar contatos, credenciais e URLs desconhecidos como configuração; nunca inventá-los.

## 2. Carregar somente o necessário

| Necessidade concreta | Referência a ler |
| --- | --- |
| Hero 3D, materiais, GSAP, Motion ou scroll | [3d-motion.md](references/3d-motion.md) |
| Criar, escolher ou adaptar fotografias e banners | [images.md](references/images.md) |
| Fluxos, painel administrativo, loja, CRM ou agendamento | [functional-flows.md](references/functional-flows.md) — somente o módulo relevante |
| Escrever o prompt final para outra ferramenta | [prompt-blueprint.md](references/prompt-blueprint.md) |
| Escolher uma base profissional, consultar uma API ou explicar as fontes | [sources.md](references/sources.md) |

Não ler todas as fontes externas a cada uso. Usar esta síntese como base e conferir documentação oficial apenas para API, versão, licença ou compatibilidade que precise de confirmação. Ao aplicar uma skill de plataforma disponível, seguir suas instruções pertinentes sem expandir o escopo.

## 3. Definir uma identidade reconhecível

Antes de montar páginas, escolher direção de arte coerente com público, oferta e marca. Traduzir em paleta, escala tipográfica, grid, espaçamento, materiais, enquadramento de imagens e linguagem de movimento. Não interromper o trabalho com opções se o contexto já permitir decidir.

- Criar um elemento de assinatura ligado à marca: objeto 3D, composição editorial, tratamento de imagem, transição ou detalhe gráfico. Variar a composição entre projetos; não repetir o mesmo template de hero, cartões, gradiente e rodapé em todos os nichos.
- Compor hierarquia clara, contraste e densidade intencional. Usar assimetria controlada, recortes, profundidade e alternância de ritmo quando fizerem sentido. Manter proximidade entre informação e ação. Evitar grandes vazios sem função, excesso de ornamentos e seções adicionadas somente para preencher espaço.
- Selecionar até duas famílias de fontes com licença adequada, acentos completos e pesos úteis. Considerar serifada editorial com sans legível para moda/luxo; sans com personalidade para tecnologia; sans acolhedora para serviços. Confirmar o encaixe na marca, evitando impor a mesma dupla a todos os sites.
- Ajustar tamanho fluido, entrelinha, largura de texto, alinhamento e espaçamento de letras. Reservar fontes expressivas para títulos e manter formulários, menus e tabelas fáceis de ler. Usar fallback estável e carregar somente pesos necessários.
- Usar tokens compartilhados para cor, tipografia, raio, sombra e espaçamento. Personalizar componentes até pertencerem à mesma marca. Usar 21st.dev como referência de acabamento e componentes compatíveis; não montar uma colagem de estilos desconexos.
- Construir copy específica para a oferta: benefício compreensível, prova disponível e CTA objetivo. Não fabricar resultados, números, depoimentos, clientes, urgência ou credenciais.

## 4. Construir o hero e o movimento

Para criação completa ou reformulação visual nesse padrão, projetar hero com 3D animado e relação clara com a marca. Descrever objeto, asset/modelo necessário, material, iluminação, câmera, animação e comportamento mobile. Não substituir o pedido de objeto realista por esfera genérica apenas porque é mais fácil.

Manter título, benefício e CTA utilizáveis enquanto o 3D carrega. Integrar a cena à composição com escala, sombras e cor coerentes. Usar pôster de qualidade durante carregamento ou falha; identificar imagem/vídeo como tal, sem declarar que é cena 3D interativa.

Aplicar GSAP a timelines, revelações e narrativa de scroll; Three.js à geometria, materiais e câmera; Motion às transições de estado, menus, modais e feedback. Atribuir um responsável por propriedade animada para evitar conflitos. Usar a referência técnica para realismo, cleanup, desempenho e acessibilidade.

Distribuir movimento com propósito: entrada do hero, resposta de controles, revelação de conteúdo, transição de seções e evolução pontual da cena no scroll. Preservar scroll nativo e navegação. Não bloquear compra, formulário ou leitura com sequências longas, pinning excessivo ou preloader ornamental.

## 5. Projetar primeiro para celular

- Desenhar hero, menu e fluxo principal em tela pequena, depois ampliar para tablet e desktop. Reenquadrar o 3D; não apenas encolher a composição de computador.
- Manter áreas de toque confortáveis, foco visível, labels, contraste e alternativas para controles por hover ou arraste. Permitir zoom e navegação por teclado.
- Evitar rolagem horizontal involuntária, cortes de texto e botões cobertos por canvas, cabeçalho fixo, modal ou CTA flutuante. Respeitar áreas seguras do aparelho e teclado virtual nos formulários.
- Ajustar complexidade da cena ao dispositivo, pausar efeitos fora de vista e respeitar prefers-reduced-motion. Preservar acabamento da alternativa leve; não entregar no celular uma tela visualmente abandonada.
- Usar HTML para conteúdo e controles essenciais, com semântica e imagens responsivas. Não renderizar textos comerciais e botões exclusivamente em canvas.

## 6. Fazer a beleza acompanhar o funcionamento

Para cada recurso solicitado, definir entrada → ação → resultado observável → fonte/persistência dos dados. Conectar menus, CTAs, filtros, busca, formulários, carrinho, cadastro e ações administrativas a seus comportamentos reais. Preferir rótulos específicos e feedback próximo da ação.

Desenhar estados inicial, carregando, vazio, sucesso, erro e indisponível nos fluxos relevantes. Impedir envios duplicados. Manter dados após recarregar quando o produto exigir persistência; não chamar localStorage ou números fixos de banco, CRM ou integração pronta.

Quando houver backend, validar e autorizar operações no servidor. Guardar segredos fora do frontend e expor somente dados necessários. Fazer mudanças administrativas refletirem no público correspondente. Ativar autenticação, estoque, pagamentos, agendamento ou CRM somente se fizerem parte do projeto.

Quando houver painéis, aplicar o mesmo cuidado de direção de arte: navegação clara, filtros, tabelas utilizáveis, ações por registro e gráficos úteis. Calcular indicadores da fonte real, com período e unidade claros; projetar estado vazio elegante em vez de inventar faturamento. Usar animação de gráficos para ajudar a leitura.

Se faltar acesso, asset ou credencial indispensável, concluir a parte independente, mostrar bloqueio exato e configuração necessária. Não simular sucesso, pagamento, envio de mensagem ou reserva confirmada.

## 7. Economizar créditos com decisões melhores

1. Consolidar o objetivo uma vez e escolher direção executável. Reutilizar componentes, assets, consultas e integrações existentes que atendam ao pedido.
2. Fazer inspeção direcionada, buscas em lote e leituras pequenas. Evitar auditoria global, clonagem de dezenas de repositórios, instalações redundantes, migrações e refatorações fora do escopo.
3. Pesquisar componentes para necessidade concreta. Comparar poucas opções adequadas, ler código/dependências/licença e adaptar uma base; não instalar catálogos inteiros ou serviços pagos por rotina.
4. Gerar apenas imagens necessárias, reutilizar assets aprovados e corrigir defeito específico por iteração. Não produzir várias alternativas completas sem pedido ou necessidade.
5. Concentrar maior investimento visual no hero, no elemento de assinatura e no fluxo principal; usar o sistema de design para manter acabamento das outras telas.
6. Fazer validação proporcional ao risco. Economia significa evitar repetição e trabalho sem finalidade; não omitir teste de fluxo que grava, cobra ou reserva. Não prometer número de créditos ou percentual de economia.
7. Não acionar agentes adicionais, serviços de geração ou integrações externas por rotina. Usar somente quando autorizado e necessário ao resultado.

## 8. Conferir e concluir

Fazer crítica visual curta antes de finalizar: identificar problema real → motivo → correção. Examinar hierarquia, fonte, contraste, coerência de materiais, cortes de imagens, responsividade, repetição de componentes e excesso de movimento. Ao não ter visto um site, tratar possíveis defeitos como riscos, sem inventar diagnóstico.

Em implementação, conferir fluxo principal afetado em celular e desktop, carregar página sem bloqueio pelo 3D e verificar navegação/controles. Testar persistência e erro nas integrações alteradas. Executar checks relevantes do projeto e testes adicionais quando a mudança puder causar conflito de dados ou cobrança. Repetir somente após nova alteração, falha ou dúvida concreta.

Não considerar screenshot bonita como funcionamento demonstrado. Corrigir problemas encontrados dentro do escopo e concluir trabalho autorizado. Informar sucintamente o que foi entregue, validado e qualquer dependência pendente; não afirmar realismo, desempenho ou integração verificados sem evidência.

Em modo prompt, incorporar esses critérios ao texto final e entregar só o prompt necessário. Usar a estrutura da referência, sem listar todas as fontes, todos os módulos ou esta skill inteira dentro de cada pedido.
