import { mkdir, chmod, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** Public, credential-free errors shared by the persistence adapters. */
export class StoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "StoreError";
    this.status = status;
    this.code = code;
  }
}

class Mutex {
  tail = Promise.resolve();

  async run(operation) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function unavailable() {
  return new StoreError(503, "DATABASE_UNAVAILABLE", "O armazenamento está indisponível. Tente novamente mais tarde.");
}

function publicFailure(error) {
  // Domain validation can run inside a transaction; preserve its public HTTP
  // error while concealing SQL, hostnames, credentials and driver diagnostics.
  return error instanceof StoreError || (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 && typeof error.code === "string")
    ? error
    : unavailable();
}

function email(value) {
  return String(value).trim().toLowerCase();
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function userRecord(row) {
  return row ? { ...publicUser(row), passwordHash: row.password_hash ?? row.passwordHash } : null;
}

function serializeWorkspace(state, expectedVersion) {
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      !Number.isSafeInteger(state.version) || state.version < 0 ||
      (expectedVersion !== undefined && state.version !== expectedVersion)) {
    throw new StoreError(500, "INVALID_WORKSPACE", "A atualização não produziu um estado válido.");
  }
  if (typeof state.then === "function") {
    throw new StoreError(500, "INVALID_WORKSPACE", "A atualização precisa ser síncrona.");
  }
  try {
    return JSON.stringify(state);
  } catch {
    throw new StoreError(500, "INVALID_WORKSPACE", "Não foi possível armazenar a atualização.");
  }
}

function parseWorkspace(value, version) {
  let state;
  try {
    state = typeof value === "string" ? JSON.parse(value) : JSON.parse(JSON.stringify(value));
  } catch {
    throw unavailable();
  }
  if (!state || !Number.isSafeInteger(state.version) || state.version < 0 ||
      (version !== undefined && state.version !== Number(version))) throw unavailable();
  return state;
}

function expiry(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new StoreError(400, "INVALID_SESSION", "A validade da sessão é inválida.");
  }
  return new Date(time).toISOString();
}

function commandInput(input) {
  if (!input || typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 200 ||
      typeof input.type !== "string" || !input.type || input.type.length > 100 ||
      (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)) ||
      (input.payloadHash !== undefined && (typeof input.payloadHash !== "string" || input.payloadHash.length > 200))) {
    throw new StoreError(400, "INVALID_COMMAND", "O identificador e a versão da atualização são obrigatórios.");
  }
  return { ...input, payloadHash: input.payloadHash ?? null };
}

function previousResult(previous, input) {
  if (!previous) return null;
  if (previous.type !== input.type || (previous.payload_hash ?? previous.payloadHash ?? null) !== input.payloadHash) {
    throw new StoreError(409, "IDEMPOTENCY_CONFLICT", "Este identificador já foi usado para outra atualização.");
  }
  return parseWorkspace(previous.snapshot, previous.version);
}

function checkVersion(version, expectedVersion) {
  if (expectedVersion === undefined) return;
  if (Number(version) !== expectedVersion) {
    const error = new StoreError(409, "VERSION_CONFLICT", "Os dados foram atualizados em outra sessão. Recarregue antes de continuar.");
    error.currentVersion = Number(version);
    throw error;
  }
}

function workspaceMissing() {
  return new StoreError(404, "WORKSPACE_NOT_FOUND", "A conta não foi encontrada.");
}

function listOptions({ afterVersion = 0, limit = 100 } = {}) {
  if (!Number.isSafeInteger(afterVersion) || afterVersion < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new StoreError(400, "INVALID_INPUT", "A paginação do histórico é inválida.");
  }
  return { afterVersion, limit };
}

function commandRecord(row) {
  return {
    requestId: row.request_id ?? row.requestId,
    type: row.type,
    version: Number(row.version),
    workspace: parseWorkspace(row.snapshot, row.version),
    createdAt: expiry(row.created_at ?? row.createdAt),
  };
}

/** An isolated adapter for tests. Production never silently falls back to it. */
export class MemoryStore {
  kind = "memory";
  persistent = false;
  users = new Map();
  sessions = new Map();
  workspaces = new Map();
  commands = new Map();
  mutex = new Mutex();
  initialized = false;
  closed = false;

  constructor({ now = () => Date.now() } = {}) { this.now = now; }

  async initialize() {
    if (this.closed) throw unavailable();
    this.initialized = true;
    return this;
  }

  ready() { return this.initialized && !this.closed; }

  async createUser({ id, name, email: rawEmail, passwordHash, workspace }) {
    await this.initialize();
    return this.mutex.run(() => {
      const normalized = email(rawEmail);
      if ([...this.users.values()].some((user) => user.email === normalized) || this.users.has(id)) {
        throw new StoreError(409, "EMAIL_EXISTS", "Este email já está cadastrado.");
      }
      const state = serializeWorkspace(workspace);
      const user = { id, name, email: normalized, passwordHash };
      this.users.set(id, user);
      this.workspaces.set(id, state);
      this.commands.set(id, new Map());
      return { ...user };
    });
  }

  async findUserByEmail(rawEmail) {
    await this.initialize();
    return userRecord([...this.users.values()].find((user) => user.email === email(rawEmail)));
  }

  async findUserById(id) {
    await this.initialize();
    return userRecord(this.users.get(id));
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    await this.initialize();
    if (!this.users.has(userId)) throw workspaceMissing();
    const expiration = expiry(expiresAt);
    this.sessions.set(tokenHash, { userId, expiresAt: expiration });
  }

  async getSession(tokenHash) {
    await this.initialize();
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    const user = this.users.get(session.userId);
    if (!user || Date.parse(session.expiresAt) <= this.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return { user: publicUser(user), expiresAt: session.expiresAt };
  }

  async deleteSession(tokenHash) {
    await this.initialize();
    this.sessions.delete(tokenHash);
  }

  async readWorkspace(userId) {
    await this.initialize();
    const value = this.workspaces.get(userId);
    return value === undefined ? null : parseWorkspace(value);
  }

  async command(userId, rawInput, transform) {
    await this.initialize();
    const input = commandInput(rawInput);
    return this.mutex.run(() => {
      const value = this.workspaces.get(userId);
      if (value === undefined) throw workspaceMissing();
      const history = this.commands.get(userId);
      const replay = previousResult(history.get(input.requestId), input);
      if (replay) return replay;
      const current = parseWorkspace(value);
      checkVersion(current.version, input.expectedVersion);
      const version = current.version + 1;
      const snapshot = serializeWorkspace(transform(current), version);
      this.workspaces.set(userId, snapshot);
      history.set(input.requestId, { requestId: input.requestId, type: input.type, payloadHash: input.payloadHash, version, snapshot, createdAt: new Date(this.now()).toISOString() });
      return parseWorkspace(snapshot, version);
    });
  }

  async listCommands(userId, options) {
    await this.initialize();
    const { afterVersion, limit } = listOptions(options);
    return [...(this.commands.get(userId)?.values() ?? [])]
      .filter((row) => row.version > afterVersion).slice(0, limit).map(commandRecord);
  }

  async close() { this.closed = true; this.initialized = false; }
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ghost_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ghost_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES ghost_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ghost_sessions_expiry ON ghost_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ghost_workspaces (
  user_id TEXT PRIMARY KEY REFERENCES ghost_users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 0), state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ghost_commands (
  user_id TEXT NOT NULL REFERENCES ghost_users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, type TEXT NOT NULL, payload_hash TEXT,
  version INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id), UNIQUE (user_id, version)
);
`;

export class SQLiteStore {
  kind = "sqlite";
  persistent = true;
  mutex = new Mutex();
  initialized = false;
  closed = false;
  initialization = null;

  constructor(filename = "/workspace/ghost-data/the-ghost.sqlite", { now = () => Date.now() } = {}) {
    this.filename = filename === ":memory:" ? filename : path.resolve(filename);
    this.persistent = filename !== ":memory:";
    this.now = now;
  }

  async initialize() {
    if (this.closed) throw unavailable();
    if (!this.initialization) {
      this.initialization = this.open().catch((error) => {
        this.initialization = null;
        this.database?.close();
        this.database = undefined;
        throw error instanceof StoreError ? error : unavailable();
      });
    }
    await this.initialization;
    return this;
  }

  async open() {
    let DatabaseSync;
    try { ({ DatabaseSync } = await import("node:sqlite")); }
    catch { throw new StoreError(503, "DATABASE_DRIVER_UNAVAILABLE", "Este runtime precisa de Node.js 22.13 ou superior para o armazenamento SQLite."); }
    const existed = this.filename !== ":memory:" && existsSync(this.filename);
    if (this.filename !== ":memory:") await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(this.filename);
    if (!existed && this.filename !== ":memory:") await chmod(this.filename, 0o600);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    this.database.exec(SQLITE_SCHEMA);
    // Additive migration for an already provisioned early-version database.
    const columns = this.database.prepare("PRAGMA table_info(ghost_commands)").all();
    if (!columns.some((column) => column.name === "payload_hash")) {
      this.database.exec("ALTER TABLE ghost_commands ADD COLUMN payload_hash TEXT");
    }
    this.initialized = true;
  }

  ready() { return this.initialized && !this.closed; }

  async transaction(operation) {
    await this.initialize();
    return this.mutex.run(() => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const result = operation(this.database);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        try { this.database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
        throw error;
      }
    });
  }

  async createUser({ id, name, email: rawEmail, passwordHash, workspace }) {
    const normalized = email(rawEmail);
    const state = serializeWorkspace(workspace);
    try {
      return await this.transaction((db) => {
        db.prepare("INSERT INTO ghost_users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, name, normalized, passwordHash, new Date(this.now()).toISOString());
        db.prepare("INSERT INTO ghost_workspaces (user_id, version, state) VALUES (?, ?, ?)").run(id, workspace.version, state);
        return { id, name, email: normalized, passwordHash };
      });
    } catch (error) {
      if (error.errcode === 2067 || error.errcode === 1555 || error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        throw new StoreError(409, "EMAIL_EXISTS", "Este email já está cadastrado.");
      }
      throw publicFailure(error);
    }
  }

  async findUserByEmail(rawEmail) {
    await this.initialize();
    return userRecord(this.database.prepare("SELECT id, name, email, password_hash FROM ghost_users WHERE email = ? COLLATE NOCASE").get(email(rawEmail)));
  }

  async findUserById(id) {
    await this.initialize();
    return userRecord(this.database.prepare("SELECT id, name, email, password_hash FROM ghost_users WHERE id = ?").get(id));
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    await this.initialize();
    const expiration = expiry(expiresAt);
    this.database.prepare("INSERT INTO ghost_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiration);
  }

  async getSession(tokenHash) {
    await this.initialize();
    const row = this.database.prepare("SELECT u.id, u.name, u.email, s.expires_at FROM ghost_sessions s JOIN ghost_users u ON u.id = s.user_id WHERE s.token_hash = ?").get(tokenHash);
    if (!row) return null;
    if (Date.parse(row.expires_at) <= this.now()) {
      this.database.prepare("DELETE FROM ghost_sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }
    return { user: publicUser(row), expiresAt: row.expires_at };
  }

  async deleteSession(tokenHash) {
    await this.initialize();
    this.database.prepare("DELETE FROM ghost_sessions WHERE token_hash = ?").run(tokenHash);
  }

  async readWorkspace(userId) {
    await this.initialize();
    const row = this.database.prepare("SELECT version, state FROM ghost_workspaces WHERE user_id = ?").get(userId);
    return row ? parseWorkspace(row.state, row.version) : null;
  }

  async command(userId, rawInput, transform) {
    const input = commandInput(rawInput);
    try {
      return await this.transaction((db) => {
        const current = db.prepare("SELECT version, state FROM ghost_workspaces WHERE user_id = ?").get(userId);
        if (!current) throw workspaceMissing();
        const prior = db.prepare("SELECT type, payload_hash, version, snapshot FROM ghost_commands WHERE user_id = ? AND request_id = ?").get(userId, input.requestId);
        const replay = previousResult(prior, input);
        if (replay) return replay;
        checkVersion(current.version, input.expectedVersion);
        const version = Number(current.version) + 1;
        const snapshot = serializeWorkspace(transform(parseWorkspace(current.state, current.version)), version);
        db.prepare("UPDATE ghost_workspaces SET version = ?, state = ? WHERE user_id = ?").run(version, snapshot, userId);
        db.prepare("INSERT INTO ghost_commands (user_id, request_id, type, payload_hash, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(userId, input.requestId, input.type, input.payloadHash, version, snapshot, new Date(this.now()).toISOString());
        return parseWorkspace(snapshot, version);
      });
    } catch (error) {
      throw publicFailure(error);
    }
  }

  async listCommands(userId, options) {
    await this.initialize();
    const { afterVersion, limit } = listOptions(options);
    return this.database.prepare("SELECT request_id, type, version, snapshot, created_at FROM ghost_commands WHERE user_id = ? AND version > ? ORDER BY version LIMIT ?")
      .all(userId, afterVersion, limit).map(commandRecord);
  }

  async close() {
    await this.mutex.run(() => {
      this.database?.close();
      this.database = undefined;
      this.initialized = false;
      this.closed = true;
    });
  }
}

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS ghost_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ghost_users_email_unique ON ghost_users (LOWER(email));
CREATE TABLE IF NOT EXISTS ghost_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES ghost_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ghost_sessions_expiry ON ghost_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ghost_workspaces (
  user_id TEXT PRIMARY KEY REFERENCES ghost_users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 0), state JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS ghost_commands (
  user_id TEXT NOT NULL REFERENCES ghost_users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, type TEXT NOT NULL, payload_hash TEXT,
  version INTEGER NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, request_id), UNIQUE (user_id, version)
);
ALTER TABLE ghost_commands ADD COLUMN IF NOT EXISTS payload_hash TEXT;
`;

async function postgresConfig(connectionString, env) {
  let url;
  try {
    url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new StoreError(503, "DATABASE_NOT_CONFIGURED", "A conexão PostgreSQL configurada é inválida.");
  }
  const mode = url.searchParams.get("sslmode") || env.PGSSLMODE;
  const sslSetting = url.searchParams.get("ssl");
  const hostname = (url.searchParams.get("host") || url.hostname).toLowerCase();
  const loopback = hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const tlsDisabled = mode === "disable" || sslSetting === "false" || sslSetting === "0";
  // Compatibility mode can change pg's certificate-verification behavior.
  // Never forward it, including connections to a local development database.
  url.searchParams.delete("uselibpqcompat");
  const config = { connectionString: url.href, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 };
  const negotiation = url.searchParams.get("sslnegotiation");
  if (negotiation) {
    config.sslnegotiation = negotiation;
    url.searchParams.delete("sslnegotiation");
    config.connectionString = url.href;
  }
  if (mode === "no-verify" || sslSetting === "no-verify" || (!loopback && tlsDisabled)) {
    throw new StoreError(503, "DATABASE_TLS_INVALID", "Configure a conexão PostgreSQL com verificação do certificado TLS.");
  }
  // pg's sslmode=require may disable certificate verification. Normalize the
  // TLS settings explicitly while retaining provider-supplied CA/client certs.
  if (!loopback || (mode && mode !== "disable") || sslSetting === "true") {
    const ssl = { rejectUnauthorized: true };
    for (const [parameter, option, environment] of [["sslrootcert", "ca", "PGSSLROOTCERT"], ["sslcert", "cert", "PGSSLCERT"], ["sslkey", "key", "PGSSLKEY"]]) {
      const filename = url.searchParams.get(parameter) || env[environment];
      if (filename) ssl[option] = await readFile(filename, "utf8");
      url.searchParams.delete(parameter);
    }
    url.searchParams.delete("sslmode");
    url.searchParams.delete("ssl");
    url.searchParams.delete("uselibpqcompat");
    config.connectionString = url.href;
    config.ssl = ssl;
  }
  return config;
}

export class PostgresStore {
  kind = "postgres";
  persistent = true;
  initialized = false;
  closed = false;
  initialization = null;

  constructor(connectionString, { env = process.env, now = () => Date.now() } = {}) {
    this.connectionString = connectionString;
    this.env = env;
    this.now = now;
  }

  async initialize() {
    if (this.closed) throw unavailable();
    if (!this.initialization) {
      this.initialization = this.open().catch(async (error) => {
        await this.pool?.end().catch(() => {});
        this.pool = undefined;
        this.initialization = null;
        throw error instanceof StoreError ? error : unavailable();
      });
    }
    await this.initialization;
    return this;
  }

  async open() {
    let Pool;
    try {
      const pg = await import("pg");
      Pool = pg.Pool ?? pg.default?.Pool;
    } catch {
      throw new StoreError(503, "DATABASE_DRIVER_UNAVAILABLE", "Instale o driver PostgreSQL para habilitar o armazenamento persistente.");
    }
    this.pool = new Pool(await postgresConfig(this.connectionString, this.env));
    // An idle disconnection must not crash the process or print connection secrets.
    this.pool.on("error", () => {});
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize additive schema initialization across instances.
      await client.query("SELECT pg_advisory_xact_lock($1)", [746_726_681]);
      await client.query(POSTGRES_SCHEMA);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    this.initialized = true;
  }

  ready() { return this.initialized && !this.closed; }

  async transaction(operation) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async createUser({ id, name, email: rawEmail, passwordHash, workspace }) {
    const normalized = email(rawEmail);
    const state = serializeWorkspace(workspace);
    try {
      return await this.transaction(async (client) => {
        await client.query("INSERT INTO ghost_users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)", [id, name, normalized, passwordHash, new Date(this.now()).toISOString()]);
        await client.query("INSERT INTO ghost_workspaces (user_id, version, state) VALUES ($1, $2, $3::jsonb)", [id, workspace.version, state]);
        return { id, name, email: normalized, passwordHash };
      });
    } catch (error) {
      if (error.code === "23505") throw new StoreError(409, "EMAIL_EXISTS", "Este email já está cadastrado.");
      throw publicFailure(error);
    }
  }

  async findUserByEmail(rawEmail) {
    await this.initialize();
    const { rows } = await this.pool.query("SELECT id, name, email, password_hash FROM ghost_users WHERE LOWER(email) = $1", [email(rawEmail)]);
    return userRecord(rows[0]);
  }

  async findUserById(id) {
    await this.initialize();
    const { rows } = await this.pool.query("SELECT id, name, email, password_hash FROM ghost_users WHERE id = $1", [id]);
    return userRecord(rows[0]);
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    await this.initialize();
    await this.pool.query("INSERT INTO ghost_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [tokenHash, userId, expiry(expiresAt)]);
  }

  async getSession(tokenHash) {
    await this.initialize();
    const { rows } = await this.pool.query("SELECT u.id, u.name, u.email, s.expires_at FROM ghost_sessions s JOIN ghost_users u ON u.id = s.user_id WHERE s.token_hash = $1", [tokenHash]);
    const row = rows[0];
    if (!row) return null;
    const expiration = expiry(row.expires_at);
    if (Date.parse(expiration) <= this.now()) {
      await this.deleteSession(tokenHash);
      return null;
    }
    return { user: publicUser(row), expiresAt: expiration };
  }

  async deleteSession(tokenHash) {
    await this.initialize();
    await this.pool.query("DELETE FROM ghost_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async readWorkspace(userId) {
    await this.initialize();
    const { rows } = await this.pool.query("SELECT version, state FROM ghost_workspaces WHERE user_id = $1", [userId]);
    return rows[0] ? parseWorkspace(rows[0].state, rows[0].version) : null;
  }

  async command(userId, rawInput, transform) {
    const input = commandInput(rawInput);
    try {
      return await this.transaction(async (client) => {
        const { rows } = await client.query("SELECT version, state FROM ghost_workspaces WHERE user_id = $1 FOR UPDATE", [userId]);
        const current = rows[0];
        if (!current) throw workspaceMissing();
        const previous = await client.query("SELECT type, payload_hash, version, snapshot FROM ghost_commands WHERE user_id = $1 AND request_id = $2", [userId, input.requestId]);
        const replay = previousResult(previous.rows[0], input);
        if (replay) return replay;
        checkVersion(current.version, input.expectedVersion);
        const version = Number(current.version) + 1;
        const snapshot = serializeWorkspace(transform(parseWorkspace(current.state, current.version)), version);
        await client.query("UPDATE ghost_workspaces SET version = $1, state = $2::jsonb WHERE user_id = $3", [version, snapshot, userId]);
        await client.query("INSERT INTO ghost_commands (user_id, request_id, type, payload_hash, version, snapshot, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)", [userId, input.requestId, input.type, input.payloadHash, version, snapshot, new Date(this.now()).toISOString()]);
        return parseWorkspace(snapshot, version);
      });
    } catch (error) {
      throw publicFailure(error);
    }
  }

  async listCommands(userId, options) {
    await this.initialize();
    const { afterVersion, limit } = listOptions(options);
    const { rows } = await this.pool.query("SELECT request_id, type, version, snapshot, created_at FROM ghost_commands WHERE user_id = $1 AND version > $2 ORDER BY version LIMIT $3", [userId, afterVersion, limit]);
    return rows.map(commandRecord);
  }

  async close() {
    this.closed = true;
    this.initialized = false;
    await this.pool?.end();
  }
}

/** Serverless storage must be configured rather than silently losing data. */
export class UnavailableStore {
  kind = "unconfigured";
  persistent = false;

  async initialize() {
    throw new StoreError(503, "DATABASE_NOT_CONFIGURED", "Configure DATABASE_URL ou POSTGRES_URL com um banco PostgreSQL persistente para esta implantação.");
  }

  ready() { return false; }
  async createUser() { return this.initialize(); }
  async findUserByEmail() { return this.initialize(); }
  async findUserById() { return this.initialize(); }
  async createSession() { return this.initialize(); }
  async getSession() { return this.initialize(); }
  async deleteSession() { return this.initialize(); }
  async readWorkspace() { return this.initialize(); }
  async command() { return this.initialize(); }
  async listCommands() { return this.initialize(); }
  async close() {}
}

export async function openStore(env = process.env) {
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const store = connectionString
    ? new PostgresStore(connectionString, { env })
    : env.VERCEL
      ? new UnavailableStore()
      : new SQLiteStore(env.SQLITE_PATH || env.GHOST_DATABASE_PATH || "/workspace/ghost-data/the-ghost.sqlite");
  await store.initialize();
  return store;
}
