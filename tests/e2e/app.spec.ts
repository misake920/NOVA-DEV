import { test, expect, type Page } from '@playwright/test';

async function signUp(page:Page) {
  await page.goto('/');
  await page.getByLabel('Seu nome',{exact:true}).fill('Verificação do sistema');
  await page.getByLabel('E-mail',{exact:true}).fill('e2e-'+crypto.randomUUID()+'@example.test');
  await page.getByLabel('Senha',{exact:true}).fill('Senha-teste-123456');
  await page.getByRole('button',{name:'Criar minha conta',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Bom dia|Boa tarde|Boa noite/})).toBeVisible();
}
async function navigate(page:Page,name:string) {
  const menu=page.getByRole('button',{name:'Abrir menu',exact:true});
  if(await menu.isVisible())await menu.click();
  await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
}
async function createCustomer(page:Page) {
  await navigate(page,'Clientes');
  await page.getByRole('button',{name:'Cadastrar cliente',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nome do cliente ou empresa',{exact:true}).fill('Cliente de verificação');
  await dialog.getByLabel('Segmento',{exact:true}).fill('Serviços');
  await dialog.getByRole('button',{name:'Cadastrar cliente',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Cliente de verificação',{exact:true}).first()).toBeVisible();
}
async function workspace(page:Page) { const response=await page.request.get('/api/workspace');expect(response.ok()).toBeTruthy();return response.json(); }

test('new account is empty, all eight areas are usable and responsive',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await signUp(page);
  const state=await workspace(page);
  for(const key of ['customers','sales','receipts','expenses','opportunities','tasks','goals','proposals','approaches'])expect(state[key]).toEqual([]);
  await expect(page.locator('.metric-card').first()).toContainText('R$ 0,00');
  await expect(page.getByText('Seu movimento começa aqui',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/empty-dashboard-'+info.project.name+'.png',fullPage:true});
  for(const name of ['Prospecção','Abordagens','Funil de vendas','Clientes','Financeiro','Agenda','Configurações','Dashboard']){
    await navigate(page,name);
    await expect(page.locator('.page-content')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await expect(page.getByText('Explorar demonstração',{exact:true})).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('manual sale, partial receipt and expense produce real financial totals and survive reload',async({page})=>{
  await signUp(page);await createCustomer(page);await navigate(page,'Financeiro');
  await page.getByRole('button',{name:'Adicionar venda',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Cliente *',{exact:true}).selectOption({label:'Cliente de verificação'});
  await dialog.getByLabel('Serviço ou produto *',{exact:true}).fill('Serviço cadastrado no teste');
  await dialog.getByLabel('Valor bruto *',{exact:true}).fill('1500,00');
  await dialog.getByRole('button',{name:'Registrar venda',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let state=await workspace(page);expect(state.sales).toHaveLength(1);expect(state.sales[0].amountMinor).toBe(150000);
  await page.getByRole('button',{name:/Registrar recebimento|Receber/}).first().click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('Valor recebido (BRL) *',{exact:true}).fill('500,00');
  await dialog.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Despesa',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('Descrição *',{exact:true}).fill('Despesa de verificação');
  await dialog.getByLabel('Valor *',{exact:true}).fill('100,00');
  await dialog.getByLabel('Despesa efetivamente paga',{exact:true}).check();
  await dialog.getByRole('button',{name:'Registrar despesa',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  state=await workspace(page);expect(state.receipts[0].amountMinor).toBe(50000);expect(state.expenses[0].amountMinor).toBe(10000);
  await navigate(page,'Dashboard');
  const cards=page.locator('.metric-card');
  await expect(cards.nth(0)).toContainText('R$ 1.500,00');await expect(cards.nth(1)).toContainText('R$ 500,00');await expect(cards.nth(2)).toContainText('R$ 1.000,00');await expect(cards.nth(3)).toContainText('R$ 400,00');
  await expect(page.locator('.cash-chart svg')).toBeVisible();
  await page.reload();await expect(cards.nth(3)).toContainText('R$ 400,00');
  await page.getByRole('button',{name:/Notificações,/}).click();await expect(page.locator('.notification-list')).toContainText('Recebimento');
});

test('CRM opportunity, follow-up and proposal persist without inventing a payment',async({page})=>{
  await signUp(page);await createCustomer(page);await navigate(page,'Funil de vendas');
  await page.getByRole('button',{name:'Nova oportunidade',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Título da oportunidade',{exact:true}).fill('Projeto de verificação');
  await dialog.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente de verificação'});
  await dialog.getByLabel('Serviço',{exact:true}).fill('Desenvolvimento');
  await dialog.getByLabel('Valor da oportunidade',{exact:true}).fill('2000,00');
  await dialog.getByRole('button',{name:'Salvar oportunidade',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state=await workspace(page);expect(state.opportunities).toHaveLength(1);expect(state.sales).toHaveLength(0);expect(state.receipts).toHaveLength(0);
  await navigate(page,'Agenda');
  await page.getByRole('button',{name:'Agendar tarefa',exact:true}).first().click();
  dialog=page.getByRole('dialog');await dialog.getByLabel('Próxima ação',{exact:true}).fill('Acompanhamento de verificação');
  await dialog.getByRole('button',{name:'Salvar tarefa',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Acompanhamento de verificação',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('Acompanhamento de verificação',{exact:true})).toBeVisible();
});

test('localized approaches use real input, save draft and keep contact status manual',async({page})=>{
  await signUp(page);await createCustomer(page);await navigate(page,'Abordagens');
  await page.getByLabel('Cliente do seu CRM',{exact:true}).selectOption({label:'Cliente de verificação'});
  await page.getByLabel('Serviço que você vende',{exact:true}).fill('Desenvolvimento de sites');
  await page.getByLabel('Benefício real da sua oferta',{exact:true}).fill('Organizar informações e contato');
  await page.getByLabel('Público ideal',{exact:true}).fill('Negócios locais');
  await page.getByLabel('Objetivo deste contato',{exact:true}).fill('Apresentar uma proposta');
  await page.getByRole('button',{name:'Salvar oferta no perfil',exact:true}).click();
  for(const lang of ['pt-BR','es-ES','it-IT','en-US','nl-NL']){
    await page.getByLabel('Idioma',{exact:true}).first().selectOption(lang);
    await page.getByRole('button',{name:'Criar rascunho local',exact:true}).click();
    await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue(/Cliente de verificação/);
  }
  await page.getByRole('button',{name:/Salvar.*histórico|Salvar rascunho/}).click();
  await expect(page.getByText('Abordagem salva no seu histórico.',{exact:true})).toBeVisible();
  const state=await workspace(page);expect(state.approaches).toHaveLength(1);expect(state.approaches[0].status).toBe('draft');expect(state.profile.offer.service).toBe('Desenvolvimento de sites');
});

test('financial workspace updates in a second session through real polling',async({page,context})=>{
  await signUp(page);const other=await context.newPage();await other.goto('/');await expect(other.locator('.metric-card').first()).toBeVisible();
  const customer=await page.request.post('/api/command',{data:{type:'customer.save',payload:{name:'Cliente de sincronização',country:'BR',language:'pt-BR'},requestId:crypto.randomUUID()}});
  expect(customer.ok()).toBeTruthy();const state=await customer.json();const id=state.customers[0].id;
  const response=await page.request.post('/api/command',{data:{type:'sale.save',payload:{customerId:id,service:'Registro para sincronização',grossMinor:70000,discountMinor:0,currency:'BRL',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())},requestId:crypto.randomUUID()}});
  if(!response.ok()){const value=await response.json();throw new Error(JSON.stringify(value));}
  await expect(other.locator('.metric-card').first()).toContainText('R$ 700,00',{timeout:12000});await other.close();
});
