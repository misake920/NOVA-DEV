# 3D realista, GSAP e Motion

## Especificar uma cena viável

Definir cena principal: objeto ligado à oferta, enquadramento, escala, material, ambiente, luz, câmera e resposta ao usuário. Para realismo, exigir modelo bem construído ou asset licenciado com geometria coerente, detalhes de superfície e proporções. Para produto existente, usar referência fiel; não alterar suas características para embelezar.

Separar cena interativa com geometria real, imagem com aparência de render 3D e vídeo pré-renderizado. Escolher conforme o pedido. Não prometer rotação de câmera verdadeira usando fotografia plana. Para 3D interativo realista, garantir modelo/asset e pipeline adequados; se indisponíveis, registrar dependência ou construir cena procedural que possa atender com qualidade.

## Dirigir materiais e iluminação

- Usar materiais PBR apropriados. Ajustar roughness, metalness, mapas de normal e detalhes na escala do objeto. Evitar brilho plástico em todas as superfícies.
- Usar MeshStandardMaterial como base quando suficiente e MeshPhysicalMaterial para recursos necessários, como vidro, verniz ou tecido. Configurar environment map para reflexos convincentes e limitar recursos de maior custo.
- Combinar luz principal, preenchimento e contorno com função clara. Usar sombras de contato e oclusão com moderação para ancorar o objeto. Manter highlights controlados e leitura do volume.
- Conferir color space das texturas, exposição e tone mapping na versão instalada. Separar mapas de cor de mapas de dados. Não copiar configurações antigas sem conferir a API.
- Usar composição e câmera com perspectiva plausível. Evitar FOV que deforme o produto, objetos flutuando sem intenção e partes atravessando a cena.
- Usar HDRI, GLB/glTF, texturas e fontes com origem e licença verificadas. Armazenar assets necessários com o projeto; evitar depender de links temporários de demonstração.

## Coreografar o hero

Preparar entrada coordenada de objeto, título e CTA sem esconder o conteúdo até o fim. Animar câmera ou grupo principal com deslocamento suave. Escolher gesto de assinatura: detalhe do material, aproximação, giro parcial ou resposta sutil ao ponteiro.

Manter objeto afastado do texto e das áreas de toque. Aplicar pointer-events apenas onde necessário. Para exploração por arraste, fornecer instrução curta e alternativa por controle; não capturar gesto vertical de scroll no celular.

Usar pequena transformação narrativa durante scroll, como mudar enquadramento ao apresentar detalhes. Reservar pinning para trecho curto com propósito. Não animar todas as seções ao mesmo tempo ou obrigar visitante a assistir à sequência para clicar.

## Distribuir responsabilidades

| Sistema | Responsabilidade |
| --- | --- |
| Three.js / React Three Fiber | Cena, renderização, materiais, câmera e interação 3D |
| Drei | Helpers selecionados para ambiente, modelos e controles em React compatível |
| GSAP + ScrollTrigger | Timeline do hero e movimentos conectados ao scroll |
| Motion | Entrada/saída de menus, modais, estados, layout e microinterações |
| CSS | Estados simples e transições que dispensam um motor |

Não instalar React Three Fiber em projeto sem React por conveniência. Não deixar GSAP, Motion e CSS controlarem a mesma propriedade do mesmo elemento; usar wrappers distintos ao combinar efeitos.

## Aplicar GSAP com lifecycle correto

Registrar plugins usados. Em React, preferir useGSAP com refs e escopo local; usar cleanup de contexto e contextSafe em callbacks que criem animações. Reverter instâncias do componente ao desmontar, sem matar animações globais de outras telas.

Usar gsap.matchMedia para breakpoints e movimento reduzido. Escolher scrub para progresso vinculado ao scroll ou toggleActions para reprodução discreta. Em containerAnimation, usar ease linear no movimento horizontal. Atualizar medições após mudanças relevantes em layout/fontes/assets; não chamar refresh a cada frame.

Preservar scroll nativo. Acrescentar smooth scroll somente se trouxer benefício e testar a integração; não combinar dois sistemas. Evitar listeners e RAF duplicados. Separar wrapper fixado do conteúdo transformado quando necessário.

## Aplicar Motion com intenção

Reutilizar pacote/versão existente. Em instalação nova, conferir import recomendado na documentação oficial. Usar AnimatePresence com chaves estáveis para saídas e animações de layout em mudanças reais de estado. Preservar foco e interatividade durante transições.

Manter microinterações rápidas e feedback imediato; usar curvas coerentes com peso visual. Respeitar useReducedMotion ou mecanismo equivalente. Evitar animações de layout a cada tecla em formulário.

## Controlar custo de renderização

- Carregar cena pesada separadamente; exibir HTML e pôster dimensionado sem aguardar WebGL. Tratar falha de carregamento, falta de suporte e perda de contexto.
- Comprimir modelos/texturas quando apropriado e reutilizar geometrias, materiais e carregamentos. Reduzir draw calls e usar instancing para elementos repetidos.
- Limitar DPR conforme dispositivo e qualidade observada; começar com qualidade moderada em celular. Reduzir sombras, resolução de textura e efeitos antes de abandonar acabamento visual.
- Pausar animação fora da viewport e com aba oculta. Quando não houver movimento contínuo, considerar frameloop demand; invalidar frames durante alterações externas, como tweens GSAP, para evitar cena congelada.
- Em R3F, alterar refs/objetos para valores transitórios por frame em vez de disparar setState continuamente. Liberar recursos próprios com cuidado, preservando assets compartilhados.
- Usar pós-processamento seletivo e leve. Bloom forte, desfoque, transmissão em muitas malhas e partículas volumosas podem reduzir legibilidade e fluidez.
- Disponibilizar pausa para loops decorativos contínuos e versão estável sob movimento reduzido. Garantir que desligar efeitos preserve informação e ações.

## Conferir qualidade

Conferir proporção do objeto, materiais distinguíveis, sombras coerentes, cores sem highlights estourados e enquadramento em celular. Verificar CTA/menu com cena ativa e durante carregamento. Medir desempenho com ferramenta disponível no dispositivo/alvo relevante; tratar metas como metas, nunca como resultado medido automaticamente.
