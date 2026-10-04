import { StoreError } from './store.mjs';

const unavailable = () => new StoreError(503, 'DATABASE_UNAVAILABLE', 'O armazenamento está indisponível. Tente novamente mais tarde.');
const configurationError = (code, message) => new StoreError(503, code, message);
const authenticationFailed = () => configurationError('DATABASE_AUTH_FAILED', 'O Supabase recusou a credencial do servidor. Verifique se SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY pertence ao mesmo projeto de SUPABASE_URL.');
const accessDenied = () => configurationError('DATABASE_ACCESS_DENIED', 'A credencial do servidor não tem permissão para acessar o Supabase. Verifique a chave secreta ou service_role e as permissões do banco.');
const schemaMissing = () => new StoreError(503, 'DATABASE_SCHEMA_MISSING', 'Prepare o projeto Supabase executando supabase/schema.sql no SQL Editor.');
const workspaceMissing = () => new StoreError(404, 'WORKSPACE_NOT_FOUND', 'A conta não foi encontrada.');

function versionConflict(currentVersion) {
  const error = new StoreError(409, 'VERSION_CONFLICT', 'Os dados foram atualizados em outra sessão. Recarregue antes de continuar.');
  if (Number.isSafeInteger(Number(currentVersion))) error.currentVersion = Number(currentVersion);
  return error;
}

function publicFailure(error) {
  return error instanceof StoreError || (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 && typeof error.code === 'string')
    ? error : unavailable();
}

function stringInput(value, { max = 200, empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || value.includes('\0')) {
    throw new StoreError(400, 'INVALID_INPUT', 'Os dados informados são inválidos.');
  }
  return value;
}

function parseWorkspace(value, version) {
  let state;
  try { state = JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)); }
  catch { throw unavailable(); }
  if (!state || typeof state !== 'object' || Array.isArray(state) || !Number.isSafeInteger(state.version) || state.version < 0 ||
      (version !== undefined && state.version !== Number(version))) throw unavailable();
  return state;
}

function serializeWorkspace(state, expectedVersion) {
  // Reject async transforms without leaving a rejected native Promise unhandled.
  if (state instanceof Promise) state.catch(() => {});
  if (!state || typeof state !== 'object' || Array.isArray(state) || typeof state.then === 'function' ||
      !Number.isSafeInteger(state.version) || state.version < 0 ||
      (expectedVersion !== undefined && state.version !== expectedVersion)) {
    throw new StoreError(500, 'INVALID_WORKSPACE', 'A atualização precisa produzir um estado válido de forma síncrona.');
  }
  try { return parseWorkspace(JSON.stringify(state), state.version); }
  catch { throw new StoreError(500, 'INVALID_WORKSPACE', 'Não foi possível armazenar a atualização.'); }
}

function expiry(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new StoreError(400, 'INVALID_SESSION', 'A validade da sessão é inválida.');
  return new Date(time).toISOString();
}

function commandInput(input) {
  if (!input || typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 200 || input.requestId.includes('\0') ||
      typeof input.type !== 'string' || !input.type || input.type.length > 100 || input.type.includes('\0') ||
      (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)) ||
      (input.payloadHash !== undefined && (typeof input.payloadHash !== 'string' || input.payloadHash.length > 200 || input.payloadHash.includes('\0')))) {
    throw new StoreError(400, 'INVALID_COMMAND', 'O identificador e a versão da atualização são obrigatórios.');
  }
  return { ...input, payloadHash: input.payloadHash ?? null };
}

function previousResult(previous, input) {
  if (!previous) return null;
  if (previous.type !== input.type || (previous.payload_hash ?? null) !== input.payloadHash) {
    throw new StoreError(409, 'IDEMPOTENCY_CONFLICT', 'Este identificador já foi usado para outra atualização.');
  }
  return parseWorkspace(previous.snapshot, previous.version);
}

function userRecord(row) {
  return row ? { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash } : null;
}

// Direct equality operands are literal in PostgREST. URLSearchParams encodes
// the complete value; extra quotes would become part of the ID being matched.
const equals = (value) => `eq.${value}`;

function mapResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw unavailable();
  if (!result.error) return result;
  switch (result.error) {
    case 'EMAIL_EXISTS': throw new StoreError(409, 'EMAIL_EXISTS', 'Este email já está cadastrado.');
    case 'WORKSPACE_NOT_FOUND': throw workspaceMissing();
    case 'IDEMPOTENCY_CONFLICT': throw new StoreError(409, 'IDEMPOTENCY_CONFLICT', 'Este identificador já foi usado para outra atualização.');
    case 'VERSION_CONFLICT': throw versionConflict(result.currentVersion);
    case 'INVALID_COMMAND': throw new StoreError(400, 'INVALID_COMMAND', 'O identificador e a versão da atualização são obrigatórios.');
    case 'INVALID_WORKSPACE': throw new StoreError(500, 'INVALID_WORKSPACE', 'A atualização não produziu um estado válido.');
    case 'INVALID_INPUT': throw new StoreError(400, 'INVALID_INPUT', 'Os dados informados são inválidos.');
    default: throw unavailable();
  }
}

/** Private server adapter. No Supabase key or raw provider error reaches clients. */
export class SupabaseStore {
  kind = 'supabase';
  persistent = true;
  initialized = false;
  initialization = null;
  closed = false;

  constructor({ env = process.env, fetch: fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  configure() {
    const rawUrl = this.env.SUPABASE_URL;
    const rawKey = this.env.SUPABASE_SECRET_KEY || this.env.SUPABASE_SERVICE_ROLE_KEY;
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw configurationError('DATABASE_URL_MISSING', 'SUPABASE_URL não está configurada no servidor.');
    }
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      throw configurationError('DATABASE_KEY_MISSING', 'SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.');
    }
    if (typeof this.fetchImpl !== 'function') throw unavailable();
    let url;
    try { url = new URL(rawUrl.trim()); }
    catch { throw configurationError('DATABASE_URL_INVALID', 'SUPABASE_URL é inválida. Use a URL HTTPS do projeto Supabase, sem caminho, parâmetros ou credenciais.'); }
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash ||
        (url.pathname !== '/' && url.pathname !== '')) {
      throw configurationError('DATABASE_URL_INVALID', 'SUPABASE_URL é inválida. Use a URL HTTPS do projeto Supabase, sem caminho, parâmetros ou credenciais.');
    }
    const key = rawKey.trim();
    if (/[\r\n]/.test(key)) {
      throw configurationError('DATABASE_KEY_MULTILINE', 'A chave Supabase contém uma quebra de linha. Configure a credencial do servidor em uma única linha.');
    }
    if (key.startsWith('sb_publishable_')) {
      throw configurationError('DATABASE_KEY_PUBLISHABLE', 'Uma chave publishable não pode ser usada no servidor. Use SUPABASE_SECRET_KEY ou uma chave service_role em SUPABASE_SERVICE_ROLE_KEY.');
    }
    // A legacy anon/authenticated JWT is not a server credential. Proxy-backed
    // secret bindings need not expose a JWT locally, so accept non-JWT keys.
    if (key.split('.').length === 3) {
      let claims;
      try {
        claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      } catch { throw configurationError('DATABASE_KEY_INVALID', 'A chave JWT do Supabase é inválida. Configure uma chave secreta ou service_role válida no servidor.'); }
      if (claims?.role !== 'service_role') {
        throw configurationError('DATABASE_KEY_NOT_SERVICE_ROLE', 'A chave JWT configurada não é service_role. Chaves anon e authenticated não podem ser usadas como credencial do servidor.');
      }
    }
    this.baseUrl = `${url.origin}/rest/v1/`;
    this.headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    // New sb_secret keys authenticate via apikey; only legacy JWT service keys
    // belong in Authorization. Never send credentials through a redirect.
    if (key.split('.').length === 3) this.headers.Authorization = `Bearer ${key}`;
  }

  async initialize() {
    if (this.closed) throw unavailable();
    if (!this.initialization) {
      this.initialization = (async () => {
        this.configure();
        const result = await this.request('rpc/ghost_health', { method: 'POST', body: {} });
        if (result?.schemaVersion !== 1) throw schemaMissing();
        if (this.closed) throw unavailable();
        this.initialized = true;
        return this;
      })().catch((error) => {
        this.initialized = false;
        this.initialization = null;
        throw publicFailure(error);
      });
    }
    return this.initialization;
  }

  ready() { return this.initialized && !this.closed; }

  async request(resource, { method = 'GET', query = {}, body, prefer } = {}) {
    if (this.closed) throw unavailable();
    const url = new URL(resource, this.baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    let response;
    let result;
    try {
      response = await this.fetchImpl(url.href, {
        method, headers: { ...this.headers, ...(prefer ? { Prefer: prefer } : {}) }, redirect: 'error',
        signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 401 || response.status === 403 || response.status === 204 || (response.ok && prefer === 'return=minimal')) result = null;
      else result = await response.json();
    } catch { throw unavailable(); }
    if (!response.ok) {
      if (response.status === 401) throw authenticationFailed();
      if (response.status === 403) throw accessDenied();
      if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(result?.code)) throw schemaMissing();
      if (result?.code === '23503') throw workspaceMissing();
      // Provider messages may contain hostnames, SQL or secrets. Use only
      // allowlisted error codes, never response text or fetch diagnostics.
      throw unavailable();
    }
    return result;
  }

  async select(table, query) {
    await this.initialize();
    const rows = await this.request(table, { query });
    if (!Array.isArray(rows)) throw unavailable();
    return rows;
  }

  async createUser({ id, name, email: rawEmail, passwordHash, workspace }) {
    stringInput(id);
    stringInput(name, { max: 160 });
    const email = stringInput(rawEmail, { max: 254, empty: true }).trim().toLowerCase();
    stringInput(passwordHash, { max: 2048, empty: true });
    const state = serializeWorkspace(workspace);
    await this.initialize();
    const result = mapResult(await this.request('rpc/ghost_create_user', { method: 'POST', body: {
      p_id: id, p_name: name, p_email: email, p_password_hash: passwordHash,
      p_workspace: state, p_created_at: new Date(this.now()).toISOString(),
    } }));
    if (!result.user || result.user.id !== id) throw unavailable();
    return userRecord(result.user);
  }

  async findUserByEmail(rawEmail) {
    const email = stringInput(rawEmail, { max: 254, empty: true }).trim().toLowerCase();
    const rows = await this.select('ghost_users', { select: 'id,name,email,password_hash', email: equals(email), limit: 1 });
    return userRecord(rows[0]);
  }

  async findUserById(id) {
    stringInput(id);
    const rows = await this.select('ghost_users', { select: 'id,name,email,password_hash', id: equals(id), limit: 1 });
    return userRecord(rows[0]);
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    stringInput(tokenHash);
    stringInput(userId);
    const expiration = expiry(expiresAt);
    await this.initialize();
    await this.request('ghost_sessions', { method: 'POST', prefer: 'return=minimal', body: {
      token_hash: tokenHash, user_id: userId, expires_at: expiration,
    } });
  }

  async getSession(tokenHash) {
    stringInput(tokenHash);
    const rows = await this.select('ghost_sessions', { select: 'user_id,expires_at', token_hash: equals(tokenHash), limit: 1 });
    const session = rows[0];
    if (!session) return null;
    const expiresAt = expiry(session.expires_at);
    if (Date.parse(expiresAt) <= this.now()) {
      await this.deleteSession(tokenHash);
      return null;
    }
    const user = await this.findUserById(session.user_id);
    return user ? { user: { id: user.id, name: user.name, email: user.email }, expiresAt } : null;
  }

  async deleteSession(tokenHash) {
    stringInput(tokenHash);
    await this.initialize();
    await this.request('ghost_sessions', { method: 'DELETE', query: { token_hash: equals(tokenHash) }, prefer: 'return=minimal' });
  }

  async readWorkspace(userId) {
    stringInput(userId);
    const rows = await this.select('ghost_workspaces', { select: 'version,state', user_id: equals(userId), limit: 1 });
    return rows[0] ? parseWorkspace(rows[0].state, rows[0].version) : null;
  }

  async command(userId, rawInput, transform) {
    stringInput(userId);
    const input = commandInput(rawInput);
    if (typeof transform !== 'function') throw new StoreError(400, 'INVALID_COMMAND', 'A atualização informada é inválida.');
    await this.initialize();
    let currentVersion;
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        // Read the snapshot before the receipt: a concurrently committed retry
        // must replay before an expectedVersion conflict is reported.
        const current = await this.readWorkspace(userId);
        if (!current) throw workspaceMissing();
        const previous = await this.select('ghost_commands', {
          select: 'type,payload_hash,version,snapshot', user_id: equals(userId), request_id: equals(input.requestId), limit: 1,
        });
        const replay = previousResult(previous[0], input);
        if (replay) return replay;
        const baseVersion = current.version;
        currentVersion = baseVersion;
        if (input.expectedVersion !== undefined && baseVersion !== input.expectedVersion) throw versionConflict(baseVersion);
        if (!Number.isSafeInteger(baseVersion + 1)) throw new StoreError(500, 'INVALID_WORKSPACE', 'A versão dos dados excedeu o limite de armazenamento.');
        const snapshot = serializeWorkspace(transform(current), baseVersion + 1);
        const result = await this.request('rpc/ghost_commit_command', { method: 'POST', body: {
          p_user_id: userId, p_request_id: input.requestId, p_type: input.type, p_payload_hash: input.payloadHash,
          p_base_version: baseVersion, p_expected_version: input.expectedVersion ?? null,
          p_snapshot: snapshot, p_created_at: new Date(this.now()).toISOString(),
        } });
        if (result?.error === 'CAS_CONFLICT') {
          currentVersion = result.currentVersion;
          continue;
        }
        const committed = mapResult(result);
        return parseWorkspace(committed.snapshot, committed.version);
      }
      throw versionConflict(currentVersion);
    } catch (error) { throw publicFailure(error); }
  }

  async listCommands(userId, options = {}) {
    stringInput(userId);
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new StoreError(400, 'INVALID_INPUT', 'A paginação do histórico é inválida.');
    const { afterVersion = 0, limit = 100 } = options;
    if (!Number.isSafeInteger(afterVersion) || afterVersion < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new StoreError(400, 'INVALID_INPUT', 'A paginação do histórico é inválida.');
    }
    const rows = await this.select('ghost_commands', {
      select: 'request_id,type,version,snapshot,created_at', user_id: equals(userId), version: `gt.${afterVersion}`, order: 'version.asc', limit,
    });
    return rows.map((row) => ({ requestId: row.request_id, type: row.type, version: Number(row.version), workspace: parseWorkspace(row.snapshot, row.version), createdAt: expiry(row.created_at) }));
  }

  async close() {
    this.closed = true;
    this.initialized = false;
    this.headers = undefined;
  }
}
