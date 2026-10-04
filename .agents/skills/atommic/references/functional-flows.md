# Funcionalidades conforme o produto

Ler somente o módulo relacionado ao pedido. Usar exemplos como decisões possíveis, não lista obrigatória para todos os sites. Especificar entradas, fonte dos dados, ação, autorização e resultado verificável.

## Landing pages, institucionais e portfólios

Ligar navegação/CTAs às rotas e seções corretas. Conectar formulário ao destino configurado, validar campos e mostrar sucesso após confirmação de envio. Abrir contato no canal certo, com telefone/URL fornecidos; não inventar contato. Separar clique que abre WhatsApp de mensagem enviada.

Em portfólios, usar apenas projetos reais como trabalhos entregues. Rotular inspirações/conceitos como tais. Se houver gestão de conteúdo, persistir edição de nome, imagens, descrição e links e refletir no público sem perder registros anteriores.

## E-commerce e catálogos

Definir selecionar produto/variação → quantidade → carrinho → destino de compra solicitado. Atualizar preço/total de forma consistente. Tratar estoque/variações indisponíveis quando fizerem parte do produto. Para WhatsApp, gerar resumo correto com produto, variação, quantidade e valores; não declarar pagamento concluído.

Para checkout real, validar preços/disponibilidade no servidor, usar provedor escolhido e confirmar pagamento por evento verificado no backend. Tratar repetição de eventos e estados pendente/falhou/pago. Nunca usar apenas página de retorno como prova de pagamento. Não acrescentar gateway a catálogo simples.

## Restaurantes e pedidos

Organizar menu/categorias, opções e adicionais pelas regras reais. Calcular total, entrega/retirada, endereço e disponibilidade do estabelecimento. Encaminhar pedido ao destino solicitado e apresentar estado real de recebimento. Especificar gerenciamento/persistência somente quando sistema de pedidos for solicitado.

## Imobiliárias, veículos e catálogos com busca

Modelar campos necessários e conectar filtros aos registros. Manter detalhe com fotos, preço e informações correspondentes. Ligar contato ao item certo. Projetar vazio, carregamento, paginação e URLs compartilháveis. Não inventar imóveis, disponibilidade ou preços como inventário real.

## SaaS, CRM e painéis administrativos

Definir entidades e papéis antes das telas. Ligar cadastro/edição/remoção ao backend adequado, com validação/autorização no servidor. Prever recuperação ou confirmação para ações destrutivas quando pertinente. Impedir acesso a dados de outro usuário/empresa.

Construir filtros, busca e ações com resultado visível. Calcular métricas da fonte/período corretos e explicitar unidades. Usar gráficos para pergunta operacional concreta, sem preencher dashboards com números aleatórios. No celular, adaptar tabelas/controles sem retirar informações essenciais.

## Agendamento — módulo condicional

Ativar somente para negócios que pedirem reserva/agendamento.

1. Definir serviço, duração, preço quando aplicável, profissional/recurso, disponibilidade, pausas e fuso do negócio. Modelar feriados, bloqueios e intervalos conforme necessário.
2. Selecionar serviço → profissional/recurso quando houver → data → horário disponível → dados mínimos de contato → confirmação.
3. Revalidar disponibilidade no servidor ao confirmar; impedir sobreposição por operação atômica no banco. Abranger intervalos/durações variáveis, não apenas igualdade do horário inicial. Não depender somente de esconder horários na interface.
4. Persistir reserva e exibir referência/status reais. Distinguir solicitação pendente de reserva confirmada conforme regra comercial. Tratar horário ocupado durante preenchimento e impedir envio duplicado.
5. Permitir reagendamento/cancelamento conforme regra e proteger acesso do cliente. No admin, oferecer agenda/bloqueios quando solicitados e refletir mudanças na disponibilidade pública.
6. Configurar confirmação/lembrete somente se solicitado e disponível. Não afirmar que enviou email/WhatsApp ao apenas abrir um link.
7. Validar tentativas concorrentes no mesmo intervalo, persistência depois de reload e cálculo no fuso correto. Usar ambiente de teste, sem criar reservas em produção por rotina.

## Aplicar acabamento comum

Projetar empty states com próxima ação útil. Manter edição digitada em erro recuperável. Mostrar erros junto ao campo/ação com orientação para resolver. Testar história afetada da interface ao backend e de volta à interface; corrigir primeira falha encontrada e retomar validação até concluir escopo.
