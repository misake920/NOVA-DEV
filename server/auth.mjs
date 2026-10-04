import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { openStore } from './store.mjs';
import { createOwnerAccess } from './owner-access.mjs';
import { initialWorkspace, applyCommand, applyOverdue, overdueEvents, DomainError, authValidation } from './workspace.mjs';

const scrypt = promisify(scryptCallback);
const COOKIE = 'ghost_session';
const DAY = 86_400_000;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const sessionUser = (user, workspace) => ({ id: user.id, name: workspace?.profile.name || user.name, email: user.email });
const passwordError = () => new DomainError(401, 'INVALID_CREDENTIALS', 'Email ou senha inválidos.');

function password(raw, registering = false) {
  if (typeof raw !== 'string' || raw.length > 128 || raw.length < (registering ? 10 : 1)) {
    throw new DomainError(400, 'INVALID_PASSWORD', 'A senha precisa ter entre 10 e 128 caracteres.');
  }
  return raw;
}
async function passwordHash(raw) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(raw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}
async function passwordMatches(raw, encoded) {
  const [algorithm, salt, stored] = (encoded || '').split(':');
  const fallback = '0'.repeat(128);
  const candidate = await scrypt(raw, algorithm === 'scrypt' ? salt : 'ghost-invalid-user', 64, { N: 16384, r: 8, p: 1 });
  const wanted = Buffer.from(algorithm === 'scrypt' && /^[a-f0-9]{128}$/.test(stored || '') ? stored : fallback, 'hex');
  return timingSafeEqual(Buffer.from(candidate), wanted) && algorithm === 'scrypt';
}
function cookieValue(req) {
  const raw = (req.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!raw) return '';
  const token = raw.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}

export function createWorkspaceApi({ env = process.env, store: injectedStore } = {}) {
  const router = express.Router();
  const ownerMode = (env.GHOST_ACCESS_MODE || (env.NODE_ENV === 'test' ? 'accounts' : 'owner')) === 'owner';
  const checkOwnerAccess = createOwnerAccess({ env });
  const ownerId = env.GHOST_OWNER_USER_ID || 'ghost-personal-owner';
  let storePromise;
  async function getStore() {
    if (!storePromise) storePromise = Promise.resolve(injectedStore || openStore(env)).then(async (store) => { await store.initialize(); return store; }).catch((error) => { storePromise = undefined; throw error; });
    return storePromise;
  }
  const cookieSettings = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' || Boolean(env.VERCEL), path: '/', maxAge: 30 * DAY };
  async function getIdentity(req) {
    const store = await getStore();
    if (ownerMode) {
      await checkOwnerAccess(req);
      let user = await store.findUserById(ownerId);
      if (!user) {
        const identity = { id: ownerId, name: env.GHOST_OWNER_NAME || 'Você', email: '', passwordHash: '' };
        try { await store.createUser({ ...identity, workspace: initialWorkspace(identity) }); }
        catch (error) { if (error.code !== 'EMAIL_EXISTS') throw error; }
        user = await store.findUserById(ownerId);
        if (!user) throw new DomainError(503, 'OWNER_UNAVAILABLE', 'Não foi possível abrir seu espaço pessoal.');
      }
      return { store, user };
    }
    const token = cookieValue(req);
    if (!token) return { store, user: null };
    const session = await store.getSession(hashToken(token));
    return { store, user: session?.user || null };
  }
  async function required(req, _res, next) {
    try {
      const identity = await getIdentity(req);
      if (!identity.user) throw new DomainError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
      req.ghostUser = identity.user; req.ghostStore = identity.store;
      next();
    } catch (error) { next(error); }
  }
  function protectProvider(req, res, next) {
    if (env.NODE_ENV === 'test') return next();
    return required(req, res, next);
  }
  const authWindows = new Map();
  function authLimit(req, res, next) {
    const now = Date.now();
    for (const [key, entry] of authWindows) if (entry.until <= now) authWindows.delete(key);
    const key = req.ip;
    const entry = authWindows.get(key) || { count: 0, until: now + 60_000 };
    entry.count += 1; authWindows.set(key, entry);
    if (entry.count > 12) { res.set('Retry-After', '60'); return next(new DomainError(429, 'AUTH_RATE_LIMITED', 'Muitas tentativas. Aguarde um minuto.')); }
    next();
  }
  async function startSession(req, res, store, user, workspace) {
    const prior = cookieValue(req);
    if (prior) await store.deleteSession(hashToken(prior));
    const token = randomBytes(32).toString('hex');
    await store.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
    res.cookie(COOKIE, token, cookieSettings);
    return sessionUser(user, workspace);
  }

  router.get('/session', async (req, res, next) => {
    try {
      const { store, user } = await getIdentity(req);
      const workspace = user ? await store.readWorkspace(user.id) : null;
      res.json({ user: user ? sessionUser(user, workspace) : null, databaseReady: true, ...(ownerMode ? { accessMode: 'owner' } : {}) });
    } catch (error) {
      if (error?.status === 503) return res.status(503).json({ user: null, databaseReady: false, accessMode: ownerMode ? 'owner' : 'accounts', error: { code: error.code || 'DATABASE_UNAVAILABLE', message: error.message } });
      next(error);
    }
  });
  router.use('/auth', (req, _res, next) => ownerMode ? next(new DomainError(404, 'AUTH_DISABLED', 'O acesso pessoal não usa cadastro nem senha.')) : next());
  router.post('/auth/register', authLimit, async (req, res, next) => {
    try {
      const input = authValidation.object(req.body);
      const name = authValidation.text(input.name, 'nome', { required: true, max: 160 });
      const email = authValidation.email(input.email, true);
      const secret = password(input.password, true);
      const store = await getStore();
      if (await store.findUserByEmail(email)) throw new DomainError(409, 'EMAIL_EXISTS', 'Este email já possui uma conta.');
      const user = { id: randomBytes(16).toString('hex'), name, email, passwordHash: await passwordHash(secret) };
      const workspace = initialWorkspace(user);
      await store.createUser({ ...user, workspace });
      res.status(201).json({ user: await startSession(req, res, store, user, workspace) });
    } catch (error) { next(error); }
  });
  router.post('/auth/login', authLimit, async (req, res, next) => {
    try {
      const input = authValidation.object(req.body);
      const email = authValidation.email(input.email, true);
      const secret = password(input.password);
      const store = await getStore();
      const user = await store.findUserByEmail(email);
      const matches = await passwordMatches(secret, user?.passwordHash);
      if (!user || !matches) throw passwordError();
      const workspace = await store.readWorkspace(user.id);
      res.json({ user: await startSession(req, res, store, user, workspace) });
    } catch (error) { next(error); }
  });
  router.post('/auth/logout', async (req, res, next) => {
    try {
      const token = cookieValue(req);
      if (token) await (await getStore()).deleteSession(hashToken(token));
      res.clearCookie(COOKIE, { ...cookieSettings, maxAge: undefined });
      res.json({ user: null });
    } catch (error) { next(error); }
  });
  router.get('/workspace', required, async (req, res, next) => {
    try {
      let workspace = await req.ghostStore.readWorkspace(req.ghostUser.id);
      if (!workspace) throw new DomainError(404, 'NOT_FOUND', 'A conta não possui um espaço de trabalho.');
      const events = overdueEvents(workspace);
      if (events.length) {
        const requestId = `overdue-${createHash('sha256').update(events.map((item) => item.id).sort().join(',')).digest('hex')}`;
        try {
          workspace = await req.ghostStore.command(req.ghostUser.id, { requestId, expectedVersion: workspace.version, type: 'system.overdue', payloadHash: requestId }, (current) => applyOverdue(current, events));
        } catch (error) {
          if (error.code !== 'VERSION_CONFLICT') throw error;
          workspace = await req.ghostStore.readWorkspace(req.ghostUser.id);
        }
      }
      res.json(workspace);
    } catch (error) { next(error); }
  });
  router.post('/command', required, async (req, res, next) => {
    try {
      const input = authValidation.object(req.body);
      const type = authValidation.text(input.type, 'operação', { required: true, max: 100 });
      const requestId = authValidation.id(input.requestId, true);
      const payload = authValidation.object(input.payload ?? {});
      const expectedVersion = input.expectedVersion;
      if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)) throw new DomainError(400, 'INVALID_INPUT', 'A versão informada é inválida.');
      const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const workspace = await req.ghostStore.command(req.ghostUser.id, { requestId, expectedVersion, type, payloadHash }, (current) => applyCommand(current, type, payload));
      res.json(workspace);
    } catch (error) { next(error); }
  });

  return { router, required, protectProvider, getStore };
}
