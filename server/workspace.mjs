import { randomUUID } from 'node:crypto';

export class DomainError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (message, code = 'INVALID_INPUT', status = 400) => { throw new DomainError(status, code, message); };
const currencies = ['BRL', 'EUR', 'USD'];
const countries = ['BR', 'ES', 'IT', 'US', 'NL'];
const languages = ['pt-BR', 'es-ES', 'it-IT', 'en-US', 'nl-NL'];
const maxMoney = 1_000_000_000_000;

function text(raw, field, { required = false, max = 3000, fallback = '' } = {}) {
  if (raw === undefined || raw === null) raw = fallback;
  if (typeof raw !== 'string' || raw.length > max) fail(`O campo ${field} é inválido ou excede ${max} caracteres.`);
  const result = raw.trim();
  if (required && !result) fail(`Preencha ${field}.`);
  return result;
}
function choice(raw, allowed, field, fallback) { const val = raw ?? fallback; if (!allowed.includes(val)) fail(`O campo ${field} é inválido.`); return val; }
function bool(raw, field, fallback = false) { if (raw === undefined) return fallback; if (typeof raw !== 'boolean') fail(`O campo ${field} deve ser verdadeiro ou falso.`); return raw; }
function integer(raw, field, { min = 0, max = maxMoney, fallback = 0 } = {}) {
  const val = raw ?? fallback;
  if (!Number.isSafeInteger(val) || val < min || val > max) fail(`O campo ${field} deve ser um inteiro entre ${min} e ${max}.`);
  return val;
}
function date(raw, field, required = false) {
  const val = text(raw, field, { required, max: 10 });
  if (!val && !required) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || !Number.isFinite(Date.parse(`${val}T12:00:00Z`)) || new Date(`${val}T12:00:00Z`).toISOString().slice(0, 10) !== val) fail(`Informe uma data válida em ${field}.`);
  return val;
}
function email(raw, required = false) {
  const val = text(raw, 'email', { required, max: 254 }).toLowerCase();
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) fail('Informe um email válido.');
  return val;
}
function id(raw, required = false) {
  const val = text(raw, 'id', { required, max: 120 });
  if (val && !/^[A-Za-z0-9_-]+$/.test(val)) fail('Identificador inválido.');
  return val;
}
function object(raw, name = 'dados') { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`Informe ${name} corretamente.`); return raw; }
function reference(state, list, raw, required = false) {
  const val = id(raw, required);
  if (val && !state[list].some((entity) => entity.id === val)) fail('O registro relacionado não existe nesta conta.', 'NOT_FOUND', 404);
  return val;
}
function timestamp() { return new Date().toISOString(); }

export function initialWorkspace({ name, email: userEmail }) {
  return {
    version: 0,
    profile: { name, email: userEmail, timezone: 'America/Sao_Paulo', currency: 'BRL', offer: { service: '', benefit: '', audience: '', proof: '', goal: '' }, paused: false, soundNotifications: false, browserNotifications: false },
    stages: [
      { id: 'new', name: 'Novo', kind: 'open', order: 0 },
      { id: 'qualified', name: 'Em qualificação', kind: 'open', order: 1 },
      { id: 'contacted', name: 'Pronto para contato', kind: 'open', order: 2 },
      { id: 'meeting', name: 'Em conversa', kind: 'open', order: 3 },
      { id: 'proposal', name: 'Proposta enviada', kind: 'open', order: 4 },
      { id: 'won', name: 'Ganho', kind: 'won', order: 5 },
      { id: 'lost', name: 'Perdido', kind: 'lost', order: 6 },
    ],
    customers: [], opportunities: [], sales: [], receipts: [], refunds: [], expenses: [], tasks: [], notifications: [], goals: [], proposals: [], approaches: [], savedSearches: [], objections: [], activities: [],
  };
}

const specs = {
  customer: { list: 'customers', page: 'customers', label: 'Cliente' },
  opportunity: { list: 'opportunities', page: 'pipeline', label: 'Oportunidade' },
  stage: { list: 'stages', page: 'pipeline', label: 'Etapa' },
  sale: { list: 'sales', page: 'finance', label: 'Venda' },
  receipt: { list: 'receipts', page: 'finance', label: 'Recebimento' },
  expense: { list: 'expenses', page: 'finance', label: 'Despesa' },
  task: { list: 'tasks', page: 'agenda', label: 'Tarefa' },
  notification: { list: 'notifications', page: 'dashboard', label: 'Notificação' },
  goal: { list: 'goals', page: 'dashboard', label: 'Meta' },
  proposal: { list: 'proposals', page: 'customers', label: 'Proposta' },
  approach: { list: 'approaches', page: 'approaches', label: 'Abordagem' },
  search: { list: 'savedSearches', page: 'prospecting', label: 'Busca' },
  objection: { list: 'objections', page: 'approaches', label: 'Objeção' },
  profile: { page: 'settings', label: 'Perfil' },
};

function validateEntity(kind, input, state, old) {
  const p = { ...old, ...input };
  const t = (key, required = false, max = 3000) => text(p[key], key, { required, max });
  const d = (key, required = false) => date(p[key], key, required);
  const currency = () => choice(p.currency, currencies, 'moeda', state.profile.currency);
  const customer = (required = true) => reference(state, 'customers', p.customerId, required);
  const opportunity = () => reference(state, 'opportunities', p.opportunityId);
  if (kind === 'customer') {
    const website = t('website', false, 2048);
    if (website) { try { const u = new URL(website); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { fail('Website precisa ser uma URL HTTP ou HTTPS válida.'); } }
    const tags = p.tags ?? [];
    if (!Array.isArray(tags) || tags.length > 30) fail('Informe no máximo 30 tags.');
    const websiteStatus = choice(p.websiteStatus, ['unknown', 'informed', 'not_informed', 'verified_absent'], 'status do website', website ? 'informed' : 'unknown');
    const verificationNote = t('verificationNote', false, 1500);
    const verifiedAt = d('verifiedAt');
    if (websiteStatus === 'verified_absent' && (!verificationNote || !verifiedAt)) fail('A ausência verificada precisa de data e evidência da verificação.');
    if (websiteStatus === 'informed' && !website) fail('Informe o website ou selecione outro status.');
    return { name: t('name', true, 250), email: email(p.email), phone: t('phone', false, 100), country: choice(p.country, countries, 'país', 'BR'), language: choice(p.language, languages, 'idioma', 'pt-BR'), category: t('category', false, 250), website, websiteStatus, verificationNote, verifiedAt, notes: t('notes', false, 10_000), tags: [...new Set(tags.map((tag) => text(tag, 'tag', { required: true, max: 80 })))] };
  }
  if (kind === 'opportunity') {
    const stageId = reference(state, 'stages', p.stageId || state.stages.find((s) => s.kind === 'open')?.id, true);
    const lostReason = t('lostReason', false, 2000);
    if (state.stages.find((s) => s.id === stageId).kind === 'lost' && !lostReason) fail('Informe o motivo da perda.');
    return { customerId: customer(), title: t('title', true, 250), service: t('service', false, 1200), amountMinor: integer(p.amountMinor, 'valor'), currency: currency(), stageId, owner: t('owner', false, 160), nextAction: t('nextAction', false, 1500), nextActionDate: d('nextActionDate'), lostReason };
  }
  if (kind === 'stage') return { name: t('name', true, 100), kind: choice(p.kind, ['open', 'won', 'lost'], 'tipo de etapa', 'open'), order: integer(p.order, 'ordem', { max: 1000, fallback: state.stages.length }) };
  if (kind === 'sale') {
    const customerId = customer();
    const opportunityId = opportunity();
    const selected = state.opportunities.find((entry) => entry.id === opportunityId);
    if (selected && selected.customerId !== customerId) fail('A oportunidade não pertence ao cliente informado.');
    if (opportunityId && state.sales.some((entry) => entry.opportunityId === opportunityId && entry.status === 'active' && entry.id !== old?.id)) fail('Esta oportunidade já possui uma venda ativa.', 'DUPLICATE_SALE', 409);
    const grossMinor = integer(p.grossMinor, 'valor bruto');
    const discountMinor = integer(p.discountMinor, 'desconto');
    if (discountMinor > grossMinor) fail('O desconto não pode superar o valor bruto.');
    const amountMinor = grossMinor - discountMinor;
    if (!amountMinor) fail('A venda precisa ter um valor líquido maior que zero.');
    const saleDate = d('date', true);
    const values = p.installments ?? [{ amountMinor, dueDate: saleDate }];
    if (!Array.isArray(values) || !values.length || values.length > 24) fail('Informe de 1 a 24 parcelas.');
    const installments = values.map((part, index) => {
      object(part, 'a parcela');
      const candidate = id(part.id);
      const previous = old?.installments[index];
      if (candidate && !old?.installments.some((item) => item.id === candidate)) fail('Identificador da parcela inválido.');
      return { id: candidate || previous?.id || randomUUID(), amountMinor: integer(part.amountMinor, 'valor da parcela', { min: 1 }), dueDate: date(part.dueDate, 'vencimento', true) };
    });
    if (new Set(installments.map((part) => part.id)).size !== installments.length) fail('As parcelas precisam ter identificadores diferentes.');
    if (installments.reduce((sum, part) => sum + BigInt(part.amountMinor), 0n) !== BigInt(amountMinor)) fail('A soma das parcelas precisa ser igual ao valor líquido da venda.');
    const result = { customerId, opportunityId, service: t('service', true, 1200), date: saleDate, grossMinor, discountMinor, amountMinor, currency: currency(), method: t('method', false, 100), note: t('note', false, 5000), installments, status: old?.status || 'active' };
    if (old && state.receipts.some((receipt) => receipt.saleId === old.id)) {
      if (state.receipts.some((receipt) => receipt.saleId === old.id && receipt.date < result.date)) fail('A data da venda não pode ser posterior a um recebimento já registrado.', 'FINANCIAL_RECORD_LOCKED', 409);
      for (const field of ['customerId', 'opportunityId', 'grossMinor', 'discountMinor', 'amountMinor', 'currency', 'installments']) {
        if (JSON.stringify(old[field]) !== JSON.stringify(result[field])) fail('Uma venda com recebimentos tem valores, cliente e parcelas protegidos. Use estornos e novo registro.', 'FINANCIAL_RECORD_LOCKED', 409);
      }
    }
    return result;
  }
  if (kind === 'expense') return { title: t('title', true, 250), amountMinor: integer(p.amountMinor, 'valor', { min: 1 }), currency: currency(), date: d('date', true), category: t('category', false, 150), note: t('note', false, 5000), paid: bool(p.paid, 'paga') };
  if (kind === 'task') {
    const customerId = customer(false); const opportunityId = opportunity();
    const selected = state.opportunities.find((entry) => entry.id === opportunityId);
    if (customerId && selected && selected.customerId !== customerId) fail('A oportunidade não pertence ao cliente informado.');
    return { title: t('title', true, 250), dueDate: d('dueDate', true), customerId, opportunityId, done: bool(p.done, 'concluída'), owner: t('owner', false, 160), note: t('note', false, 5000) };
  }
  if (kind === 'goal') {
    const startDate = d('startDate', true); const endDate = d('endDate', true);
    if (endDate < startDate) fail('A data final da meta precisa ser igual ou posterior à inicial.');
    return { name: t('name', true, 250), kind: choice(p.kind, ['sales', 'receipts', 'activities'], 'tipo de meta', 'sales'), target: integer(p.target, 'meta', { min: 1 }), currency: currency(), startDate, endDate };
  }
  if (kind === 'proposal') {
    const customerId = customer(); const opportunityId = opportunity();
    const selected = state.opportunities.find((entry) => entry.id === opportunityId);
    if (selected && selected.customerId !== customerId) fail('A oportunidade não pertence ao cliente informado.');
    return { customerId, opportunityId, title: t('title', true, 250), scope: t('scope', true, 12_000), amountMinor: integer(p.amountMinor, 'valor'), currency: currency(), conditions: t('conditions', false, 5000), date: d('date', true), status: choice(p.status, ['draft', 'sent', 'accepted', 'rejected'], 'status da proposta', 'draft') };
  }
  if (kind === 'approach') return { customerId: customer(false), language: choice(p.language, languages, 'idioma', 'pt-BR'), channel: choice(p.channel, ['email', 'whatsapp', 'call'], 'canal', 'email'), format: choice(p.format, ['first', 'followup', 'objection'], 'formato', 'first'), subject: t('subject', false, 500), body: t('body', true, 12_000), date: d('date', true), status: choice(p.status, ['draft', 'contacted', 'replied'], 'status da abordagem', 'draft'), nextStep: t('nextStep', false, 2000) };
  if (kind === 'search') return { name: t('name', true, 160), country: choice(p.country, countries, 'país', 'BR'), city: t('city', true, 160), category: t('category', true, 160), keyword: t('keyword', false, 160) };
  if (kind === 'objection') return { title: t('title', true, 250), body: t('body', true, 6000), language: choice(p.language, languages, 'idioma', 'pt-BR'), service: t('service', false, 1200) };
  fail('Esta operação não existe.', 'NOT_FOUND', 404);
}

function event(state, type, entityId, body, { notify = true, page } = {}) {
  const kind = type.split('.')[0];
  const spec = specs[kind];
  const now = timestamp();
  state.activities.unshift({ id: randomUUID(), title: body, type, entityId, createdAt: now });
  if (notify) state.notifications.unshift({ id: randomUUID(), type, title: body, body: 'Alteração registrada e sincronizada na sua conta.', createdAt: now, read: false, entityType: page || spec?.page || 'dashboard', entityId });
}

export function applyCommand(current, type, rawPayload) {
  const state = structuredClone(current);
  const payload = object(rawPayload ?? {}, 'os dados da operação');
  const [kind, action, extra] = text(type, 'operação', { required: true, max: 100 }).split('.');
  const spec = specs[kind];
  if (!spec || extra) fail('Esta operação não existe.', 'NOT_FOUND', 404);
  const now = timestamp();
  if (kind === 'profile' && action === 'save') {
    const p = { ...state.profile, ...payload };
    const timezone = text(p.timezone, 'fuso', { required: true, max: 100 });
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { fail('Informe um fuso horário válido.'); }
    if (email(p.email, Boolean(state.profile.email)) !== state.profile.email) fail('A troca do email de acesso precisa de verificação específica e não está disponível nesta tela.');
    const offer = { ...state.profile.offer, ...object(p.offer || {}, 'a oferta') };
    state.profile = { name: text(p.name, 'nome', { required: true, max: 160 }), email: state.profile.email, timezone, currency: choice(p.currency, currencies, 'moeda', 'BRL'), offer: Object.fromEntries(['service', 'benefit', 'audience', 'proof', 'goal'].map((key) => [key, text(offer[key], key, { max: 1500 })])), paused: bool(p.paused, 'pausa'), soundNotifications: bool(p.soundNotifications, 'som'), browserNotifications: bool(p.browserNotifications, 'notificações') };
    event(state, type, '', 'Perfil atualizado');
  } else if (kind === 'notification' && ['read', 'readAll'].includes(action)) {
    const selectedId = action === 'read' ? reference(state, 'notifications', payload.id, true) : '';
    state.notifications.forEach((item) => { if (action === 'readAll' || item.id === selectedId) item.read = true; });
    event(state, type, selectedId, 'Notificações marcadas como lidas', { notify: false });
  } else if (kind === 'opportunity' && action === 'move') {
    const selectedId = reference(state, 'opportunities', payload.id, true);
    const stageId = reference(state, 'stages', payload.stageId, true);
    const old = state.opportunities.find((item) => item.id === selectedId);
    const result = validateEntity('opportunity', { stageId, lostReason: payload.lostReason ?? old.lostReason }, state, old);
    Object.assign(old, result, { updatedAt: now });
    event(state, type, selectedId, `Oportunidade movida: ${old.title}`);
  } else if (kind === 'sale' && action === 'cancel') {
    const selectedId = reference(state, 'sales', payload.id, true);
    const old = state.sales.find((item) => item.id === selectedId);
    if (old.status === 'cancelled') fail('Esta venda já foi cancelada.', 'ALREADY_CANCELLED', 409);
    old.status = 'cancelled'; old.updatedAt = now;
    event(state, type, selectedId, `Venda cancelada: ${old.service}`);
  } else if (kind === 'receipt' && action === 'refund') {
    const receiptId = reference(state, 'receipts', payload.id, true);
    const receipt = state.receipts.find((item) => item.id === receiptId);
    const amountMinor = integer(payload.amountMinor, 'valor do estorno', { min: 1 });
    const refunded = state.refunds.filter((item) => item.receiptId === receiptId).reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    if (refunded + BigInt(amountMinor) > BigInt(receipt.amountMinor)) fail('O estorno supera o valor ainda disponível deste recebimento.', 'EXCESS_REFUND', 409);
    const entity = { id: randomUUID(), receiptId, saleId: receipt.saleId, amountMinor, date: date(payload.date, 'data do estorno', true), note: text(payload.note, 'nota', { max: 5000 }), createdAt: now };
    if (entity.date < receipt.date) fail('O estorno não pode ser anterior ao recebimento.');
    state.refunds.unshift(entity);
    event(state, type, entity.id, 'Estorno registrado');
  } else if (kind === 'receipt' && action === 'save') {
    if (payload.id) fail('Recebimentos são registros imutáveis. Use estorno.', 'FINANCIAL_RECORD_LOCKED', 409);
    const saleId = reference(state, 'sales', payload.saleId, true);
    const sale = state.sales.find((item) => item.id === saleId);
    if (sale.status !== 'active') fail('Não é possível receber uma venda cancelada.', 'SALE_CANCELLED', 409);
    const amountMinor = integer(payload.amountMinor, 'valor recebido', { min: 1 });
    const received = state.receipts.filter((item) => item.saleId === saleId).reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    const refunded = state.refunds.filter((item) => item.saleId === saleId).reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    if (received - refunded + BigInt(amountMinor) > BigInt(sale.amountMinor)) fail('O recebimento supera o saldo em aberto.', 'EXCESS_RECEIPT', 409);
    const installmentId = id(payload.installmentId);
    if (installmentId) {
      const installment = sale.installments.find((item) => item.id === installmentId);
      if (!installment) fail('A parcela não pertence à venda.', 'NOT_FOUND', 404);
      const receipts = state.receipts.filter((item) => item.installmentId === installmentId);
      const ids = new Set(receipts.map((item) => item.id));
      const net = receipts.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) - state.refunds.filter((item) => ids.has(item.receiptId)).reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
      if (net + BigInt(amountMinor) > BigInt(installment.amountMinor)) fail('O recebimento supera o saldo da parcela.', 'EXCESS_RECEIPT', 409);
    }
    const paymentDate = date(payload.date, 'data do recebimento', true);
    if (paymentDate < sale.date) fail('O recebimento não pode ser anterior à venda.');
    const entity = { id: randomUUID(), saleId, amountMinor, date: paymentDate, method: text(payload.method, 'método', { max: 100 }), installmentId, note: text(payload.note, 'nota', { max: 5000 }), createdAt: now };
    state.receipts.unshift(entity);
    event(state, type, entity.id, 'Recebimento registrado');
  } else if (action === 'save' && !['profile', 'notification', 'receipt'].includes(kind)) {
    const selectedId = id(payload.id);
    const old = selectedId ? state[spec.list].find((item) => item.id === selectedId) : undefined;
    if (selectedId && !old) fail('O registro não existe nesta conta.', 'NOT_FOUND', 404);
    if (kind === 'stage' && old && payload.kind && payload.kind !== old.kind && state.stages.filter((stage) => stage.kind === old.kind).length === 1) fail('Mantenha ao menos uma etapa de cada tipo.', 'STAGE_REQUIRED', 409);
    if (state[spec.list].length >= 20_000 && !old) fail('O limite de registros desta conta foi atingido.', 'ACCOUNT_LIMIT', 409);
    const fields = validateEntity(kind, payload, state, old);
    const hasDates = !['stage', 'goal', 'search', 'objection'].includes(kind);
    const entity = { id: selectedId || randomUUID(), ...fields, ...(hasDates ? { createdAt: old?.createdAt || now, updatedAt: now } : {}) };
    if (old) Object.assign(old, entity); else state[spec.list].unshift(entity);
    event(state, type, entity.id, `${spec.label} ${old ? 'atualizado' : 'registrado'}: ${entity.name || entity.title || entity.service || 'registro'}`);
  } else if (action === 'delete' && !['profile', 'notification', 'receipt', 'sale'].includes(kind)) {
    const selectedId = reference(state, spec.list, payload.id, true);
    const old = state[spec.list].find((item) => item.id === selectedId);
    if (kind === 'customer' && ['opportunities', 'sales', 'tasks', 'proposals', 'approaches'].some((list) => state[list].some((item) => item.customerId === selectedId))) fail('Este cliente possui registros vinculados. Preserve seu histórico.', 'RECORD_IN_USE', 409);
    if (kind === 'opportunity' && ['sales', 'tasks', 'proposals'].some((list) => state[list].some((item) => item.opportunityId === selectedId))) fail('Esta oportunidade possui registros vinculados.', 'RECORD_IN_USE', 409);
    if (kind === 'stage') {
      if (state.stages.filter((item) => item.kind === old.kind).length === 1) fail('Mantenha ao menos uma etapa de cada tipo.', 'STAGE_REQUIRED', 409);
      const related = state.opportunities.filter((item) => item.stageId === selectedId);
      if (related.length) {
        const targetId = reference(state, 'stages', payload.targetStageId, true);
        if (targetId === selectedId) fail('Escolha outra etapa como destino.');
        const target = state.stages.find((item) => item.id === targetId);
        if (target.kind === 'lost' && related.some((item) => !item.lostReason)) fail('Informe os motivos de perda antes de migrar para esta etapa.');
        related.forEach((item) => { item.stageId = targetId; item.updatedAt = now; });
      }
    }
    state[spec.list] = state[spec.list].filter((item) => item.id !== selectedId);
    event(state, type, selectedId, `${spec.label} removido: ${old.name || old.title || 'registro'}`);
  } else fail('Esta operação não existe.', 'NOT_FOUND', 404);
  // Number-based public contracts remain exact by bounding both entries and sums.
  const groups = new Map();
  const checkTotal = (key, value) => {
    const total = (groups.get(key) || 0n) + BigInt(value);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail('O total ultrapassa a capacidade monetária segura desta conta.', 'ACCOUNT_LIMIT', 409);
    groups.set(key, total);
  };
  for (const sale of state.sales) { checkTotal(`sales:${sale.currency}`, sale.amountMinor); checkTotal(`gross:${sale.currency}`, sale.grossMinor); }
  for (const expense of state.expenses) checkTotal(`expenses:${expense.currency}`, expense.amountMinor);
  for (const receipt of state.receipts) checkTotal(`receipts:${state.sales.find((sale) => sale.id === receipt.saleId)?.currency}`, receipt.amountMinor);
  for (const refund of state.refunds) checkTotal(`refunds:${state.sales.find((sale) => sale.id === refund.saleId)?.currency}`, refund.amountMinor);
  if (state.receipts.length > 20_000 || state.refunds.length > 20_000 || state.activities.length > 50_000 || JSON.stringify(state).length > 16_000_000) fail('A conta atingiu o limite de armazenamento desta versão.', 'ACCOUNT_LIMIT', 409);
  state.version += 1;
  return state;
}

export function localDate(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (name) => parts.find((part) => part.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function overdueEvents(state, now = new Date()) {
  const today = localDate(state.profile.timezone, now);
  const known = new Set(state.notifications.map((item) => item.id));
  const entries = [];
  const add = (key, due, title, body, entityType, entityId) => {
    const notificationId = `overdue-${key}-${due}`;
    if (due && due < today && !known.has(notificationId)) entries.push({ id: notificationId, type: 'overdue', title, body, createdAt: now.toISOString(), read: false, entityType, entityId });
  };
  for (const task of state.tasks) if (!task.done) add(`task-${task.id}`, task.dueDate, `Tarefa vencida: ${task.title}`, `Vencimento: ${task.dueDate}`, 'agenda', task.id);
  for (const opportunity of state.opportunities) {
    const stage = state.stages.find((item) => item.id === opportunity.stageId);
    if (stage?.kind === 'open') add(`opportunity-${opportunity.id}`, opportunity.nextActionDate, `Follow-up vencido: ${opportunity.title}`, opportunity.nextAction || 'Atualize a próxima ação.', 'pipeline', opportunity.id);
  }
  for (const sale of state.sales.filter((item) => item.status === 'active')) {
    const receipts = state.receipts.filter((item) => item.saleId === sale.id);
    const netFor = (matches) => {
      const ids = new Set(matches.map((item) => item.id));
      return matches.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) - state.refunds.filter((item) => ids.has(item.receiptId)).reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    };
    let allocated = netFor(receipts.filter((item) => !item.installmentId));
    for (const installment of [...sale.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const owed = BigInt(installment.amountMinor) - netFor(receipts.filter((item) => item.installmentId === installment.id));
      const remaining = owed > allocated ? owed - allocated : 0n;
      allocated = allocated > owed ? allocated - owed : 0n;
      if (remaining > 0n) add(`installment-${installment.id}`, installment.dueDate, `Parcela vencida: ${sale.service}`, `Vencimento: ${installment.dueDate} • ${sale.currency}`, 'finance', sale.id);
    }
  }
  return entries;
}

export function applyOverdue(current, events) {
  const state = structuredClone(current);
  const known = new Set(state.notifications.map((item) => item.id));
  const added = events.filter((item) => !known.has(item.id));
  if (!added.length) return state;
  state.notifications.unshift(...added);
  added.forEach((item) => state.activities.unshift({ id: randomUUID(), title: item.title, type: 'overdue', entityId: item.entityId, createdAt: item.createdAt }));
  state.version += 1;
  return state;
}

export const authValidation = { text, email, object, id };
