import type { Offer, Language, CountryCode, Channel, Format } from '../types';

export type Currency = 'BRL' | 'EUR' | 'USD';
export type Page = 'dashboard' | 'prospecting' | 'approaches' | 'pipeline' | 'customers' | 'finance' | 'agenda' | 'settings';
export interface Profile { name: string; email: string; timezone: string; currency: Currency; offer: Offer; paused: boolean; soundNotifications: boolean; browserNotifications: boolean }
export interface Customer { id: string; name: string; email: string; phone: string; country: CountryCode; language: Language; category: string; website: string; websiteStatus: 'unknown' | 'informed' | 'not_informed' | 'verified_absent'; verificationNote: string; verifiedAt: string; notes: string; tags: string[]; createdAt: string; updatedAt: string }
export interface Stage { id: string; name: string; kind: 'open' | 'won' | 'lost'; order: number }
export interface Opportunity { id: string; customerId: string; title: string; service: string; amountMinor: number; currency: Currency; stageId: string; owner: string; nextAction: string; nextActionDate: string; lostReason: string; createdAt: string; updatedAt: string }
export interface Installment { id: string; amountMinor: number; dueDate: string }
export interface Sale { id: string; customerId: string; opportunityId: string; service: string; date: string; grossMinor: number; discountMinor: number; amountMinor: number; currency: Currency; method: string; note: string; installments: Installment[]; status: 'active' | 'cancelled'; createdAt: string; updatedAt: string }
export interface Receipt { id: string; saleId: string; amountMinor: number; date: string; method: string; installmentId: string; note: string; createdAt: string }
export interface Refund { id: string; receiptId: string; saleId: string; amountMinor: number; date: string; note: string; createdAt: string }
export interface Expense { id: string; title: string; amountMinor: number; currency: Currency; date: string; category: string; note: string; paid: boolean; createdAt: string; updatedAt: string }
export interface Task { id: string; title: string; dueDate: string; customerId: string; opportunityId: string; done: boolean; owner: string; note: string; createdAt: string; updatedAt: string }
export interface Notification { id: string; type: string; title: string; body: string; createdAt: string; read: boolean; entityType: Page; entityId: string }
export interface Goal { id: string; name: string; kind: 'sales' | 'receipts' | 'activities'; target: number; currency: Currency; startDate: string; endDate: string }
export interface Proposal { id: string; customerId: string; opportunityId: string; title: string; scope: string; amountMinor: number; currency: Currency; conditions: string; date: string; status: 'draft' | 'sent' | 'accepted' | 'rejected'; createdAt: string; updatedAt: string }
export interface SavedApproach { id: string; customerId: string; language: Language; channel: Channel; format: Format; subject: string; body: string; date: string; status: 'draft' | 'contacted' | 'replied'; nextStep: string; createdAt: string; updatedAt: string }
export interface SavedSearch { id: string; name: string; country: CountryCode; city: string; category: string; keyword: string }
export interface Objection { id: string; title: string; body: string; language: Language; service: string }
export interface Activity { id: string; title: string; type: string; entityId: string; createdAt: string }
export interface Workspace { version: number; profile: Profile; customers: Customer[]; stages: Stage[]; opportunities: Opportunity[]; sales: Sale[]; receipts: Receipt[]; refunds: Refund[]; expenses: Expense[]; tasks: Task[]; notifications: Notification[]; goals: Goal[]; proposals: Proposal[]; approaches: SavedApproach[]; savedSearches: SavedSearch[]; objections: Objection[]; activities: Activity[] }
export interface SessionUser { id: string; name: string; email: string }

export function money(minor: number, currency: Currency = 'BRL') { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100); }
export function parseMoney(raw: string) { const cleaned = raw.trim().replace(/\s/g, ''); const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned; if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um valor válido com até duas casas decimais.'); const [units, cents = ''] = normalized.split('.'); const result = Number(units) * 100 + Number(cents.padEnd(2, '0')); if (!Number.isSafeInteger(result) || result > 1_000_000_000_000) throw new Error('Valor fora do limite permitido.'); return result; }
export function localDate(timezone = 'America/Sao_Paulo', date = new Date()) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const get = (key: string) => parts.find(p => p.type === key)?.value; return `${get('year')}-${get('month')}-${get('day')}`; }
export function displayDate(date: string) { if (!date) return '—'; const [year, month, day] = date.slice(0, 10).split('-'); return `${day}/${month}/${year}`; }
export function netReceived(state: Workspace, saleId: string) { return state.receipts.filter(r => r.saleId === saleId).reduce((sum, r) => sum + r.amountMinor, 0) - state.refunds.filter(r => r.saleId === saleId).reduce((sum, r) => sum + r.amountMinor, 0); }
export function pending(state: Workspace, sale: Sale) { return sale.status === 'cancelled' ? 0 : Math.max(0, sale.amountMinor - netReceived(state, sale.id)); }
export function installmentBalances(state: Workspace, sale: Sale) {
  const receipts = state.receipts.filter(r => r.saleId === sale.id);
  const netFor = (rows: Receipt[]) => { const ids = new Set(rows.map(r => r.id)); return rows.reduce((sum,r) => sum + r.amountMinor,0) - state.refunds.filter(r => ids.has(r.receiptId)).reduce((sum,r) => sum+r.amountMinor,0); };
  let unassigned = netFor(receipts.filter(r => !r.installmentId));
  return [...sale.installments].sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map(installment => { const owed = Math.max(0,installment.amountMinor-netFor(receipts.filter(r=>r.installmentId===installment.id))); const balance = sale.status==='cancelled'?0:Math.max(0,owed-unassigned); unassigned=Math.max(0,unassigned-owed);return {...installment,balance}; });
}
