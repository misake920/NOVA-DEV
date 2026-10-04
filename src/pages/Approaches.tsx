import { useEffect, useRef, useState } from 'react';
import { BookOpen, MessageSquareText, Plus, Pencil, Trash2, History, ArrowUpRight } from 'lucide-react';
import Approach from '../components/Approach';
import type { DraftToSave } from '../components/Approach';
import { EmptyState, Field, Modal, PageHeading, Panel, useToast } from '../components/ui';
import { useWorkspace } from '../lib/WorkspaceContext';
import { api } from '../lib/api';
import { languages } from '../lib/data';
import { displayDate, localDate } from '../lib/workspace';
import type { Objection, SavedApproach } from '../lib/workspace';
import type { Config, Language, Place } from '../types';
import './prospecting.css';

function blankObjection(): Omit<Objection, 'id'> { return { title: '', body: '', language: 'pt-BR', service: '' }; }

export function ApproachesPage({ customerId: initialCustomerId, place: initialPlace }: { customerId?: string | null; place?: Place | null }) {
  const { state, command } = useWorkspace();
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState('');
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [manual, setManual] = useState<Place | null>(initialPlace || null);
  const [editing, setEditing] = useState<SavedApproach | null>(null);
  const [objectionModal, setObjectionModal] = useState(false);
  const [objection, setObjection] = useState<Omit<Objection, 'id'> & { id?: string }>(blankObjection);
  const [objectionText, setObjectionText] = useState('');
  const [statusDraft, setStatusDraft] = useState<SavedApproach | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savedId = useRef('');
  const customer = state.customers.find(c => c.id === customerId);
  const company: Place | null = customer ? { id: customer.id, name: customer.name, category: customer.category, address: 'Contato próprio do CRM', phone: customer.phone || undefined, website: customer.website || undefined, lat: 0, lng: 0, source: 'manual' } : manual;
  const language: Language = customer?.language || 'pt-BR';

  useEffect(() => {
    let active = true;
    api<Config>('/api/config').then(value => { if (active) setConfig(value); }).catch(() => { if (active) setConfigError('Não foi possível verificar a IA. Os modelos locais continuam disponíveis.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setCustomerId(initialCustomerId || ''); setManual(initialPlace || null); setEditing(null); savedId.current = ''; }, [initialCustomerId, initialPlace]);

  async function saveDraft(draft: DraftToSave) {
    const id = savedId.current || editing?.id || '';
    const current = state.approaches.find(a => a.id === id);
    const updated = await command('approach.save', { ...(id ? { id } : {}), ...draft, customerId, date: current?.date || editing?.date || localDate(state.profile.timezone), status: current?.status || editing?.status || 'draft', nextStep: current?.nextStep || editing?.nextStep || '' });
    savedId.current = id || updated.approaches[0].id;
  }
  async function saveObjection() {
    setError(''); setSaving(true);
    try { await command('objection.save', { ...objection, id: objection.id || undefined }); setObjectionModal(false); toast('Resposta salva na biblioteca.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  async function saveStatus() {
    if (!statusDraft) return;
    setError(''); setSaving(true);
    try { await command('approach.save', statusDraft); setStatusDraft(null); toast('Histórico de contato atualizado.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar.'); }
    finally { setSaving(false); }
  }
  async function remove(type: 'approach' | 'objection', id: string) {
    setError('');
    try { await command(`${type}.delete`, { id }); if (type === 'approach' && savedId.current === id) { savedId.current = ''; setEditing(null); } toast('Registro removido.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível remover.'); }
  }

  return <div className="approaches-page">
    <PageHeading eyebrow="CONVERSAS QUE AVANÇAM" title="Abordagens" description="Sua oferta real, o contexto de cada lead e uma próxima ação clara." />
    <Panel className="contact-selector" title="Escolha seu contato">
      <Field label="Cliente do seu CRM"><select value={customerId} onChange={e => { setCustomerId(e.target.value); setManual(null); setEditing(null); savedId.current = ''; }}><option value="">Informar um contato neste rascunho</option>{state.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {initialPlace && !customerId && <p className="muted">Você está usando um resultado da consulta atual. A ficha do Google não será salva no CRM.</p>}
      {configError && <p className="error-message">{configError}</p>}
    </Panel>
    <Approach company={company} language={language} config={config} initialOffer={state.profile.offer} onSaveOffer={async offer => { await command('profile.save', { offer }); }} onSaveDraft={saveDraft} onManual={p => { setManual(p); setCustomerId(''); setEditing(null); savedId.current = ''; }} initialDraft={editing} objectionText={objectionText} />
    <div className="grid-2 approach-history-grid">
      <Panel title="Histórico de abordagens" action={<History size={18} />}>
        {!state.approaches.length ? <EmptyState icon={MessageSquareText} title="Seu histórico começa na primeira conversa" description="Salve um rascunho e registre manualmente os contatos realizados e as respostas recebidas." /> : <div className="approach-history-list">{[...state.approaches].reverse().map(a => <article className="approach-history-card" key={a.id}>
          <div className="approach-history-top"><strong>{state.customers.find(c => c.id === a.customerId)?.name || 'Contato não vinculado'}</strong><span className="badge">{a.status === 'replied' ? 'Resposta recebida' : a.status === 'contacted' ? 'Contato registrado' : 'Rascunho'}</span></div>
          <p>{a.subject || a.body.slice(0, 130)}</p><span className="muted">{displayDate(a.date)} · {a.channel === 'call' ? 'Ligação' : a.channel === 'email' ? 'E-mail' : 'WhatsApp'} · {a.language}</span>
          {a.nextStep && <p className="approach-next-step">Próximo passo: {a.nextStep}</p>}
          <div className="toolbar"><button className="button button-secondary" onClick={() => { setCustomerId(a.customerId); setManual(a.customerId ? null : manual); setEditing(a); savedId.current = a.id; window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={14} />Abrir rascunho</button><button className="button button-secondary" onClick={() => { setError(''); setStatusDraft({ ...a }); }}><ArrowUpRight size={14} />Registrar contato</button><button className="button button-secondary" aria-label="Remover abordagem" onClick={() => void remove('approach', a.id)}><Trash2 size={14} /></button></div>
        </article>)}</div>}
      </Panel>
      <Panel title="Biblioteca de objeções" action={<button className="button button-secondary" onClick={() => { setObjection(blankObjection()); setError(''); setObjectionModal(true); }}><Plus size={15} />Adicionar</button>}>
        {!state.objections.length ? <EmptyState icon={BookOpen} title="Guarde suas melhores respostas" description="Cadastre objeções reais e respostas que funcionam para a sua oferta. Sua biblioteca começa vazia." /> : <div className="approach-history-list">{state.objections.map(o => <article className="approach-history-card" key={o.id}><div className="approach-history-top"><strong>{o.title}</strong><span className="badge">{o.language}</span></div><p className="objection-body">{o.body}</p>{o.service && <span className="muted">{o.service}</span>}<div className="toolbar"><button className="button button-secondary" onClick={() => { setObjectionText(o.title); toast('Objeção adicionada ao formulário. Adapte a resposta ao contexto real.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Preparar resposta</button><button className="button button-secondary" onClick={() => { setObjection({ ...o }); setError(''); setObjectionModal(true); }} aria-label="Editar objeção"><Pencil size={14} /></button><button className="button button-secondary" aria-label="Remover objeção" onClick={() => void remove('objection', o.id)}><Trash2 size={14} /></button></div></article>)}</div>}
      </Panel>
    </div>
    {error && !objectionModal && !statusDraft && <p className="error-message" role="alert">{error}</p>}
    {objectionModal && <Modal title={objection.id ? 'Editar resposta' : 'Adicionar à biblioteca'} onClose={() => setObjectionModal(false)}><form className="approach-form" onSubmit={e => { e.preventDefault(); void saveObjection(); }}><Field label="Objeção recebida"><input required maxLength={240} value={objection.title} onChange={e => setObjection({ ...objection, title: e.target.value })} /></Field><Field label="Sua resposta"><textarea required rows={5} maxLength={6000} value={objection.body} onChange={e => setObjection({ ...objection, body: e.target.value })} /></Field><Field label="Serviço"><input maxLength={500} value={objection.service} onChange={e => setObjection({ ...objection, service: e.target.value })} /></Field><Field label="Idioma"><select value={objection.language} onChange={e => setObjection({ ...objection, language: e.target.value as Language })}>{languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></Field>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar resposta'}</button></form></Modal>}
    {statusDraft && <Modal title="Registrar andamento do contato" onClose={() => setStatusDraft(null)}><form className="approach-form" onSubmit={e => { e.preventDefault(); void saveStatus(); }}><Field label="Situação real"><select value={statusDraft.status} onChange={e => setStatusDraft({ ...statusDraft, status: e.target.value as SavedApproach['status'] })}><option value="draft">Rascunho</option><option value="contacted">Eu realizei o contato</option><option value="replied">Recebi uma resposta</option></select></Field><Field label="Próximo passo"><textarea rows={3} maxLength={2000} value={statusDraft.nextStep} onChange={e => setStatusDraft({ ...statusDraft, nextStep: e.target.value })} /></Field><p className="muted">Registre somente ações que você realizou. Agende o próximo acompanhamento na Agenda.</p>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Atualizar histórico'}</button></form></Modal>}
  </div>;
}
