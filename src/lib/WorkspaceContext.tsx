import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionUser, Workspace } from './workspace';

class RequestError extends Error { status: number; code: string; constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; } }
async function request<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch { throw new RequestError('Não foi possível conectar. Confira a conexão e tente novamente.', 0); }
  let data;
  try { data = await response.json(); } catch { throw new RequestError('O servidor retornou uma resposta inválida.', response.status); }
  if (!response.ok) throw new RequestError(data.error?.message || 'Não foi possível concluir a ação.', response.status, data.error?.code);
  return data as T;
}
interface ContextValue { accessMode: 'owner' | 'accounts'; user: SessionUser | null; workspace: Workspace | null; loading: boolean; error: string; databaseReady: boolean; live: boolean; lastSync: number; refresh: () => Promise<void>; command: (type: string, payload: unknown) => Promise<Workspace>; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<void>; logout: () => Promise<void>; reconnect: () => Promise<void> }
const Context = createContext<ContextValue | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null), [workspace, setWorkspace] = useState<Workspace | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [databaseReady, setDatabaseReady] = useState(true), [live, setLive] = useState(false), [lastSync, setLastSync] = useState(0);
  const [accessMode, setAccessMode] = useState<'owner' | 'accounts'>('owner');
  const latest = useRef<Workspace | null>(null), refreshing = useRef(false), generation = useRef(0);
  const accept = useCallback((value: Workspace) => { if (!latest.current || value.version >= latest.current.version) { latest.current = value; setWorkspace(value); } setLastSync(Date.now()); setLive(true); }, []);
  const refresh = useCallback(async () => { if (refreshing.current) return; refreshing.current = true; const ownGeneration = generation.current;
    try { const value = await request<Workspace>('/api/workspace'); if (ownGeneration === generation.current) { accept(value); setError(''); } }
    catch (e) { if (ownGeneration !== generation.current) return; setLive(false); if (e instanceof RequestError && e.status === 401) { latest.current = null; setWorkspace(null); setUser(null); } else setError(e instanceof Error ? e.message : 'Não foi possível atualizar os dados.'); }
    finally { refreshing.current = false; }
  }, [accept]);
  const session = useCallback(async (showLoading = true) => { if(showLoading) setLoading(true); setError('');
    try { const value = await request<{ user: SessionUser | null; databaseReady: boolean; accessMode?: 'owner' | 'accounts' }>('/api/session'); setAccessMode(value.accessMode || 'accounts'); setUser(value.user); setDatabaseReady(value.databaseReady !== false); if (value.user) { const state = await request<Workspace>('/api/workspace'); accept(state); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível acessar o servidor.'); setDatabaseReady(false); setLive(false); }
    finally { if(showLoading) setLoading(false); }
  }, [accept]);
  useEffect(() => { void session(); }, [session]);
  useEffect(() => { if (!user) return; const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5000); const visible = () => { if (document.visibilityState === 'visible') void refresh(); }; document.addEventListener('visibilitychange', visible); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); }; }, [user, refresh]);
  const authenticate = async (path: string, body: unknown) => { generation.current++; latest.current = null; await request(path, body); await session(); };
  const command = useCallback(async (type: string, payload: unknown) => { const body = { type, payload, requestId: crypto.randomUUID(), expectedVersion: latest.current?.version }; const ownGeneration = generation.current;
    let value: Workspace;
    try { value = await request<Workspace>('/api/command', body); }
    catch (e) { if (e instanceof RequestError && e.status === 0) value = await request<Workspace>('/api/command', body); else { if (e instanceof RequestError && e.status === 409) await refresh(); throw e; } }
    if (ownGeneration === generation.current) { accept(value); setError(''); }
    return value;
  }, [accept, refresh]);
  const logout = async () => { await request('/api/auth/logout', {}); generation.current++; latest.current = null; setWorkspace(null); setUser(null); setLive(false); setError(''); };
  return <Context.Provider value={{ accessMode, user, workspace, loading, error, databaseReady, live, lastSync, refresh, command, login: (email, password) => authenticate('/api/auth/login', { email, password }), register: (name, email, password) => authenticate('/api/auth/register', { name, email, password }), logout, reconnect: () => session(false) }}>{children}</Context.Provider>;
}
export function useSession() { const value = useContext(Context); if (!value) throw new Error('WorkspaceProvider ausente.'); return value; }
export function useWorkspace() { const value = useSession(); if (!value.workspace) throw new Error('A sessão precisa estar carregada.'); return { ...value, state: value.workspace }; }
