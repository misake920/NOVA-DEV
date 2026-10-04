# Texturas terrestres do THE GHOST

As texturas `earth_day_4096.jpg` e `earth_bump_roughness_clouds_4096.jpg`
foram obtidas da distribuição oficial do Three.js **r180**:

- https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/earth_day_4096.jpg
- https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg

O [exemplo oficial Earth do Three.js](https://github.com/mrdoob/three.js/blob/r180/examples/webgpu_tsl_earth.html)
identifica o autor das imagens como **Solar System Scope**, com imagens
redimensionadas e mapas combinados pelo projeto Three.js.

**Crédito: Solar System Scope / INOVE — Earth textures, CC BY 4.0.**
Fonte e condições: https://www.solarsystemscope.com/textures/ .
Licença: https://creativecommons.org/licenses/by/4.0/ .

O THE GHOST transforma as cores em grafite na renderização, separa os canais
de relevo/nuvens/roughness e aplica iluminação vermelha. A textura de cor é
limitada a 2048 px no desktop e 1024 px no celular em memória; os arquivos
originais são mantidos para crédito e qualidade.

O arquivo `LICENSE-three.txt` preserva a licença MIT do código Three.js.
Essa licença do código não substitui a atribuição CC BY dos assets.

Os contornos de baixa resolução usados como fallback provêm de world-atlas
(Natural Earth), já incluído nas dependências do projeto.
