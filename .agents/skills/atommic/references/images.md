# Imagens profissionais para o projeto

## Planejar os assets

Priorizar imagens fornecidas e assets aprovados. Definir a função de cada imagem antes de gerar: hero, produto, ambiente, detalhe, projeto ou apoio editorial. Escolher enquadramento compatível com layout, evitando cortes ruins para caber.

Quando houver pedido de fotografia, banner ou ilustração gerada por IA, usar ferramenta de imagem disponível e suas instruções. Para pedido somente de prompt, escrever especificação do asset; não iniciar geração. Não substituir fotografia solicitada por formas SVG/CSS ou screenshot de UI.

## Formular brief para reduzir retrabalho

Especificar apenas o necessário:

1. Destino e proporção: posição na página e crop previsto no celular.
2. Assunto e referência: produto, ambiente ou pessoa; identificar o que permanecerá fiel.
3. Composição: ponto focal, perspectiva, distância de câmera e espaço para texto conforme layout real.
4. Estilo: fotografia editorial/comercial ou render, com textura e detalhes plausíveis.
5. Luz e paleta: direção, contraste, temperatura e relação com a identidade visual.
6. Restrições: preservar geometria, embalagem, marca e características fornecidas; evitar textos/logos inventados e watermark.

Exemplo adaptável: “Criar fotografia comercial para o hero de [nicho], mostrando [assunto] em [ambiente]. Usar [enquadramento] com área limpa para o título na composição definida. Aplicar luz [descrição] e paleta [cores da marca], mantendo texturas naturais e perspectiva plausível. Preservar [detalhes da referência]. Gerar sem textos ou marcas adicionais.”

## Conservar autenticidade

Usar fotos reais disponíveis para equipe, localização, instalações e produtos reais. Não apresentar pessoas, avaliações, resultados de tratamento ou instalações gerados como evidência real da empresa. Usar imagens de atmosfera para identidade visual quando adequadas e diferenciá-las de prova comercial.

Para edição, inspecionar asset e declarar o que mudar e preservar. Corrigir um problema por iteração. Usar transparência real quando necessário. Não tratar ferramenta de imagem como geradora automática de modelo GLB, geometria ou rotação 3D.

## Integrar ao frontend

- Incorporar asset final ao projeto e atualizar componente consumidor; não deixar apenas preview no chat ou URL temporária.
- Manter dimensões/ratio e srcset ou mecanismo responsivo da stack. Priorizar imagem crítica do hero e carregar demais conforme necessidade.
- Conferir recorte, resolução, contraste com texto e consistência entre seções. Usar overlay na intensidade necessária para leitura.
- Preferir asset bem reenquadrado a gerar duas variantes sem necessidade; gerar versão adicional se crop comprometer assunto.
- Usar alt contextual, ou vazio para decoração. Manter títulos, preços e botões em HTML, sem gravá-los no banner.
