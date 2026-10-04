import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";
import { MemoryStore, openStore } from "../server/store.mjs";

const password = "Valid-password-2026!";
const date = "2026-10-04";
const offer = {
  service: "Criação de websites",
  benefit: "Facilitar pedidos de orçamento",
  audience: "Oficinas locais",
  proof: "",
  goal: "Uma conversa de 15 minutos",
};

async function fixture(t, options = {}) {
  const store = options.store ?? new MemoryStore();
  await store.initialize();
  const app = createApp({
    fetchImpl: async () => {
      throw new Error("No external provider calls are allowed in workspace tests");
    },
    ...options,
    env: { NODE_ENV: "test", ...options.env },
    store,
  });
  const instance = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    await new Promise((resolve) => {
      instance.close(resolve);
      instance.closeAllConnections();
    });
    await store.close();
  }
  t.after(stop);
  const base = `http://127.0.0.1:${instance.address().port}`;
  function client(initialCookie = "") {
    let cookie = initialCookie;
    return {
      get cookie() {
        return cookie;
      },
      async request(path, body, options = {}) {
        const headers = { ...(cookie ? { Cookie: cookie } : {}), ...options.headers };
        const response = await fetch(`${base}${path}`, {
          ...options,
          ...(body === undefined
            ? {}
            : { method: "POST", body: JSON.stringify(body) }),
          headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
        return { status: response.status, headers: response.headers, body: await response.json() };
      },
    };
  }
  return { store, client, stop };
}

async function register(client, suffix = randomUUID()) {
  const email = `prospector-${suffix}@example.com`;
  const response = await client.request("/api/auth/register", { name: "Prospector", email, password });
  assert.ok([200, 201].includes(response.status), JSON.stringify(response.body));
  assert.equal(response.body.user.email, email);
  return { ...response.body.user, password };
}

async function workspace(client) {
  const response = await client.request("/api/workspace");
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function command(client, type, payload, extra = {}) {
  return client.request("/api/command", { type, payload, requestId: randomUUID(), ...extra });
}

async function save(client, type, payload, extra = {}) {
  const response = await command(client, type, payload, extra);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

function customer(overrides = {}) {
  return {
    id: "", name: "Oficina Centro", email: "owner@example.com", phone: "+5511999990000",
    country: "BR", language: "pt-BR", category: "Oficina", website: "https://example.com/",
    websiteStatus: "informed", verificationNote: "", verifiedAt: "", notes: "Indicação autorizada", tags: ["indicação"],
    ...overrides,
  };
}

function sale(customerId, overrides = {}) {
  return {
    id: "", customerId, opportunityId: "", service: "Website", date,
    grossMinor: 10000, discountMinor: 1000, amountMinor: 9000, currency: "BRL", method: "pix", note: "",
    installments: [{ amountMinor: 9000, dueDate: "2099-12-31" }], status: "active", ...overrides,
  };
}

function opportunity(customerId, stageId, overrides = {}) {
  return {
    id: "", customerId, title: "Website Oficina", service: "Website", amountMinor: 9000, currency: "BRL",
    stageId, owner: "Prospector", nextAction: "Ligar", nextActionDate: "", lostReason: "", ...overrides,
  };
}

function rejected(response) {
  assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response.body));
  assert.equal(typeof response.body.error.code, "string");
}

test("sessions use private cookies, scrypt hashes and server-side logout revocation", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  assert.deepEqual((await actor.request("/api/session")).body, { user: null, databaseReady: true });
  assert.equal((await actor.request("/api/workspace")).status, 401);
  const identity = await register(actor);
  const persisted = await server.store.findUserByEmail(identity.email);
  assert.notEqual(persisted.passwordHash, password);
  assert.match(persisted.passwordHash, /scrypt/i);
  assert.doesNotMatch(JSON.stringify((await actor.request("/api/session")).body), /password|scrypt/i);
  const login = await actor.request("/api/auth/login", { email: identity.email, password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=(Lax|Strict)/i);
  const stolenSession = server.client(actor.cookie);
  assert.equal((await actor.request("/api/auth/logout", {})).status, 200);
  assert.equal((await stolenSession.request("/api/workspace")).status, 401);
  assert.equal((await actor.request("/api/session")).body.user, null);
  const badLogin = await actor.request("/api/auth/login", { email: identity.email, password: "Wrong-password" });
  assert.equal(badLogin.status, 401);
  assert.doesNotMatch(JSON.stringify(badLogin.body), /scrypt|Valid-password/);
});

test("new accounts start empty and another account cannot reference, update or delete their records", async (t) => {
  const server = await fixture(t);
  const first = server.client();
  const second = server.client();
  await register(first);
  await register(second);
  const created = await save(first, "customer.save", customer());
  const company = created.customers[0];
  const secondState = await workspace(second);
  for (const key of ["customers", "opportunities", "sales", "receipts", "refunds", "expenses", "tasks", "proposals", "approaches"])
    assert.deepEqual(secondState[key], [], key);
  rejected(await command(second, "customer.save", { ...company, name: "Stolen update" }));
  rejected(await command(second, "customer.delete", { id: company.id }));
  rejected(await command(second, "opportunity.save", opportunity(company.id, secondState.stages.find((item) => item.kind === "open").id)));
  rejected(await command(second, "sale.save", sale(company.id)));
  assert.equal((await workspace(first)).customers[0].name, company.name);
  assert.equal((await workspace(second)).customers.length, 0);
});

test("command retries are idempotent and stale writes cannot overwrite a newer workspace", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  const initial = await workspace(actor);
  const requestId = randomUUID();
  const company = customer();
  const first = await save(actor, "customer.save", company, { requestId, expectedVersion: initial.version });
  const retry = await save(actor, "customer.save", company, { requestId, expectedVersion: initial.version });
  assert.deepEqual(retry, first);
  assert.equal(first.version, initial.version + 1);
  assert.equal(first.activities.length, initial.activities.length + 1);
  const stale = await command(actor, "customer.save", { ...company, id: first.customers[0].id, name: "Outdated edit" }, { expectedVersion: initial.version });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "VERSION_CONFLICT");
  const invalidRetry = await command(actor, "customer.delete", { id: first.customers[0].id }, { requestId });
  assert.equal(invalidRetry.status, 409);
  const changedPayloadRetry = await command(actor, "customer.save", { ...company, name: "Different payload" }, { requestId });
  assert.equal(changedPayloadRetry.status, 409);
  const actual = await workspace(actor);
  assert.equal(actual.customers.length, 1);
  assert.equal(actual.customers[0].name, company.name);
  assert.equal(actual.version, first.version);
});

test("concurrent compare-and-swap writers produce one committed change", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  const initial = await workspace(actor);
  const results = await Promise.all([
    command(actor, "customer.save", customer({ name: "Primeiro escritor" }), { expectedVersion: initial.version }),
    command(actor, "customer.save", customer({ name: "Segundo escritor" }), { expectedVersion: initial.version }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const actual = await workspace(actor);
  assert.equal(actual.version, initial.version + 1);
  assert.equal(actual.customers.length, 1);
  assert.equal(actual.activities.length, initial.activities.length + 1);
});

test("cross-site mutations and unsupported commands do not change account data", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  const initial = await workspace(actor);
  const response = await actor.request("/api/command", { type: "customer.save", payload: customer(), requestId: randomUUID() }, { headers: { Origin: "https://evil.example" } });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "ORIGIN_REJECTED");
  rejected(await command(actor, "database.drop", {}));
  assert.deepEqual(await workspace(actor), initial);
});

test("provider routes require a session outside the explicit legacy test mode", async (t) => {
  let calls = 0;
  const server = await fixture(t, {
    env: { NODE_ENV: "production", ALLOW_GOOGLE_PROSPECTING: "true", GOOGLE_PLACES_API_KEY: "test-private", AI_API_KEY: "test-private" },
    fetchImpl: async () => { calls += 1; throw new Error("Provider must not be called"); },
  });
  const actor = server.client();
  const search = await actor.request("/api/search", { country: "BR", city: "São Paulo", category: "Oficina" });
  assert.equal(search.status, 401);
  assert.equal((await actor.request("/api/places/ChIJ_test_place")).status, 401);
  const generated = await actor.request("/api/approach", { company: { id: "manual", name: "Oficina", category: "Oficina", address: "São Paulo", source: "manual", lat: 0, lng: 0 }, offer, channel: "email", tone: "direto", language: "pt-BR", format: "first" });
  assert.equal(generated.status, 401);
  assert.equal(calls, 0);
});

test("a serverless deployment without a persistent database reports unavailability honestly", async (t) => {
  const app = createApp({ env: { NODE_ENV: "test", VERCEL: "1" }, fetchImpl: async () => { throw new Error("Unexpected provider call"); } });
  const instance = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  t.after(() => new Promise((resolve) => { instance.close(resolve); instance.closeAllConnections(); }));
  const base = `http://127.0.0.1:${instance.address().port}`;
  const session = await fetch(`${base}/api/session`);
  const result = await session.json();
  assert.equal(result.databaseReady, false);
  assert.equal(result.user, null);
  const registerResponse = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Prospector", email: "vercel@example.com", password }) });
  assert.equal(registerResponse.status, 503);
  const failure = await registerResponse.json();
  assert.equal(typeof failure.error.code, "string");
});

test("SQLite preserves account data, hashed authentication and command receipts after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ghost-workspace-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { NODE_ENV: "test", SQLITE_PATH: join(directory, "workspace.sqlite") };
  const firstStore = await openStore(env);
  const first = await fixture(t, { store: firstStore, env });
  const actor = first.client();
  const identity = await register(actor);
  const requestId = randomUUID();
  const company = customer();
  const saved = await save(actor, "customer.save", company, { requestId });
  await first.stop();
  const secondStore = await openStore(env);
  const second = await fixture(t, { store: secondStore, env });
  const returning = second.client();
  assert.equal((await returning.request("/api/auth/login", { email: identity.email, password })).status, 200);
  assert.deepEqual(await workspace(returning), saved);
  assert.deepEqual(await save(returning, "customer.save", company, { requestId }), saved);
  assert.notEqual((await secondStore.findUserByEmail(identity.email)).passwordHash, password);
  rejected(await command(returning, "sale.save", sale(saved.customers[0].id, { discountMinor: 10001 })));
  assert.equal((await secondStore.listCommands(identity.id)).length, 1);
  assert.deepEqual(await workspace(returning), saved);
  await second.stop();
});

test("registration rejects duplicate identities and unsafe credentials without exposing hashes", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  const identity = await register(actor);
  const other = server.client();
  for (const invalid of [
    { name: "", email: "new@example.com", password },
    { name: "Prospector", email: "invalid-email", password },
    { name: "Prospector", email: "new@example.com", password: "123" },
  ]) {
    rejected(await other.request("/api/auth/register", invalid));
  }
  const duplicate = await other.request("/api/auth/register", { name: "Other", email: identity.email.toUpperCase(), password });
  assert.equal(duplicate.status, 409);
  assert.doesNotMatch(JSON.stringify(duplicate.body), /scrypt|Valid-password/);
  assert.equal((await other.request("/api/session")).body.user, null);
});

test("workspace CRUD persists editable entities and leaves an audit trail when records are deleted", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  const identity = await register(actor);
  let state = await save(actor, "customer.save", customer());
  const company = state.customers[0];
  const openStage = state.stages.find((item) => item.kind === "open");
  const cases = [
    { type: "stage", collection: "stages", field: "name", value: { name: "Aguardando análise", kind: "open", order: 15 } },
    { type: "opportunity", collection: "opportunities", field: "title", value: opportunity(company.id, openStage.id) },
    { type: "expense", collection: "expenses", field: "title", value: { title: "Hospedagem", amountMinor: 1990, currency: "BRL", date, category: "Infraestrutura", note: "", paid: false } },
    { type: "task", collection: "tasks", field: "title", value: { title: "Ligar para oficina", dueDate: "2099-12-31", customerId: company.id, opportunityId: "", done: false, owner: "Prospector", note: "" } },
    { type: "goal", collection: "goals", field: "name", value: { name: "Vendas do mês", kind: "sales", target: 100000, currency: "BRL", startDate: "2026-10-01", endDate: "2026-10-31" } },
    { type: "proposal", collection: "proposals", field: "title", value: { customerId: company.id, opportunityId: "", title: "Website", scope: "Três páginas", amountMinor: 9000, currency: "BRL", conditions: "Pagamento à vista", date, status: "draft" } },
    { type: "approach", collection: "approaches", field: "body", value: { customerId: company.id, language: "pt-BR", channel: "email", format: "first", subject: "Website", body: "Olá, podemos conversar?", date, status: "draft", nextStep: "" } },
    { type: "search", collection: "savedSearches", field: "name", value: { name: "Oficinas SP", country: "BR", city: "São Paulo", category: "Oficina", keyword: "" } },
    { type: "objection", collection: "objections", field: "title", value: { title: "Já tenho site", body: "Podemos entender a necessidade atual?", language: "pt-BR", service: "Website" } },
  ];
  for (const entry of cases) {
    const beforeIds = new Set(state[entry.collection].map((item) => item.id));
    state = await save(actor, `${entry.type}.save`, entry.value);
    const created = state[entry.collection].find((item) => !beforeIds.has(item.id));
    assert.ok(created?.id, entry.type);
    const updatedValue = `Atualizado: ${created[entry.field]}`;
    state = await save(actor, `${entry.type}.save`, { ...created, [entry.field]: updatedValue });
    assert.equal(state[entry.collection].find((item) => item.id === created.id)[entry.field], updatedValue);
    const beforeDeleteActivities = state.activities.length;
    state = await save(actor, `${entry.type}.delete`, { id: created.id });
    assert.equal(state[entry.collection].some((item) => item.id === created.id), false, entry.type);
    assert.equal(state.activities.length, beforeDeleteActivities + 1);
    assert.ok(state.activities.some((item) => item.entityId === created.id), entry.type);
  }
  state = await save(actor, "customer.save", { ...company, name: "Oficina Atualizada" });
  assert.equal(state.customers[0].name, "Oficina Atualizada");
  state = await save(actor, "profile.save", { ...state.profile, name: "Novo nome", timezone: "Europe/Amsterdam", currency: "EUR", offer });
  assert.equal(state.profile.name, "Novo nome");
  assert.equal(state.profile.email, identity.email);
  assert.equal(state.profile.timezone, "Europe/Amsterdam");
  const attemptedIdentityChange = await command(actor, "profile.save", { ...state.profile, email: "forged@example.com" });
  if (attemptedIdentityChange.status === 200) assert.equal(attemptedIdentityChange.body.profile.email, identity.email);
  else rejected(attemptedIdentityChange);
  state = await save(actor, "notification.read", { id: state.notifications.find((item) => !item.read).id });
  assert.ok(state.notifications.some((item) => item.read));
  state = await save(actor, "notification.readAll", {});
  assert.ok(state.notifications.every((item) => item.read));
  const auditCount = state.activities.length;
  state = await save(actor, "customer.delete", { id: company.id });
  assert.equal(state.customers.length, 0);
  assert.equal(state.activities.length, auditCount + 1);
  assert.ok(state.activities.some((item) => item.entityId === company.id));
  assert.deepEqual(await workspace(actor), state);
});

test("stages preserve referenced opportunities and moving to won never fabricates or duplicates money", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await save(actor, "customer.save", customer());
  const company = state.customers[0];
  state = await save(actor, "stage.save", { name: "Contato por telefone", kind: "open", order: 20 });
  const stage = state.stages.find((item) => item.name === "Contato por telefone");
  state = await save(actor, "opportunity.save", opportunity(company.id, stage.id));
  const deal = state.opportunities[0];
  rejected(await command(actor, "stage.delete", { id: stage.id }));
  const fallbackStage = state.stages.find((item) => item.kind === "open" && item.id !== stage.id);
  state = await save(actor, "stage.delete", { id: stage.id, targetStageId: fallbackStage.id });
  assert.equal(state.opportunities[0].stageId, fallbackStage.id);
  const won = state.stages.find((item) => item.kind === "won");
  state = await save(actor, "opportunity.move", { id: deal.id, stageId: won.id });
  assert.equal(state.opportunities[0].stageId, won.id);
  assert.deepEqual(state.sales, []);
  state = await save(actor, "sale.save", sale(company.id, { opportunityId: deal.id }));
  assert.equal(state.sales.length, 1);
  state = await save(actor, "opportunity.move", { id: deal.id, stageId: won.id });
  assert.equal(state.sales.length, 1);
  rejected(await command(actor, "sale.save", sale(company.id, { opportunityId: deal.id })));
  assert.equal((await workspace(actor)).sales.length, 1);
  if (state.stages.filter((item) => item.kind === "won").length === 1) rejected(await command(actor, "stage.delete", { id: won.id }));
});

test("financial records enforce integer money, real discount totals and installment reconciliation", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await save(actor, "customer.save", customer());
  const company = state.customers[0];
  for (const input of [
    sale(company.id, { discountMinor: 10001 }),
    sale(company.id, { grossMinor: -1 }),
    sale(company.id, { grossMinor: 10000.5 }),
    sale(company.id, { grossMinor: 1_000_000_000_001 }),
    sale(company.id, { installments: [{ amountMinor: 8999, dueDate: date }] }),
    sale(company.id, { installments: Array.from({ length: 25 }, () => ({ amountMinor: 360, dueDate: date })) }),
  ]) rejected(await command(actor, "sale.save", input));
  assert.equal((await workspace(actor)).sales.length, 0);
  state = await save(actor, "sale.save", sale(company.id, {
    installments: [{ amountMinor: 4000, dueDate: "2099-12-30" }, { amountMinor: 5000, dueDate: "2099-12-31" }],
  }));
  const transaction = state.sales[0];
  assert.equal(transaction.amountMinor, transaction.grossMinor - transaction.discountMinor);
  assert.equal(transaction.installments.reduce((sum, item) => sum + item.amountMinor, 0), transaction.amountMinor);
  assert.equal(state.receipts.length, 0);
  assert.equal(transaction.currency, "BRL");
  state = await save(actor, "sale.save", { ...transaction, note: "Contrato revisado" });
  assert.equal(state.sales[0].note, "Contrato revisado");
  rejected(await command(actor, "receipt.save", { saleId: transaction.id, amountMinor: 4001, date, method: "pix", installmentId: transaction.installments[0].id, note: "Excede só a parcela" }));
  assert.equal((await workspace(actor)).receipts.length, 0);
  rejected(await command(actor, "expense.save", { title: "Valor inválido", amountMinor: 0.1, currency: "USD", date, category: "Serviço", note: "", paid: false }));
});

test("receipts are append-only, cannot overpay and refunds cannot exceed their receipt", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await save(actor, "customer.save", customer());
  state = await save(actor, "sale.save", sale(state.customers[0].id));
  const transaction = state.sales[0];
  const payment = { saleId: transaction.id, amountMinor: 3000, date, method: "pix", installmentId: transaction.installments[0].id, note: "Primeira parcela" };
  const requestId = randomUUID();
  state = await save(actor, "receipt.save", payment, { requestId });
  const received = state.receipts[0];
  assert.equal(received.amountMinor, 3000);
  assert.deepEqual(await save(actor, "receipt.save", payment, { requestId }), state);
  rejected(await command(actor, "receipt.save", { ...received, amountMinor: 2000 }));
  rejected(await command(actor, "receipt.save", { ...payment, amountMinor: 6001 }));
  rejected(await command(actor, "sale.save", { ...transaction, grossMinor: 11000, amountMinor: 10000, installments: [{ ...transaction.installments[0], amountMinor: 10000 }] }));
  state = await save(actor, "receipt.refund", { id: received.id, amountMinor: 1000, date, note: "Estorno parcial" });
  assert.equal(state.refunds.length, 1);
  assert.equal(state.refunds[0].receiptId, received.id);
  assert.equal(state.refunds[0].amountMinor, 1000);
  rejected(await command(actor, "receipt.refund", { id: received.id, amountMinor: 2001, date, note: "Excede o saldo" }));
  state = await save(actor, "receipt.refund", { id: received.id, amountMinor: 2000, date, note: "Restante" });
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].amountMinor, 3000);
  assert.equal(state.refunds.reduce((sum, item) => sum + item.amountMinor, 0), 3000);
  rejected(await command(actor, "receipt.refund", { id: received.id, amountMinor: 1, date, note: "Estorno repetido" }));
  assert.deepEqual(await workspace(actor), state);
});

test("a sale date cannot move beyond an existing receipt date", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await save(actor, "customer.save", customer());
  state = await save(actor, "sale.save", sale(state.customers[0].id));
  const transaction = state.sales[0];
  state = await save(actor, "receipt.save", { saleId: transaction.id, amountMinor: 3000, date, method: "pix", installmentId: "", note: "" });
  const edit = await command(actor, "sale.save", { ...transaction, date: "2099-01-01" });
  assert.equal(edit.status, 409);
  assert.equal(edit.body.error.code, "FINANCIAL_RECORD_LOCKED");
  assert.deepEqual(await workspace(actor), state);
});

test("cancelling a sale retains receipts and audit while blocking new collection", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await save(actor, "customer.save", customer());
  const company = state.customers[0];
  state = await save(actor, "sale.save", sale(company.id));
  const transaction = state.sales[0];
  state = await save(actor, "receipt.save", { saleId: transaction.id, amountMinor: 3000, date, method: "pix", installmentId: "", note: "" });
  const received = state.receipts[0];
  state = await save(actor, "sale.cancel", { id: transaction.id });
  assert.equal(state.sales[0].status, "cancelled");
  assert.deepEqual(state.receipts, [received]);
  rejected(await command(actor, "receipt.save", { saleId: transaction.id, amountMinor: 1000, date, method: "pix", installmentId: "", note: "" }));
  rejected(await command(actor, "sale.delete", { id: transaction.id }));
  rejected(await command(actor, "customer.delete", { id: company.id }));
  rejected(await command(actor, "sale.cancel", { id: transaction.id }));
  state = await save(actor, "receipt.refund", { id: received.id, amountMinor: 3000, date, note: "Devolução após cancelamento" });
  assert.equal(state.refunds[0].amountMinor, 3000);
  assert.equal(state.sales[0].status, "cancelled");
  assert.equal(state.receipts[0].amountMinor, 3000);
  assert.ok(state.activities.some((item) => item.type === "sale.cancel" && item.entityId === transaction.id));
  assert.deepEqual(await workspace(actor), state);
});

function localDate(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-");
}

test("overdue task notifications use the profile timezone and remain deduplicated across reads", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  let state = await workspace(actor);
  const timezone = "Pacific/Kiritimati";
  state = await save(actor, "profile.save", { ...state.profile, timezone });
  const today = localDate(timezone);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);
  state = await save(actor, "task.save", { title: "Ainda dentro do prazo local", dueDate: today, customerId: "", opportunityId: "", done: false, owner: "", note: "" });
  const todayTask = state.tasks[0];
  state = await save(actor, "task.save", { title: "Venceu ontem", dueDate: yesterdayDate, customerId: "", opportunityId: "", done: false, owner: "", note: "" });
  const pastTask = state.tasks.find((item) => item.id !== todayTask.id);
  const existingNotifications = new Set(state.notifications.map((item) => item.id));
  state = await workspace(actor);
  const added = state.notifications.filter((item) => !existingNotifications.has(item.id));
  assert.equal(added.filter((item) => item.entityId === todayTask.id).length, 0);
  assert.equal(added.filter((item) => item.entityId === pastTask.id).length, 1);
  const persistedCount = state.notifications.length;
  const secondRead = await workspace(actor);
  assert.equal(secondRead.notifications.length, persistedCount);
  assert.deepEqual(secondRead.notifications, state.notifications);
});

test("paying a later installment does not hide an earlier overdue installment", async (t) => {
  const server = await fixture(t);
  const actor = server.client();
  await register(actor);
  const today = localDate("America/Sao_Paulo");
  const yesterday = new Date(`${today}T12:00:00Z`);
  const tomorrow = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const pastDue = yesterday.toISOString().slice(0, 10);
  const futureDue = tomorrow.toISOString().slice(0, 10);
  let state = await save(actor, "customer.save", customer());
  state = await save(actor, "sale.save", sale(state.customers[0].id, {
    date: pastDue, grossMinor: 10000, discountMinor: 0, amountMinor: 10000,
    installments: [{ amountMinor: 5000, dueDate: pastDue }, { amountMinor: 5000, dueDate: futureDue }],
  }));
  const transaction = state.sales[0];
  state = await save(actor, "receipt.save", {
    saleId: transaction.id, amountMinor: 5000, date: today, method: "pix",
    installmentId: transaction.installments[1].id, note: "Pagamento da segunda parcela",
  });
  assert.equal(state.receipts[0].installmentId, transaction.installments[1].id);
  state = await workspace(actor);
  const overdue = state.notifications.filter((item) => item.type === "overdue" && item.entityId === transaction.id);
  assert.equal(overdue.length, 1);
  assert.ok(overdue[0].body.includes(pastDue));
  assert.equal(overdue[0].body.includes(futureDue), false);
  assert.deepEqual((await workspace(actor)).notifications, state.notifications);
});
