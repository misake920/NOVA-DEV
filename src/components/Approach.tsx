import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Copy, Mail, MessageCircle, Phone, Sparkles, Scissors, Languages, Building2, Save, LoaderCircle, GitCompareArrows } from 'lucide-react';
import type { ApproachInput, Channel, Config, Draft, Format, Language, Offer, Place, Tone } from '../types';
import { languages } from '../lib/data';
import { api } from '../lib/api';
import { localDraft } from '../lib/localDraft';
import { Field, Panel, EmptyState } from './ui';

export interface DraftToSave { subject: string; body: string; language: Language; channel: Channel; format: Format }

export default function Approach({ company, language: initialLanguage, config, initialOffer, onSaveOffer, onSaveDraft, onManual, initialDraft, objectionText }: {
  company: Place | null;
  language: Language;
  config: Config | null;
  initialOffer: Offer;
  onSaveOffer: (offer: Offer) => Promise<void>;
  onSaveDraft: (draft: DraftToSave) => Promise<void>;
  onManual: (company: Place) => void;
  initialDraft?: DraftToSave | null;
  objectionText?: string;
}) {
  const [offer, setOffer] = useState(initialOffer);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [channel, setChannel] = useState<Channel>('email');
  const [tone, setTone] = useState<Tone>('consultivo');
  const [format, setFormat] = useState<Format>('first');
  const [previous, setPrevious] = useState('');
  const [objection, setObjection] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [variant, setVariant] = useState<Draft | null>(null);
  const [draftLanguage, setDraftLanguage] = useState(initialLanguage);
  const [draftChannel, setDraftChannel] = useState<Channel>('email');
  const [draftFormat, setDraftFormat] = useState<Format>('first');
  const [useAI, setUseAI] = useState(Boolean(config?.aiEnabled));
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offerSaving, setOfferSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [email, setEmail] = useState('');
  const revision = useRef(0);

  const offerSignature = JSON.stringify(initialOffer);
  useEffect(() => setOffer(initialOffer), [offerSignature]);
  useEffect(() => setUseAI(Boolean(config?.aiEnabled)), [config?.aiEnabled]);
  useEffect(() => {
    revision.current++;
    setDraft(null); setVariant(null); setError(''); setNotice(''); setBusy(false);
    setEmail(''); setPrevious(''); setObjection(''); setFormat('first'); setLanguage(initialLanguage);
  }, [company?.id, initialLanguage]);
  useEffect(() => {
    if (!initialDraft) return;
    setDraft({ subject: initialDraft.subject, body: initialDraft.body, source: 'saved' });
    setDraftLanguage(initialDraft.language); setDraftChannel(initialDraft.channel); setDraftFormat(initialDraft.format);
    setLanguage(initialDraft.language); setChannel(initialDraft.channel); setFormat(initialDraft.format);
  }, [initialDraft]);
  useEffect(() => { if (objectionText) { setObjection(objectionText); setFormat('objection'); } }, [objectionText]);
  useEffect(() => () => { revision.current++; }, []);

  async function generate(action: 'generate' | 'shorten' | 'translate' | 'variant' = 'generate') {
    setError(''); setNotice('');
    if (!company) { setError('Informe a empresa ou selecione um cliente.'); return; }
    if (!offer.service.trim() || !offer.benefit.trim() || !offer.audience.trim() || !offer.goal.trim()) {
      setError('Preencha serviço, benefício, público e objetivo com sua oferta real.'); return;
    }
    if (format === 'followup' && !previous.trim()) { setError('Informe a mensagem anterior para preparar o follow-up.'); return; }
    if (format === 'objection' && !objection.trim()) { setError('Informe a objeção recebida para preparar a resposta.'); return; }
    if (action === 'translate' && (!config?.aiEnabled || !useAI)) {
      setError('A tradução integral depende da IA conectada. Você pode editar o texto ou gerar a estrutura local em outro idioma.'); return;
    }
    const instruction = action === 'shorten'
      ? 'Encurte o rascunho anterior preservando os fatos, o benefício e a próxima ação. Não invente informações.'
      : action === 'translate'
        ? `Traduza integralmente o rascunho anterior para ${language}, preservando todos os fatos e a oferta.`
        : action === 'variant'
          ? 'Crie uma segunda versão distinta do rascunho anterior, com uma abertura consultiva e uma pergunta simples. Preserve os fatos.'
          : undefined;
    const input: ApproachInput = { company, offer, language, channel, tone, format, objection, previous: instruction ? draft?.body : previous, instruction };
    const token = ++revision.current;
    setBusy(true);
    try {
      let result: Draft;
      if (useAI && config?.aiEnabled) result = await api<Draft>('/api/approach', { method: 'POST', body: JSON.stringify(input) });
      else {
        result = localDraft({ ...input, tone: action === 'shorten' ? 'direto' : action === 'variant' ? (tone === 'consultivo' ? 'formal' : 'consultivo') : tone });
        if (action === 'shorten') setNotice('Versão direta do modelo local. Ajustes manuais do rascunho anterior devem ser revisados.');
      }
      if (token !== revision.current) return;
      if (action === 'variant') setVariant(result);
      else {
        setDraft(result); setDraftLanguage(language); setDraftChannel(channel); setDraftFormat(format); setVariant(null);
      }
    } catch (e) { if (token === revision.current) setError(e instanceof Error ? e.message : 'Não foi possível preparar a abordagem.'); }
    finally { if (token === revision.current) setBusy(false); }
  }

  async function saveOffer() {
    setError(''); setOfferSaving(true);
    try { await onSaveOffer(offer); setNotice('Oferta salva no seu perfil.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a oferta.'); }
    finally { setOfferSaving(false); }
  }
  async function saveDraft() {
    if (!draft?.body.trim()) return;
    setSaving(true); setError('');
    try {
      await onSaveDraft({ subject: draft.subject, body: draft.body, language: draftLanguage, channel: draftChannel, format: draftFormat });
      setNotice('Abordagem salva no seu histórico.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.'); }
    finally { setSaving(false); }
  }
  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText([draft.subject, draft.body].filter(Boolean).join('\n\n')); setNotice('Mensagem copiada.'); }
    catch { setError('Selecione o texto para copiar manualmente; a área de transferência não está disponível.'); }
  }
  const phone = company?.phone?.replace(/\D/g, '');
  const dirtySettings = draft && (draftLanguage !== language || draftChannel !== channel || draftFormat !== format);
  const update = (key: keyof Offer, value: string) => setOffer(o => ({ ...o, [key]: value }));

  return <div className="approach-workbench">
    {!company && <Panel title="Com quem você quer conversar?">
      <form className="form-grid" onSubmit={e => {
        e.preventDefault();
        if (!manualName.trim() || !manualCategory.trim()) { setError('Informe o nome e o segmento do contato.'); return; }
        onManual({ id: `manual-${crypto.randomUUID()}`, name: manualName.trim(), category: manualCategory.trim(), phone: manualPhone.trim() || undefined, address: 'Informado por você', lat: 0, lng: 0, source: 'manual' });
      }}>
        <Field label="Nome da empresa"><input required maxLength={180} value={manualName} onChange={e => setManualName(e.target.value)} /></Field>
        <Field label="Segmento"><input required maxLength={100} value={manualCategory} onChange={e => setManualCategory(e.target.value)} /></Field>
        <Field label="Telefone comercial, com código do país"><input type="tel" maxLength={30} value={manualPhone} onChange={e => setManualPhone(e.target.value)} /></Field>
        <div className="form-actions"><button className="button button-primary" type="submit">Usar neste rascunho <ArrowRight size={16} /></button></div>
      </form>
      <p className="muted">Essas informações ficam neste rascunho. Cadastre o contato em Clientes para vinculá-lo ao seu CRM.</p>
    </Panel>}
    {company && <div className="approach-company"><Building2 size={21} /><div><strong>{company.name}</strong><span>{company.category} · {company.address}</span></div><span className="badge">{company.source === 'google' ? 'Google Places · consulta atual' : 'Informado por você'}</span></div>}
    <div className="approach-grid">
      <Panel title="Sua oferta, seu contexto" action={<span className="badge">01 / PREPARAR</span>}>
        <form onSubmit={e => { e.preventDefault(); void generate(); }} className="approach-form">
          <Field label="Serviço que você vende"><input required maxLength={500} value={offer.service} onChange={e => update('service', e.target.value)} /></Field>
          <Field label="Benefício real da sua oferta"><textarea required rows={2} maxLength={1000} value={offer.benefit} onChange={e => update('benefit', e.target.value)} /></Field>
          <div className="form-grid">
            <Field label="Público ideal"><input required maxLength={300} value={offer.audience} onChange={e => update('audience', e.target.value)} /></Field>
            <Field label="Objetivo deste contato"><input required maxLength={300} value={offer.goal} onChange={e => update('goal', e.target.value)} /></Field>
          </div>
          <Field label="Diferenciais e provas verificáveis · opcional"><textarea rows={2} maxLength={1000} value={offer.proof} onChange={e => update('proof', e.target.value)} /></Field>
          <button className="button button-secondary" type="button" disabled={offerSaving} onClick={() => void saveOffer()}><Save size={15} />{offerSaving ? 'Salvando…' : 'Salvar oferta no perfil'}</button>
          <div className="approach-divider" />
          <fieldset className="approach-channel"><legend>Canal da abordagem</legend><div className="toolbar">{([{ value: 'email', label: 'E-mail', icon: Mail }, { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }, { value: 'call', label: 'Ligação', icon: Phone }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" className={`button ${channel === value ? 'button-primary' : 'button-secondary'}`} aria-pressed={channel === value} onClick={() => setChannel(value)}><Icon size={16} />{label}</button>)}</div></fieldset>
          <div className="form-grid">
            <Field label="Idioma"><select value={language} onChange={e => setLanguage(e.target.value as Language)}>{languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></Field>
            <Field label="Tom"><select value={tone} onChange={e => setTone(e.target.value as Tone)}><option value="consultivo">Consultivo</option><option value="direto">Direto</option><option value="formal">Formal</option><option value="proximo">Próximo</option></select></Field>
          </div>
          <Field label="Tipo de mensagem"><select value={format} onChange={e => setFormat(e.target.value as Format)}><option value="first">Primeiro contato</option><option value="followup">Follow-up</option><option value="objection">Resposta a objeção</option></select></Field>
          {format === 'followup' && <Field label="Mensagem anterior"><textarea required rows={3} maxLength={4000} value={previous} onChange={e => setPrevious(e.target.value)} /></Field>}
          {format === 'objection' && <Field label="Objeção recebida"><textarea required rows={3} maxLength={1500} value={objection} onChange={e => setObjection(e.target.value)} /></Field>}
          {config?.aiEnabled ? <label className="check-label"><input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />Usar IA conectada</label> : <p className="approach-info">Modelo local disponível em cinco idiomas. Os campos da oferta permanecem no idioma em que você os escreveu.</p>}
          <button className="button button-primary" type="submit" disabled={busy || !company}>{busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{busy ? 'Preparando mensagem…' : useAI ? 'Gerar abordagem com IA' : 'Criar rascunho local'}</button>
        </form>
      </Panel>
      <Panel title="Sua próxima conversa" action={<span className="badge">02 / REVISAR</span>}>
        {!draft ? <EmptyState icon={MessageCircle} title="A mensagem começa com sua oferta" description="Escolha o contato, descreva o que você oferece e prepare uma abordagem revisável. O roteiro de ligação utiliza o canal Ligação." /> : <div className="draft-editor">
          <span className="badge">{draft.source === 'ai' ? 'Gerado com IA' : draft.source === 'saved' ? 'Rascunho do histórico · editável' : 'Estrutura local · editável'}</span>
          {dirtySettings && <p className="approach-info">Configurações alteradas. Gere novamente para aplicá-las ao rascunho.</p>}
          {draftChannel === 'email' && <Field label="Assunto"><input maxLength={240} value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} /></Field>}
          <Field label={draftChannel === 'call' ? 'Roteiro da ligação' : 'Mensagem'}><textarea className="draft-text" rows={13} maxLength={12000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></Field>
          <div className="toolbar"><button className="button button-secondary" disabled={busy} onClick={() => void generate('shorten')}><Scissors size={15} />Encurtar</button><button className="button button-secondary" disabled={busy} onClick={() => void generate('variant')}><GitCompareArrows size={15} />Comparar versão</button><button className="button button-secondary" disabled={busy} onClick={() => void generate('translate')}><Languages size={15} />Traduzir para idioma selecionado</button></div>
          {variant && <div className="approach-variant"><strong>Segunda versão · {variant.source === 'ai' ? 'IA' : 'modelo local'}</strong><textarea aria-label="Segunda versão da abordagem" rows={6} value={variant.body} onChange={e => setVariant({ ...variant, body: e.target.value })} /><button className="button button-secondary" onClick={() => { setDraft(variant); setDraftLanguage(language); setDraftChannel(channel); setDraftFormat(format); setVariant(null); }}>Usar esta versão</button></div>}
          <div className="toolbar"><button className="button button-primary" disabled={saving || !draft.body.trim()} onClick={() => void saveDraft()}><Save size={16} />{saving ? 'Salvando…' : 'Salvar no histórico'}</button><button className="button button-secondary" onClick={() => void copy()}><Copy size={16} />Copiar</button><button className="button button-secondary" onClick={() => { setPrevious(draft.body); setFormat('followup'); setNotice('Mensagem anterior adicionada. Prepare o próximo contato no formulário.'); }}>Preparar follow-up</button></div>
          {draftChannel === 'email' && <Field label="E-mail comercial do destinatário"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>}
          <div className="toolbar">{draftChannel === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <a className="button button-secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}><Mail size={16} />Abrir e-mail</a>}{draftChannel === 'whatsapp' && phone && <a className="button button-secondary" href={`https://wa.me/${phone}?text=${encodeURIComponent(draft.body)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Abrir WhatsApp</a>}{draftChannel === 'call' && phone && <a className="button button-secondary" href={`tel:${company?.phone?.replace(/[^+\d]/g, '')}`}><Phone size={16} />Abrir telefone</a>}</div>
          <p className="muted">Revise os fatos e a oferta. Copiar ou abrir um canal não confirma contato realizado.</p>
        </div>}
      </Panel>
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="approach-info" role="status">{notice}</p>}
  </div>;
}
