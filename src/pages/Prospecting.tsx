import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Search, Radar, MapPin, Star, Globe2, ArrowRight, Bookmark, Trash2, Plus, LoaderCircle, ExternalLink, Phone, Check, Building2, RefreshCw } from 'lucide-react';
import { EmptyState, Field, Modal, PageHeading, Panel, useToast } from '../components/ui';
import { useWorkspace } from '../lib/WorkspaceContext';
import { api } from '../lib/api';
import { categories, countries, languages, safeUrl } from '../lib/data';
import { localDate } from '../lib/workspace';
import type { Customer, SavedSearch } from '../lib/workspace';
import type { Config, CountryCode, Language, Place } from '../types';
import './prospecting.css';

const Globe = lazy(() => import('../components/Globe'));
type SearchFilters = { country: CountryCode; city: string; category: string; keyword: string };
const websiteLabels = { unknown: 'Site ainda não consultado', informed: 'Site informado na fonte', not_informed: 'Site não informado na fonte' };

export function ProspectingPage({ onApproach }: { onApproach: (customerId?: string, place?: Place) => void }) {
  const { state, command } = useWorkspace();
  const toast = useToast();
  const [country, setCountry] = useState<CountryCode>('BR');
  const [city, setCity] = useState(countries[0].city);
  const [category, setCategory] = useState(categories[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [nextPage, setNextPage] = useState('');
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [minRating, setMinRating] = useState('0');
  const [minReviews, setMinReviews] = useState('0');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [detailsLoaded, setDetailsLoaded] = useState<string[]>([]);
  const [offerMatch, setOfferMatch] = useState(false);
  const [regionMatch, setRegionMatch] = useState(false);
  const [saveSearchModal, setSaveSearchModal] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [customer, setCustomer] = useState<Partial<Customer>>({ name: '', category: '', phone: '', email: '', website: '', websiteStatus: 'unknown', verificationNote: '', notes: '', country: 'BR', language: 'pt-BR' });
  const [ownedData, setOwnedData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [lastFilters, setLastFilters] = useState<SearchFilters | null>(null);
  const searchRevision = useRef(0);
  const detailsRevision = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const detailsAbort = useRef<AbortController | null>(null);
  const selectedCountry = countries.find(c => c.code === country)!;
  const effectiveCategory = category === 'Outro segmento' ? customCategory : category;
  const filters: SearchFilters = { country, city: city.trim(), category: effectiveCategory.trim(), keyword: keyword.trim() };
  const live = Boolean(config?.placesEnabled && config.liveSearchAllowed);
  const getWebsiteState = (place: Place) => safeUrl(place.website) ? 'informed' : detailsLoaded.includes(place.id) ? 'not_informed' : 'unknown';
  const visible = places.filter(p => (Number(minRating) === 0 || (p.rating !== undefined && p.rating >= Number(minRating))) && (Number(minReviews) === 0 || (p.reviews !== undefined && p.reviews >= Number(minReviews))) && (websiteFilter === 'all' || getWebsiteState(p) === websiteFilter));
  const qualification = (offerMatch ? 40 : 0) + (regionMatch ? 30 : 0) + (selected?.phone ? 20 : 0) + (selected && getWebsiteState(selected) === 'not_informed' ? 10 : 0);

  async function refreshConfig() {
    setConfigError('');
    try { setConfig(await api<Config>('/api/config')); }
    catch { setConfigError('Não foi possível verificar o Google Places. Tente atualizar a conexão.'); }
  }
  useEffect(() => { void refreshConfig(); return () => { searchRevision.current++; detailsRevision.current++; searchAbort.current?.abort(); detailsAbort.current?.abort(); }; }, []);

  function changeCountry(code: CountryCode) {
    const c = countries.find(c => c.code === code)!;
    searchRevision.current++; detailsRevision.current++; searchAbort.current?.abort(); detailsAbort.current?.abort();
    setCountry(code); setCity(c.city); setPlaces([]); setSelected(null); setNextPage(''); setSearched(false); setLoading(false); setDetailsLoading(false); setError(''); setDetailError(''); setLastFilters(null); setDetailsLoaded([]);
  }
  function loadSaved(search: SavedSearch) {
    changeCountry(search.country); setCity(search.city); setKeyword(search.keyword);
    if (categories.includes(search.category)) { setCategory(search.category); setCustomCategory(''); }
    else { setCategory('Outro segmento'); setCustomCategory(search.category); }
    toast('Filtros carregados. Clique em Buscar empresas para consultar a fonte.');
  }
  async function search(pageToken?: string) {
    setError('');
    if (!filters.city || !filters.category) { setError('Informe uma cidade e um segmento.'); return; }
    if (!live) { setError(config?.placesEnabled ? 'A busca depende da configuração de uso do Google Places no servidor. Veja o status em Configurações.' : 'Configure GOOGLE_PLACES_API_KEY no servidor para pesquisar empresas reais.'); return; }
    if (pageToken && JSON.stringify(lastFilters) !== JSON.stringify(filters)) { setError('Os filtros mudaram. Faça uma nova busca antes de carregar mais resultados.'); return; }
    searchAbort.current?.abort(); detailsAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller;
    const token = ++searchRevision.current; detailsRevision.current++;
    setLoading(true); setDetailsLoading(false); setSelected(null); setDetailError('');
    if (!pageToken) { setPlaces([]); setDetailsLoaded([]); setNextPage(''); setSearched(false); }
    try {
      const result = await api<{ places: Place[]; nextPageToken?: string }>('/api/search', { method: 'POST', body: JSON.stringify({ ...filters, ...(pageToken ? { pageToken } : {}) }), signal: controller.signal });
      if (token !== searchRevision.current) return;
      setPlaces(previous => pageToken ? [...previous, ...result.places.filter(p => !previous.some(old => old.id === p.id))] : result.places);
      setSearched(true); setNextPage(result.nextPageToken || ''); setLastFilters(filters);
    } catch (e) { if (token === searchRevision.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível concluir a busca.'); }
    finally { if (token === searchRevision.current) setLoading(false); }
  }
  async function pick(place: Place) {
    detailsAbort.current?.abort();
    setSelected(place); setOfferMatch(false); setRegionMatch(false); setDetailError('');
    const token = ++detailsRevision.current;
    if (detailsLoaded.includes(place.id)) { setDetailsLoading(false); return; }
    const controller = new AbortController(); detailsAbort.current = controller;
    setDetailsLoading(true);
    try {
      const detail = await api<Place>(`/api/places/${encodeURIComponent(place.id)}?language=${selectedCountry.language}`, { signal: controller.signal });
      if (token !== detailsRevision.current) return;
      setSelected(detail); setPlaces(previous => previous.map(p => p.id === detail.id ? detail : p)); setDetailsLoaded(previous => [...new Set([...previous, detail.id])]);
    } catch (e) { if (token === detailsRevision.current && !controller.signal.aborted) setDetailError(e instanceof Error ? e.message : 'Os detalhes não puderam ser carregados.'); }
    finally { if (token === detailsRevision.current) setDetailsLoading(false); }
  }
  async function saveSearch() {
    setModalError(''); setSaving(true);
    try {
      if (!filters.city || !filters.category) throw new Error('Preencha cidade e segmento antes de salvar os filtros.');
      await command('search.save', { ...filters, name: searchName.trim() });
      setSaveSearchModal(false); toast('Filtros salvos. Nenhum resultado do Google foi armazenado.');
    } catch (e) { setModalError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  async function removeSearch(id: string) {
    try { await command('search.delete', { id }); toast('Filtro removido.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível remover.'); }
  }
  function openCustomer() {
    setCustomer({ name: '', category: '', phone: '', email: '', website: '', websiteStatus: 'unknown', verificationNote: '', notes: '', country, language: selectedCountry.language });
    setOwnedData(false); setModalError(''); setCustomerModal(true);
  }
  async function saveCustomer() {
    setModalError(''); setSaving(true);
    try {
      if (!ownedData) throw new Error('Confirme a origem das informações que você está cadastrando.');
      if (customer.websiteStatus === 'verified_absent' && !customer.verificationNote?.trim()) throw new Error('Descreva como você verificou a ausência de site.');
      await command('customer.save', { ...customer, tags: [], verifiedAt: customer.websiteStatus === 'verified_absent' ? localDate(state.profile.timezone) : '', websiteStatus: customer.website?.trim() ? 'informed' : customer.websiteStatus });
      setCustomerModal(false); toast('Contato próprio cadastrado no CRM.');
    } catch (e) { setModalError(e instanceof Error ? e.message : 'Não foi possível cadastrar.'); }
    finally { setSaving(false); }
  }

  return <div className="prospecting-page">
    <PageHeading eyebrow="SEU PRÓXIMO MERCADO" title="Prospecção internacional" description="Encontre negócios reais, avalie o contexto e prepare seu próximo contato." action={<button className="button button-secondary" onClick={openCustomer}><Plus size={16} />Cadastrar contato próprio</button>} />
    <div className="prospect-hero panel">
      <div className="prospect-hero-copy"><span className="eyebrow">CINCO PAÍSES. NOVAS CONVERSAS.</span><h2>Seu próximo cliente<br /><span>pode estar em qualquer lugar.</span></h2><p>Escolha o mercado, refine sua pesquisa e decida quais negócios combinam com a sua oferta.</p><div className="prospect-country-pills">{countries.map(c => <button key={c.code} aria-pressed={country === c.code} className={country === c.code ? 'active' : ''} onClick={() => changeCountry(c.code)}><span aria-hidden="true">{c.flag}</span>{c.name}</button>)}</div><div className="prospect-provider"><span className={`connection-dot ${live ? 'connected' : ''}`} />{live ? 'Google Places configurado para consultas' : config?.placesEnabled ? 'Chave presente · uso aguardando configuração' : 'Google Places aguardando configuração'}<button className="button button-secondary" onClick={() => void refreshConfig()} aria-label="Atualizar status da conexão"><RefreshCw size={13} /></button></div>{configError && <p className="error-message" role="alert">{configError}</p>}</div>
      <div className="prospect-globe"><Suspense fallback={<div className="globe-loading"><Globe2 size={42} /><span>Carregando o globo…</span></div>}><Globe country={country} paused={state.profile.paused} onCountrySelect={changeCountry} markers={places} /></Suspense><span className="prospect-globe-caption">{selectedCountry.name} / {selectedCountry.region}</span></div>
    </div>
    <Panel title="Encontre o contexto certo" action={<span className="badge">GOOGLE PLACES</span>}>
      <form className="prospect-search-form" onSubmit={e => { e.preventDefault(); void search(); }}>
        <Field label="País"><select value={country} onChange={e => changeCountry(e.target.value as CountryCode)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="Cidade"><input required maxLength={160} value={city} onChange={e => setCity(e.target.value)} /></Field>
        <Field label="Segmento"><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></Field>
        {category === 'Outro segmento' && <Field label="Seu segmento"><input required maxLength={160} value={customCategory} onChange={e => setCustomCategory(e.target.value)} /></Field>}
        <Field label="Termo adicional · opcional"><input maxLength={160} value={keyword} onChange={e => setKeyword(e.target.value)} /></Field>
        <div className="prospect-search-actions"><button type="submit" className="button button-primary" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}{loading ? 'Consultando…' : 'Buscar empresas'}</button><button type="button" className="button button-secondary" onClick={() => { setSearchName(''); setModalError(''); setSaveSearchModal(true); }}><Bookmark size={16} />Salvar filtros</button></div>
      </form>
      {state.savedSearches.length > 0 && <div className="saved-searches">{state.savedSearches.map(s => <div key={s.id}><button onClick={() => loadSaved(s)}><Bookmark size={13} />{s.name}</button><button onClick={() => void removeSearch(s.id)} aria-label={`Remover filtro ${s.name}`}><Trash2 size={13} /></button></div>)}</div>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </Panel>
    <div className="prospect-results-grid">
      <Panel title={searched ? `${visible.length} ${visible.length === 1 ? 'empresa' : 'empresas'} nesta consulta` : 'Resultados da pesquisa'} action={<Radar size={18} />}>
        <div className="prospect-result-filters"><Field label="Avaliação mínima"><select value={minRating} onChange={e => setMinRating(e.target.value)}><option value="0">Todas</option><option value="3">3 ou mais</option><option value="4">4 ou mais</option><option value="4.5">4,5 ou mais</option></select></Field><Field label="Mínimo de avaliações"><input type="number" min="0" max="1000000" value={minReviews} onChange={e => setMinReviews(e.target.value)} /></Field><Field label="Informação de site"><select value={websiteFilter} onChange={e => setWebsiteFilter(e.target.value)}><option value="all">Todas</option><option value="not_informed">Não informado após consulta</option><option value="informed">Site informado</option><option value="unknown">Ainda não consultado</option></select></Field></div>
        {loading && !places.length ? <div className="prospect-search-loading" role="status"><LoaderCircle className="spin" size={27} /><p>Consultando empresas na fonte…</p></div> : !visible.length ? <EmptyState icon={Search} title={searched ? 'Nenhuma empresa com estes critérios' : 'Comece pelo seu próximo mercado'} description={searched ? 'Ajuste os filtros ou consulte outra cidade e segmento.' : 'Faça uma pesquisa para consultar empresas reais. Sua lista começa vazia.'} /> : <div className="prospect-results">{visible.map(p => <button className={`prospect-result ${selected?.id === p.id ? 'selected' : ''}`} key={p.id} onClick={() => void pick(p)} aria-pressed={selected?.id === p.id}><div className="prospect-result-icon"><Building2 size={21} /></div><div className="prospect-result-content"><strong>{p.name}</strong><span className="muted">{p.category}</span><span className="prospect-address"><MapPin size={12} />{p.address}</span><div className="prospect-result-meta">{p.rating !== undefined && <span><Star size={12} />{p.rating.toLocaleString('pt-BR')}{p.reviews !== undefined ? ` (${p.reviews.toLocaleString('pt-BR')})` : ''}</span>}<span className={`website-state ${getWebsiteState(p)}`}>{websiteLabels[getWebsiteState(p)]}</span></div></div><ArrowRight size={16} /></button>)}</div>}
        {nextPage && <button className="button button-secondary prospect-more" disabled={loading} onClick={() => void search(nextPage)}>{loading ? 'Consultando…' : 'Carregar mais resultados'}</button>}
        {searched && <p className="muted prospect-attribution">Google Maps · {lastFilters?.city}. Resultados transitórios da consulta atual. Selecione uma empresa para consultar os detalhes de contato e site.</p>}
      </Panel>
      <Panel title="Qualifique antes de abordar" action={<span className="badge">CONTEXTO DO LEAD</span>}>
        {!selected ? <EmptyState icon={Building2} title="Cada negócio tem seu contexto" description="Selecione um resultado para consultar os detalhes e avaliar a adequação à sua oferta." /> : <div className="prospect-detail"><div className="prospect-detail-head"><span className="badge">GOOGLE PLACES</span><h3>{selected.name}</h3><p>{selected.category}</p></div><p className="prospect-address"><MapPin size={15} />{selected.address}</p>{detailsLoading && <p className="approach-info" role="status"><LoaderCircle className="spin" size={14} />Consultando detalhes…</p>}{detailError && <div className="error-message" role="alert">{detailError}<button className="button button-secondary" onClick={() => void pick(selected)}>Tentar novamente</button></div>}<div className="prospect-detail-facts"><div><span>Site</span><strong>{websiteLabels[getWebsiteState(selected)]}</strong>{safeUrl(selected.website) && <a href={safeUrl(selected.website)} target="_blank" rel="noopener noreferrer">Abrir site <ExternalLink size={13} /></a>}</div><div><span>Telefone comercial</span><strong>{selected.phone || (detailsLoading ? 'Consultando…' : detailsLoaded.includes(selected.id) ? 'Não informado na fonte' : 'Ainda não consultado')}</strong>{selected.phone && <a href={`tel:${selected.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} />Abrir telefone</a>}</div></div><p className="muted">Site não informado nesta fonte é um indício para verificação. Confirme com a empresa antes de afirmar que ela não possui site.</p><div className="qualification-box"><div><strong>Prioridade de trabalho</strong><span>{qualification}/100</span></div><label className="check-label"><input type="checkbox" checked={offerMatch} onChange={e => setOfferMatch(e.target.checked)} />Confirmei a adequação à minha oferta · 40 pontos</label><label className="check-label"><input type="checkbox" checked={regionMatch} onChange={e => setRegionMatch(e.target.checked)} />Confirmei que atendo esta região · 30 pontos</label><p className="muted">{selected.phone ? '20 pontos: telefone comercial informado.' : '0 pontos: contato comercial ainda não informado.'}<br />{getWebsiteState(selected) === 'not_informed' ? '10 pontos: site não informado após consulta dos detalhes.' : '0 pontos: sem indicação consultada de site não informado.'}</p><p className="muted">Critério de organização desta consulta. A pontuação não representa chance de venda.</p></div><button className="button button-primary" onClick={() => onApproach(undefined, selected)}><ArrowRight size={17} />Preparar abordagem</button>{selected.attributions?.map((a, index) => <p className="muted prospect-attribution" key={`${a.displayName}-${index}`}>{safeUrl(a.uri) ? <a href={safeUrl(a.uri)} target="_blank" rel="noopener noreferrer">{a.displayName}</a> : a.displayName}</p>)}</div>}
      </Panel>
    </div>
    {saveSearchModal && <Modal title="Salvar filtros de pesquisa" onClose={() => setSaveSearchModal(false)}><form className="approach-form" onSubmit={e => { e.preventDefault(); void saveSearch(); }}><Field label="Nome da pesquisa"><input required maxLength={180} value={searchName} onChange={e => setSearchName(e.target.value)} /></Field><p className="muted">Serão salvos país, cidade, segmento e termo adicional. A consulta será executada novamente quando você decidir buscar.</p>{modalError && <p className="error-message" role="alert">{modalError}</p>}<button className="button button-primary" disabled={saving} type="submit"><Bookmark size={16} />{saving ? 'Salvando…' : 'Salvar filtros'}</button></form></Modal>}
    {customerModal && <Modal title="Cadastrar contato próprio" onClose={() => setCustomerModal(false)}><form className="approach-form" onSubmit={e => { e.preventDefault(); void saveCustomer(); }}><p className="muted">Informe dados obtidos e verificados por você. Este formulário não importa a ficha do Google Places.</p><Field label="Nome da empresa ou cliente"><input required maxLength={180} value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} /></Field><div className="form-grid"><Field label="Segmento"><input maxLength={160} value={customer.category} onChange={e => setCustomer({ ...customer, category: e.target.value })} /></Field><Field label="País"><select value={customer.country} onChange={e => setCustomer({ ...customer, country: e.target.value as CountryCode })}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field><Field label="E-mail comercial"><input type="email" maxLength={200} value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} /></Field><Field label="Telefone comercial"><input type="tel" maxLength={30} value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} /></Field><Field label="Idioma"><select value={customer.language} onChange={e => setCustomer({ ...customer, language: e.target.value as Language })}>{languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></Field><Field label="Site"><input type="url" maxLength={500} value={customer.website} onChange={e => setCustomer({ ...customer, website: e.target.value })} /></Field></div><Field label="Verificação do site"><select value={customer.websiteStatus} onChange={e => setCustomer({ ...customer, websiteStatus: e.target.value as Customer['websiteStatus'] })}><option value="unknown">Ainda não verifiquei</option><option value="informed">Site informado</option><option value="not_informed">Site não informado pela minha fonte</option><option value="verified_absent">Verifiquei que não possui site</option></select></Field><Field label="Fonte e observação da verificação"><textarea required={customer.websiteStatus === 'verified_absent'} rows={3} maxLength={2000} value={customer.verificationNote} onChange={e => setCustomer({ ...customer, verificationNote: e.target.value })} /></Field><label className="check-label"><input type="checkbox" required checked={ownedData} onChange={e => setOwnedData(e.target.checked)} />Estou cadastrando dados próprios que obtive ou verifiquei por conta própria.</label>{modalError && <p className="error-message" role="alert">{modalError}</p>}<button className="button button-primary" disabled={saving} type="submit"><Check size={16} />{saving ? 'Salvando…' : 'Cadastrar no CRM'}</button></form></Modal>}
  </div>;
}
