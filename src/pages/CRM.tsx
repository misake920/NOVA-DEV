import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowUpRight,
  FileText,
  CalendarDays,
  Check,
  X,
  GripVertical,
  Layers3,
  AlertCircle,
  Phone,
  Mail,
  Globe2,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { useWorkspace } from "../lib/WorkspaceContext";
import type {
  Customer,
  Currency,
  Opportunity,
  Proposal,
  Stage,
  Task,
  Workspace,
} from "../lib/workspace";
import {
  displayDate,
  localDate,
  money,
  netReceived,
  parseMoney,
  pending,
} from "../lib/workspace";
import type { CountryCode, Language } from "../types";
import {
  EmptyState,
  Field,
  Modal,
  Money,
  PageHeading,
  Panel,
  useToast,
} from "../components/ui";
import "./crm.css";

const countries: { code: CountryCode; label: string; language: Language }[] = [
  { code: "BR", label: "Brasil", language: "pt-BR" },
  { code: "ES", label: "Espanha", language: "es-ES" },
  { code: "IT", label: "Itália", language: "it-IT" },
  { code: "US", label: "Estados Unidos", language: "en-US" },
  { code: "NL", label: "Holanda", language: "nl-NL" },
];
const languages: { value: Language; label: string }[] = [
  { value: "pt-BR", label: "Português brasileiro" },
  { value: "es-ES", label: "Espanhol" },
  { value: "it-IT", label: "Italiano" },
  { value: "en-US", label: "Inglês" },
  { value: "nl-NL", label: "Neerlandês" },
];
const siteLabels: Record<Customer["websiteStatus"], string> = {
  unknown: "Situação não verificada",
  informed: "Site informado",
  not_informed: "Site não informado na fonte",
  verified_absent: "Ausência verificada por mim",
};
const proposalLabels: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
};
type Command = (type: string, payload: unknown) => Promise<unknown>;
const minorInput = (amount: number) =>
  (amount / 100).toFixed(2).replace(".", ",");
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
const customerName = (state: Workspace, id: string) =>
  state.customers.find((customer) => customer.id === id)?.name ||
  "Sem cliente vinculado";
const searchable = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
const duplicatePairs = (customers: Customer[]) =>
  customers.flatMap((customer, index) =>
    customers
      .slice(index + 1)
      .filter(
        (other) =>
          searchable(customer.name.trim()) === searchable(other.name.trim()) ||
          (!!customer.email &&
            customer.email.trim().toLowerCase() ===
              other.email.trim().toLowerCase()) ||
          (!!customer.phone.replace(/\D/g, "") &&
            customer.phone.replace(/\D/g, "") ===
              other.phone.replace(/\D/g, "")),
      )
      .map((other) => [customer, other] as const),
  );

function CurrencyField({
  value,
  onChange,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
}) {
  return (
    <Field label="Moeda">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Currency)}
      >
        <option value="BRL">BRL · Real</option>
        <option value="EUR">EUR · Euro</option>
        <option value="USD">USD · Dólar</option>
      </select>
    </Field>
  );
}

function FormActions({
  busy,
  onClose,
  label = "Salvar",
}: {
  busy: boolean;
  onClose: () => void;
  label?: string;
}) {
  return (
    <div className="form-actions">
      <button
        className="button button-secondary"
        type="button"
        onClick={onClose}
        disabled={busy}
      >
        Cancelar
      </button>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Salvando…" : label}
      </button>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="error-message" role="alert">
      <AlertCircle size={16} />
      {error}
    </p>
  ) : null;
}

function ConfirmDelete({
  title,
  children,
  onClose,
  onDelete,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onDelete();
      onClose();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="crm-delete-message">{children}</div>
      <ErrorMessage error={error} />
      <div className="form-actions">
        <button
          className="button button-secondary"
          onClick={onClose}
          disabled={busy}
        >
          Manter registro
        </button>
        <button
          className="button button-primary"
          onClick={() => void remove()}
          disabled={busy}
        >
          {busy ? "Excluindo…" : "Confirmar exclusão"}
        </button>
      </div>
    </Modal>
  );
}

function CustomerEditor({
  customer,
  command,
  onClose,
  timezone,
}: {
  customer?: Customer;
  command: Command;
  onClose: () => void;
  timezone: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    country: customer?.country || ("BR" as CountryCode),
    language: customer?.language || ("pt-BR" as Language),
    category: customer?.category || "",
    website: customer?.website || "",
    websiteStatus:
      customer?.websiteStatus || ("unknown" as Customer["websiteStatus"]),
    verificationNote: customer?.verificationNote || "",
    verifiedAt: customer?.verifiedAt || "",
    notes: customer?.notes || "",
    tags: customer?.tags.join(", ") || "",
  });
  const [confirmed, setConfirmed] = useState(
    customer?.websiteStatus === "verified_absent",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (
      form.websiteStatus === "verified_absent" &&
      (!confirmed || !form.verificationNote.trim() || !form.verifiedAt)
    ) {
      setError(
        "Confirme a verificação e informe como e quando verificou a ausência do site.",
      );
      return;
    }
    setBusy(true);
    try {
      await command("customer.save", {
        ...form,
        id: customer?.id,
        name: form.name.trim(),
        tags: [
          ...new Set(
            form.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ],
        verificationNote:
          form.websiteStatus === "verified_absent" ? form.verificationNote : "",
        verifiedAt:
          form.websiteStatus === "verified_absent" ? form.verifiedAt : "",
      });
      toast(customer ? "Cliente atualizado." : "Cliente cadastrado.");
      onClose();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={customer ? "Editar cliente" : "Cadastrar cliente"}
      onClose={onClose}
    >
      <form onSubmit={save} className="crm-form">
        <div className="form-grid">
          <Field label="Nome do cliente ou empresa">
            <input
              autoFocus
              required
              maxLength={160}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field label="Segmento">
            <input
              value={form.category}
              maxLength={120}
              onChange={(event) => update("category", event.target.value)}
            />
          </Field>
          <Field label="E-mail comercial">
            <input
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field label="Telefone comercial">
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </Field>
          <Field label="País">
            <select
              value={form.country}
              onChange={(event) => {
                const country = countries.find(
                  (item) => item.code === event.target.value,
                )!;
                setForm((previous) => ({
                  ...previous,
                  country: country.code,
                  language: country.language,
                }));
              }}
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Idioma de contato">
            <select
              value={form.language}
              onChange={(event) => update("language", event.target.value)}
            >
              {languages.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Site">
            <input
              type="url"
              value={form.website}
              placeholder="https://"
              onChange={(event) => update("website", event.target.value)}
            />
          </Field>
          <Field label="Situação do site">
            <select
              value={form.websiteStatus}
              onChange={(event) => {
                update("websiteStatus", event.target.value);
                setConfirmed(false);
                if (
                  event.target.value === "verified_absent" &&
                  !form.verifiedAt
                )
                  update("verifiedAt", localDate(timezone));
              }}
            >
              {Object.entries(siteLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {form.websiteStatus === "not_informed" && (
          <p className="crm-info">
            Um site não informado na fonte pode existir. Verifique antes de
            afirmar que o cliente não possui site.
          </p>
        )}
        {form.websiteStatus === "verified_absent" && (
          <div className="crm-verification">
            <Field label="Como você verificou a ausência do site?">
              <textarea
                required
                value={form.verificationNote}
                onChange={(event) =>
                  update("verificationNote", event.target.value)
                }
                rows={3}
                maxLength={1500}
              />
            </Field>
            <Field label="Data da verificação">
              <input
                type="date"
                required
                max={localDate(timezone)}
                value={form.verifiedAt.slice(0, 10)}
                onChange={(event) => update("verifiedAt", event.target.value)}
              />
            </Field>
            <label className="crm-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirmo que realizei essa verificação.
            </label>
          </div>
        )}
        <Field label="Etiquetas, separadas por vírgula">
          <input
            value={form.tags}
            maxLength={500}
            onChange={(event) => update("tags", event.target.value)}
          />
        </Field>
        <Field label="Notas do relacionamento">
          <textarea
            rows={4}
            value={form.notes}
            maxLength={10000}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>
        <ErrorMessage error={error} />
        <FormActions
          busy={busy}
          onClose={onClose}
          label={customer ? "Salvar cliente" : "Cadastrar cliente"}
        />
      </form>
    </Modal>
  );
}

function printProposal(
  proposal: Proposal,
  customer: Customer | undefined,
  name: string,
) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  const popup = window.open("", "_blank", "width=900,height=800");
  if (!popup)
    throw new Error(
      "Permita a abertura da janela para imprimir ou salvar o PDF.",
    );
  popup.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(proposal.title)}</title><style>body{font-family:Arial,sans-serif;color:#191919;max-width:760px;margin:48px auto;padding:24px;line-height:1.6}header{border-bottom:3px solid #e71934;padding-bottom:20px}h1{font-size:28px}h2{font-size:17px;margin-top:30px}.brand{font-weight:bold;letter-spacing:2px;color:#bb1026}p{white-space:pre-wrap}.amount{font-size:25px;font-weight:bold}footer{margin-top:45px;font-size:12px;color:#666}@media print{body{margin:0;max-width:none}}</style></head><body><header><div class="brand">THE GHOST &lt;/&gt;</div><h1>${escape(proposal.title)}</h1><div>Preparada por ${escape(name || "Usuário")}</div><div>Cliente: ${escape(customer?.name || "Sem cliente vinculado")}</div><div>Data: ${escape(displayDate(proposal.date))}</div></header><h2>Escopo</h2><p>${escape(proposal.scope)}</p><h2>Investimento</h2><div class="amount">${escape(money(proposal.amountMinor, proposal.currency))}</div><h2>Condições</h2><p>${escape(proposal.conditions || "Não informadas.")}</p><footer>Status registrado: ${escape(proposalLabels[proposal.status])}. Este documento apresenta a proposta cadastrada; não confirma pagamento.</footer></body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
}

function ProposalEditor({
  proposal,
  customerId = "",
  opportunityId = "",
  state,
  command,
  onClose,
}: {
  proposal?: Proposal;
  customerId?: string;
  opportunityId?: string;
  state: Workspace;
  command: Command;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: proposal?.title || "",
    customerId: proposal?.customerId || customerId,
    opportunityId: proposal?.opportunityId || opportunityId,
    scope: proposal?.scope || "",
    amount: proposal ? minorInput(proposal.amountMinor) : "",
    currency: proposal?.currency || state.profile.currency,
    conditions: proposal?.conditions || "",
    date: proposal?.date || localDate(state.profile.timezone),
    status: proposal?.status || ("draft" as Proposal["status"]),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { amount, ...data } = form;
      await command("proposal.save", {
        ...data,
        id: proposal?.id,
        amountMinor: parseMoney(amount),
      });
      toast("Proposta salva.");
      onClose();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={proposal ? "Editar proposta" : "Criar proposta"}
      onClose={onClose}
    >
      <form onSubmit={save} className="crm-form">
        <div className="form-grid">
          <Field label="Título da proposta">
            <input
              required
              autoFocus
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="Cliente">
            <select
              required
              value={form.customerId}
              onChange={(event) => {
                update("customerId", event.target.value);
                update("opportunityId", "");
              }}
            >
              <option value="">Selecionar cliente</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Oportunidade vinculada">
            <select
              value={form.opportunityId}
              onChange={(event) => update("opportunityId", event.target.value)}
            >
              <option value="">Sem vínculo</option>
              {state.opportunities
                .filter(
                  (opportunity) => opportunity.customerId === form.customerId,
                )
                .map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.title}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Valor negociado">
            <input
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => update("amount", event.target.value)}
            />
          </Field>
          <CurrencyField
            value={form.currency}
            onChange={(currency) => update("currency", currency)}
          />
          <Field label="Data">
            <input
              required
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </Field>
          <Field label="Status registrado">
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
            >
              {Object.entries(proposalLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Escopo da proposta">
          <textarea
            required
            rows={5}
            maxLength={12000}
            value={form.scope}
            onChange={(event) => update("scope", event.target.value)}
          />
        </Field>
        <Field label="Condições comerciais">
          <textarea
            rows={4}
            maxLength={5000}
            value={form.conditions}
            onChange={(event) => update("conditions", event.target.value)}
          />
        </Field>
        <p className="muted">
          O status é um registro manual. Salvar ou imprimir a proposta não a
          envia ao cliente.
        </p>
        <ErrorMessage error={error} />
        <FormActions busy={busy} onClose={onClose} label="Salvar proposta" />
      </form>
    </Modal>
  );
}

function TaskEditor({
  task,
  customerId = "",
  opportunityId = "",
  state,
  command,
  onClose,
}: {
  task?: Task;
  customerId?: string;
  opportunityId?: string;
  state: Workspace;
  command: Command;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: task?.title || "",
    dueDate: task?.dueDate || localDate(state.profile.timezone),
    customerId: task?.customerId || customerId,
    opportunityId: task?.opportunityId || opportunityId,
    done: task?.done || false,
    owner: task?.owner || state.profile.name,
    note: task?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function update(key: keyof typeof form, value: string | boolean) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await command("task.save", { ...form, id: task?.id });
      toast(task ? "Tarefa atualizada." : "Tarefa agendada.");
      onClose();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Editar tarefa" : "Agendar follow-up"}
      onClose={onClose}
    >
      <form onSubmit={save} className="crm-form">
        <div className="form-grid">
          <Field label="Próxima ação">
            <input
              autoFocus
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </Field>
          <Field label="Prazo">
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(event) => update("dueDate", event.target.value)}
            />
          </Field>
          <Field label="Responsável">
            <input
              required
              maxLength={120}
              value={form.owner}
              onChange={(event) => update("owner", event.target.value)}
            />
          </Field>
          <Field label="Cliente">
            <select
              value={form.customerId}
              onChange={(event) => {
                update("customerId", event.target.value);
                update("opportunityId", "");
              }}
            >
              <option value="">Sem vínculo</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Oportunidade">
            <select
              value={form.opportunityId}
              onChange={(event) => {
                const opportunity = state.opportunities.find(
                  (item) => item.id === event.target.value,
                );
                update("opportunityId", event.target.value);
                if (opportunity) update("customerId", opportunity.customerId);
              }}
            >
              <option value="">Sem vínculo</option>
              {state.opportunities
                .filter(
                  (opportunity) =>
                    !form.customerId ||
                    opportunity.customerId === form.customerId,
                )
                .map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea
            rows={4}
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            maxLength={5000}
          />
        </Field>
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={form.done}
            onChange={(event) => update("done", event.target.checked)}
          />
          Tarefa concluída
        </label>
        <ErrorMessage error={error} />
        <FormActions busy={busy} onClose={onClose} label="Salvar tarefa" />
      </form>
    </Modal>
  );
}

function ProposalRow({
  proposal,
  state,
  onEdit,
  onDelete,
}: {
  proposal: Proposal;
  state: Workspace;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  return (
    <article className="crm-record" data-record-id={proposal.id}>
      <div className="crm-record-icon">
        <FileText size={19} />
      </div>
      <div className="crm-record-main">
        <strong>{proposal.title}</strong>
        <span className="muted">
          {displayDate(proposal.date)} · {proposalLabels[proposal.status]}
        </span>
        <span>
          <Money value={proposal.amountMinor} currency={proposal.currency} />
        </span>
      </div>
      <div className="crm-record-actions">
        <button
          className="button button-secondary"
          onClick={() => {
            try {
              printProposal(
                proposal,
                state.customers.find(
                  (customer) => customer.id === proposal.customerId,
                ),
                state.profile.name,
              );
            } catch (reason) {
              toast(messageOf(reason));
            }
          }}
        >
          <FileText size={15} />
          Imprimir / PDF
        </button>
        <button
          className="crm-icon-button"
          aria-label={`Editar proposta ${proposal.title}`}
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
        <button
          className="crm-icon-button"
          aria-label={`Excluir proposta ${proposal.title}`}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function CustomerDetail({
  customer,
  state,
  command,
  onClose,
  onEdit,
}: {
  customer: Customer;
  state: Workspace;
  command: Command;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [proposalEditor, setProposalEditor] = useState<Proposal | "new" | null>(
    null,
  );
  const [taskEditor, setTaskEditor] = useState<Task | "new" | null>(null);
  const [deleteProposal, setDeleteProposal] = useState<Proposal | null>(null);
  const toast = useToast();
  const sales = state.sales.filter((sale) => sale.customerId === customer.id);
  const proposals = state.proposals.filter(
    (proposal) => proposal.customerId === customer.id,
  );
  const tasks = state.tasks.filter((task) => task.customerId === customer.id);
  const approaches = state.approaches.filter(
    (approach) => approach.customerId === customer.id,
  );
  const opportunities = state.opportunities.filter(
    (opportunity) => opportunity.customerId === customer.id,
  );
  const totals = (["BRL", "EUR", "USD"] as Currency[])
    .map((currency) => ({
      currency,
      outstanding: sales
        .filter((sale) => sale.currency === currency)
        .reduce((sum, sale) => sum + pending(state, sale), 0),
      received: sales
        .filter((sale) => sale.currency === currency)
        .reduce((sum, sale) => sum + netReceived(state, sale.id), 0),
      hasSales: sales.some((sale) => sale.currency === currency),
    }))
    .filter((total) => total.hasSales);
  return (
    <>
      <Modal title={customer.name} onClose={onClose}>
        <div className="crm-detail">
          <div className="crm-detail-top">
            <span className="badge">
              {
                countries.find((country) => country.code === customer.country)
                  ?.label
              }{" "}
              · {customer.category || "Segmento não informado"}
            </span>
            <button className="button button-secondary" onClick={onEdit}>
              <Pencil size={15} />
              Editar cliente
            </button>
          </div>
          <nav className="crm-tabs" aria-label="Informações do cliente">
            {[
              { id: "overview", label: "Resumo" },
              { id: "finance", label: `Financeiro (${sales.length})` },
              { id: "proposals", label: `Propostas (${proposals.length})` },
              { id: "approaches", label: `Abordagens (${approaches.length})` },
              { id: "tasks", label: `Tarefas (${tasks.length})` },
            ].map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {tab === "overview" && (
            <>
              <dl className="crm-contact-list">
                <div>
                  <dt>
                    <Mail size={15} />
                    E-mail
                  </dt>
                  <dd>{customer.email || "Não informado"}</dd>
                </div>
                <div>
                  <dt>
                    <Phone size={15} />
                    Telefone
                  </dt>
                  <dd>{customer.phone || "Não informado"}</dd>
                </div>
                <div>
                  <dt>
                    <Globe2 size={15} />
                    Site
                  </dt>
                  <dd>
                    {customer.website || "Não informado"}
                    <small>{siteLabels[customer.websiteStatus]}</small>
                  </dd>
                </div>
                <div>
                  <dt>Idioma</dt>
                  <dd>
                    {
                      languages.find(
                        (language) => language.value === customer.language,
                      )?.label
                    }
                  </dd>
                </div>
              </dl>
              {customer.websiteStatus === "verified_absent" && (
                <div className="crm-info">
                  Verificação em {displayDate(customer.verifiedAt)}:{" "}
                  {customer.verificationNote}
                </div>
              )}
              <div className="crm-tags">
                {customer.tags.map((tag) => (
                  <span className="badge" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <h3>Notas do relacionamento</h3>
              <p className="crm-preserve-text muted">
                {customer.notes || "Adicione notas ao editar este cliente."}
              </p>
              <h3>Oportunidades</h3>
              {opportunities.length ? (
                opportunities.map((opportunity) => (
                  <div className="crm-summary-row" key={opportunity.id}>
                    <div>
                      <strong>{opportunity.title}</strong>
                      <small>
                        {
                          state.stages.find(
                            (stage) => stage.id === opportunity.stageId,
                          )?.name
                        }{" "}
                        ·{" "}
                        {opportunity.nextAction || "Próxima ação não definida"}
                      </small>
                    </div>
                    <Money
                      value={opportunity.amountMinor}
                      currency={opportunity.currency}
                    />
                  </div>
                ))
              ) : (
                <p className="muted">Nenhuma oportunidade vinculada.</p>
              )}
              <p className="crm-timestamp">
                Cadastrado em {displayDate(customer.createdAt)} · Atualizado em{" "}
                {displayDate(customer.updatedAt)}
              </p>
            </>
          )}
          {tab === "finance" && (
            <>
              {totals.length > 0 && (
                <div className="crm-customer-balances">
                  {totals.map((total) => (
                    <div key={total.currency}>
                      <span>{total.currency} · recebido líquido</span>
                      <strong>
                        <Money
                          value={total.received}
                          currency={total.currency}
                        />
                      </strong>
                      <span>
                        A receber: {money(total.outstanding, total.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {sales.length ? (
                <div className="crm-detail-sales">
                  {sales.map((sale) => (
                    <article key={sale.id} className="crm-sale-record">
                      <div className="crm-summary-row">
                        <div>
                          <strong>{sale.service}</strong>
                          <small>
                            {displayDate(sale.date)} ·{" "}
                            {sale.status === "cancelled"
                              ? "Cancelada"
                              : pending(state, sale) === 0
                                ? "Quitada"
                                : netReceived(state, sale.id) > 0
                                  ? "Parcialmente recebida"
                                  : "Pendente"}
                          </small>
                        </div>
                        <Money
                          value={sale.amountMinor}
                          currency={sale.currency}
                        />
                      </div>
                      <div className="crm-sale-amounts">
                        <span>
                          Recebido líquido:{" "}
                          {money(netReceived(state, sale.id), sale.currency)}
                        </span>
                        <span>
                          A receber:{" "}
                          {money(pending(state, sale), sale.currency)}
                        </span>
                      </div>
                      {state.receipts
                        .filter((receipt) => receipt.saleId === sale.id)
                        .map((receipt) => (
                          <div className="crm-receipt-row" key={receipt.id}>
                            <CheckCircle2 size={14} />
                            <span>
                              {displayDate(receipt.date)} ·{" "}
                              {receipt.method || "Forma não informada"}
                            </span>
                            <strong>
                              {money(receipt.amountMinor, sale.currency)}
                            </strong>
                          </div>
                        ))}
                      {state.refunds
                        .filter((refund) => refund.saleId === sale.id)
                        .map((refund) => (
                          <div
                            className="crm-receipt-row crm-refund"
                            key={refund.id}
                          >
                            <span>Estorno em {displayDate(refund.date)}</span>
                            <strong>
                              − {money(refund.amountMinor, sale.currency)}
                            </strong>
                          </div>
                        ))}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Nenhuma venda cadastrada"
                  description="As vendas e os recebimentos vinculados a este cliente aparecerão aqui."
                />
              )}
            </>
          )}
          {tab === "proposals" && (
            <>
              <div className="crm-section-action">
                <button
                  className="button button-primary"
                  onClick={() => setProposalEditor("new")}
                >
                  <Plus size={16} />
                  Criar proposta
                </button>
              </div>
              {proposals.length ? (
                proposals.map((proposal) => (
                  <ProposalRow
                    key={proposal.id}
                    proposal={proposal}
                    state={state}
                    onEdit={() => setProposalEditor(proposal)}
                    onDelete={() => setDeleteProposal(proposal)}
                  />
                ))
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Propostas ainda não cadastradas"
                  description="Cadastre o escopo e as condições reais da sua oferta."
                />
              )}
            </>
          )}
          {tab === "approaches" &&
            (approaches.length ? (
              approaches.map((approach) => (
                <article className="crm-approach-record" key={approach.id}>
                  <div className="crm-summary-row">
                    <strong>
                      {approach.subject ||
                        (approach.channel === "call"
                          ? "Roteiro de ligação"
                          : "Mensagem comercial")}
                    </strong>
                    <span className="badge">
                      {approach.status === "replied"
                        ? "Respondida"
                        : approach.status === "contacted"
                          ? "Contato registrado"
                          : "Rascunho"}
                    </span>
                  </div>
                  <p className="crm-preserve-text">{approach.body}</p>
                  <small className="muted">
                    {approach.language} · {approach.channel} ·{" "}
                    {displayDate(approach.date)}
                  </small>
                  {approach.nextStep && (
                    <p className="crm-info">
                      Próximo passo: {approach.nextStep}
                    </p>
                  )}
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          [approach.subject, approach.body]
                            .filter(Boolean)
                            .join("\n\n"),
                        )
                        .then(() => toast("Abordagem copiada."))
                        .catch(() =>
                          toast(
                            "Não foi possível copiar. Selecione o texto para copiar manualmente.",
                          ),
                        );
                    }}
                  >
                    Copiar abordagem
                  </button>
                </article>
              ))
            ) : (
              <EmptyState
                icon={Mail}
                title="Nenhuma abordagem salva"
                description="As mensagens vinculadas a este cliente aparecerão aqui após serem salvas em Abordagens."
              />
            ))}
          {tab === "tasks" && (
            <>
              <div className="crm-section-action">
                <button
                  className="button button-primary"
                  onClick={() => setTaskEditor("new")}
                >
                  <Plus size={16} />
                  Agendar follow-up
                </button>
              </div>
              {tasks.length ? (
                tasks.map((task) => (
                  <div
                    className={`crm-task-inline ${task.done ? "is-done" : ""}`}
                    data-record-id={task.id}
                    key={task.id}
                  >
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        {displayDate(task.dueDate)} · {task.owner} ·{" "}
                        {task.done ? "Concluída" : "Aberta"}
                      </small>
                    </div>
                    <button
                      className="crm-icon-button"
                      onClick={() => setTaskEditor(task)}
                      aria-label={`Editar tarefa ${task.title}`}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="Nenhum acompanhamento agendado"
                  description="Defina o próximo contato para manter o relacionamento em movimento."
                />
              )}
            </>
          )}
        </div>
      </Modal>
      {proposalEditor && (
        <ProposalEditor
          proposal={proposalEditor === "new" ? undefined : proposalEditor}
          customerId={customer.id}
          state={state}
          command={command}
          onClose={() => setProposalEditor(null)}
        />
      )}
      {taskEditor && (
        <TaskEditor
          task={taskEditor === "new" ? undefined : taskEditor}
          customerId={customer.id}
          state={state}
          command={command}
          onClose={() => setTaskEditor(null)}
        />
      )}
      {deleteProposal && (
        <ConfirmDelete
          title="Excluir proposta?"
          onClose={() => setDeleteProposal(null)}
          onDelete={async () => {
            await command("proposal.delete", { id: deleteProposal.id });
            toast("Proposta excluída.");
          }}
        >
          <p>
            A proposta <strong>{deleteProposal.title}</strong> será excluída.
            Vendas e recebimentos serão preservados.
          </p>
        </ConfirmDelete>
      )}
    </>
  );
}

export function CustomersPage() {
  const { state, command } = useWorkspace();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [site, setSite] = useState("");
  const [editor, setEditor] = useState<Customer | "new" | null>(null);
  const [detailId, setDetailId] = useState("");
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const filtered = useMemo(
    () =>
      state.customers.filter(
        (customer) =>
          (!country || customer.country === country) &&
          (!site || customer.websiteStatus === site) &&
          searchable(
            [
              customer.name,
              customer.email,
              customer.phone,
              customer.category,
              ...customer.tags,
            ].join(" "),
          ).includes(searchable(query)),
      ),
    [state.customers, query, country, site],
  );
  const duplicates = useMemo(
    () => duplicatePairs(state.customers),
    [state.customers],
  );
  const detail = state.customers.find((customer) => customer.id === detailId);
  return (
    <>
      <PageHeading
        eyebrow="RELACIONAMENTOS"
        title="Clientes"
        description="Contatos, histórico e próximos passos no mesmo lugar."
        action={
          <button
            className="button button-primary"
            onClick={() => setEditor("new")}
          >
            <Plus size={17} />
            Cadastrar cliente
          </button>
        }
      />
      <div className="crm-overview-strip">
        <div>
          <Users size={20} />
          <span>
            <strong>{state.customers.length}</strong> clientes cadastrados
          </span>
        </div>
        <div>
          <Globe2 size={20} />
          <span>
            <strong>
              {
                new Set(state.customers.map((customer) => customer.country))
                  .size
              }
            </strong>{" "}
            países na sua carteira
          </span>
        </div>
        <button
          className="crm-duplicates-button"
          onClick={() => setShowDuplicates(true)}
        >
          <Layers3 size={18} />
          <span>
            <strong>{duplicates.length}</strong> possíveis duplicatas
          </span>
          <ArrowUpRight size={16} />
        </button>
      </div>
      <Panel>
        <div className="toolbar crm-filterbar">
          <label className="crm-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar clientes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nome, contato, segmento ou etiqueta"
            />
          </label>
          <select
            aria-label="Filtrar clientes por país"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="">Todos os países</option>
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar clientes por situação do site"
            value={site}
            onChange={(event) => setSite(event.target.value)}
          >
            <option value="">Todos os sites</option>
            {Object.entries(siteLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="crm-customers-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>País / segmento</th>
                  <th>Site</th>
                  <th>Relacionamento</th>
                  <th>
                    <span className="crm-sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id} data-record-id={customer.id}>
                    <td>
                      <button
                        className="crm-client-link"
                        onClick={() => setDetailId(customer.id)}
                      >
                        <span className="crm-avatar">
                          {customer.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{customer.name}</strong>
                          <small>
                            {customer.tags.length
                              ? customer.tags.slice(0, 2).join(" · ")
                              : "Abrir histórico"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <div className="crm-cell-stack">
                        <span>{customer.email || "E-mail não informado"}</span>
                        <small>
                          {customer.phone || "Telefone não informado"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="crm-cell-stack">
                        <span>
                          {
                            countries.find(
                              (item) => item.code === customer.country,
                            )?.label
                          }
                        </span>
                        <small>
                          {customer.category || "Segmento não informado"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge crm-site-${customer.websiteStatus}`}
                      >
                        {siteLabels[customer.websiteStatus]}
                      </span>
                    </td>
                    <td>
                      <span className="muted">
                        {
                          state.opportunities.filter(
                            (opportunity) =>
                              opportunity.customerId === customer.id,
                          ).length
                        }{" "}
                        oportunidades
                      </span>
                    </td>
                    <td>
                      <div className="crm-inline-actions">
                        <button
                          className="crm-icon-button"
                          aria-label={`Editar cliente ${customer.name}`}
                          onClick={() => setEditor(customer)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="crm-icon-button"
                          aria-label={`Excluir cliente ${customer.name}`}
                          onClick={() => setDeleteCustomer(customer)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={
              state.customers.length
                ? "Nenhum cliente corresponde aos filtros"
                : "Sua carteira começa aqui"
            }
            description={
              state.customers.length
                ? "Ajuste a busca ou limpe os filtros para encontrar seus clientes."
                : "Cadastre seu primeiro cliente para organizar contatos, oportunidades e vendas."
            }
            action={
              <button
                className="button button-primary"
                onClick={() =>
                  state.customers.length
                    ? (setQuery(""), setCountry(""), setSite(""))
                    : setEditor("new")
                }
              >
                {state.customers.length
                  ? "Limpar filtros"
                  : "Cadastrar primeiro cliente"}
              </button>
            }
          />
        )}
      </Panel>
      {editor && (
        <CustomerEditor
          customer={editor === "new" ? undefined : editor}
          command={command}
          timezone={state.profile.timezone}
          onClose={() => setEditor(null)}
        />
      )}
      {detail && (
        <CustomerDetail
          customer={detail}
          state={state}
          command={command}
          onClose={() => setDetailId("")}
          onEdit={() => {
            setEditor(detail);
            setDetailId("");
          }}
        />
      )}
      {deleteCustomer && (
        <ConfirmDelete
          title="Excluir cliente?"
          onClose={() => setDeleteCustomer(null)}
          onDelete={async () => {
            await command("customer.delete", { id: deleteCustomer.id });
            toast("Cliente excluído.");
          }}
        >
          <p>
            Confirme a exclusão de <strong>{deleteCustomer.name}</strong>. Se
            houver registros vinculados, eles precisam ser resolvidos antes de
            remover o cliente.
          </p>
        </ConfirmDelete>
      )}
      {showDuplicates && (
        <Modal
          title="Revisar possíveis duplicatas"
          onClose={() => setShowDuplicates(false)}
        >
          <p className="crm-info">
            A comparação usa nome, e-mail ou telefone iguais. Nenhum registro é
            mesclado automaticamente.
          </p>
          {duplicates.length ? (
            duplicates.map(([first, second]) => (
              <div
                className="crm-duplicate-pair"
                key={`${first.id}-${second.id}`}
              >
                {[first, second].map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setShowDuplicates(false);
                      setDetailId(customer.id);
                    }}
                  >
                    <strong>{customer.name}</strong>
                    <small>
                      {customer.email ||
                        customer.phone ||
                        "Sem contato informado"}
                    </small>
                    <span>
                      Abrir para revisar <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhuma duplicata identificada"
              description="A revisão aparecerá aqui quando dois cadastros compartilharem nome ou contato."
            />
          )}
        </Modal>
      )}
    </>
  );
}

function OpportunityEditor({
  opportunity,
  state,
  command,
  onClose,
  onWon,
}: {
  opportunity?: Opportunity;
  state: Workspace;
  command: Command;
  onClose: () => void;
  onWon: (id: string) => void;
}) {
  const toast = useToast();
  const initialStage =
    [...state.stages]
      .sort((a, b) => a.order - b.order)
      .find((stage) => stage.kind === "open")?.id ||
    state.stages[0]?.id ||
    "";
  const [form, setForm] = useState({
    title: opportunity?.title || "",
    customerId: opportunity?.customerId || "",
    service: opportunity?.service || state.profile.offer.service || "",
    amount: opportunity ? minorInput(opportunity.amountMinor) : "",
    currency: opportunity?.currency || state.profile.currency,
    stageId: opportunity?.stageId || initialStage,
    owner: opportunity?.owner || state.profile.name,
    nextAction: opportunity?.nextAction || "",
    nextActionDate: opportunity?.nextActionDate || "",
    lostReason: opportunity?.lostReason || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedStage = state.stages.find((stage) => stage.id === form.stageId);
  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { amount, ...data } = form;
      await command("opportunity.save", {
        ...data,
        id: opportunity?.id,
        amountMinor: parseMoney(amount),
        lostReason: selectedStage?.kind === "lost" ? form.lostReason : "",
      });
      toast(opportunity ? "Oportunidade atualizada." : "Oportunidade criada.");
      onClose();
      if (
        opportunity &&
        selectedStage?.kind === "won" &&
        !state.sales.some((sale) => sale.opportunityId === opportunity.id)
      )
        onWon(opportunity.id);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={opportunity ? "Editar oportunidade" : "Criar oportunidade"}
      onClose={onClose}
    >
      <form onSubmit={save} className="crm-form">
        <div className="form-grid">
          <Field label="Título da oportunidade">
            <input
              autoFocus
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </Field>
          <Field label="Cliente">
            <select
              required
              value={form.customerId}
              onChange={(event) => update("customerId", event.target.value)}
            >
              <option value="">Selecionar cliente</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serviço">
            <input
              required
              maxLength={200}
              value={form.service}
              onChange={(event) => update("service", event.target.value)}
            />
          </Field>
          <Field label="Valor da oportunidade">
            <input
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => update("amount", event.target.value)}
            />
          </Field>
          <CurrencyField
            value={form.currency}
            onChange={(currency) => update("currency", currency)}
          />
          <Field label="Etapa">
            <select
              required
              value={form.stageId}
              onChange={(event) => update("stageId", event.target.value)}
            >
              {[...state.stages]
                .sort((a, b) => a.order - b.order)
                .filter((stage) => !!opportunity || stage.kind !== "won")
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Responsável">
            <input
              required
              maxLength={120}
              value={form.owner}
              onChange={(event) => update("owner", event.target.value)}
            />
          </Field>
          <Field label="Prazo da próxima ação">
            <input
              type="date"
              value={form.nextActionDate}
              onChange={(event) => update("nextActionDate", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Próxima ação">
          <input
            maxLength={500}
            value={form.nextAction}
            onChange={(event) => update("nextAction", event.target.value)}
          />
        </Field>
        {selectedStage?.kind === "lost" && (
          <Field label="Motivo da perda">
            <textarea
              required
              rows={3}
              value={form.lostReason}
              onChange={(event) => update("lostReason", event.target.value)}
            />
          </Field>
        )}
        {selectedStage?.kind === "won" && (
          <p className="crm-info">
            Uma venda só será criada após sua confirmação no financeiro. Marcar
            como ganho não registra pagamento.
          </p>
        )}
        <ErrorMessage error={error} />
        <FormActions
          busy={busy}
          onClose={onClose}
          label="Salvar oportunidade"
        />
      </form>
    </Modal>
  );
}

function StageManager({
  state,
  command,
  onClose,
}: {
  state: Workspace;
  command: Command;
  onClose: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Stage | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Stage["kind"]>("open");
  const [order, setOrder] = useState(String(state.stages.length));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<Stage | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await command("stage.save", {
        id: editing?.id,
        name,
        kind,
        order: Number(order),
      });
      toast("Etapa salva.");
      setEditing(null);
      setName("");
      setKind("open");
      setOrder(String(state.stages.length + (editing ? 0 : 1)));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal title="Configurar etapas do funil" onClose={onClose}>
        <div className="crm-stage-list">
          {[...state.stages]
            .sort((a, b) => a.order - b.order)
            .map((stage) => (
              <div className="crm-stage-row" key={stage.id}>
                <span className="crm-stage-index">{stage.order + 1}</span>
                <div>
                  <strong>{stage.name}</strong>
                  <small>
                    {stage.kind === "won"
                      ? "Ganho"
                      : stage.kind === "lost"
                        ? "Perdido"
                        : "Em andamento"}{" "}
                    ·{" "}
                    {
                      state.opportunities.filter(
                        (opportunity) => opportunity.stageId === stage.id,
                      ).length
                    }{" "}
                    oportunidades
                  </small>
                </div>
                <button
                  className="crm-icon-button"
                  aria-label={`Editar etapa ${stage.name}`}
                  onClick={() => {
                    setEditing(stage);
                    setName(stage.name);
                    setKind(stage.kind);
                    setOrder(String(stage.order));
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="crm-icon-button"
                  aria-label={`Excluir etapa ${stage.name}`}
                  disabled={state.opportunities.some(
                    (opportunity) => opportunity.stageId === stage.id,
                  )}
                  title={
                    state.opportunities.some(
                      (opportunity) => opportunity.stageId === stage.id,
                    )
                      ? "Mova as oportunidades antes de excluir esta etapa."
                      : "Excluir etapa"
                  }
                  onClick={() => setRemove(stage)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </div>
        <form className="crm-form crm-stage-form" onSubmit={save}>
          <h3>{editing ? `Editar ${editing.name}` : "Adicionar etapa"}</h3>
          <div className="form-grid">
            <Field label="Nome da etapa">
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
              />
            </Field>
            <Field label="Tipo">
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as Stage["kind"])
                }
              >
                <option value="open">Em andamento</option>
                <option value="won">Ganho</option>
                <option value="lost">Perdido</option>
              </select>
            </Field>
            <Field label="Posição (começa em zero)">
              <input
                required
                type="number"
                min="0"
                max="100"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
              />
            </Field>
          </div>
          <ErrorMessage error={error} />
          <div className="form-actions">
            {editing && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setKind("open");
                  setOrder(String(state.stages.length));
                }}
              >
                Cancelar edição
              </button>
            )}
            <button className="button button-primary" disabled={busy}>
              {busy
                ? "Salvando…"
                : editing
                  ? "Salvar etapa"
                  : "Adicionar etapa"}
            </button>
          </div>
        </form>
      </Modal>
      {remove && (
        <ConfirmDelete
          title="Excluir etapa?"
          onClose={() => setRemove(null)}
          onDelete={async () => {
            await command("stage.delete", { id: remove.id });
            toast("Etapa excluída.");
          }}
        >
          <p>
            Excluir <strong>{remove.name}</strong> do funil? A etapa só pode ser
            removida quando não tiver oportunidades.
          </p>
        </ConfirmDelete>
      )}
    </>
  );
}

export function PipelinePage({
  onCreateSale,
}: {
  onCreateSale: (opportunityId: string) => void;
}) {
  const { state, command } = useWorkspace();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [currency, setCurrency] = useState<Currency>(state.profile.currency);
  const [editor, setEditor] = useState<Opportunity | "new" | null>(null);
  const [showStages, setShowStages] = useState(false);
  const [deleteOpportunity, setDeleteOpportunity] =
    useState<Opportunity | null>(null);
  const [proposalEditor, setProposalEditor] = useState<Proposal | "new" | null>(
    null,
  );
  const [proposalOpportunity, setProposalOpportunity] =
    useState<Opportunity | null>(null);
  const [taskOpportunity, setTaskOpportunity] = useState<Opportunity | null>(
    null,
  );
  const [detailId, setDetailId] = useState("");
  const [customerEditor, setCustomerEditor] = useState<Customer | null>(null);
  const [deleteProposal, setDeleteProposal] = useState<Proposal | null>(null);
  const [loss, setLoss] = useState<{
    opportunity: Opportunity;
    stageId: string;
  } | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [movingId, setMovingId] = useState("");
  const [dragId, setDragId] = useState("");
  const [dropStage, setDropStage] = useState("");
  const sortedStages = [...state.stages].sort((a, b) => a.order - b.order);
  const opportunities = state.opportunities.filter(
    (opportunity) =>
      (!owner || opportunity.owner === owner) &&
      searchable(
        `${opportunity.title} ${opportunity.service} ${customerName(state, opportunity.customerId)}`,
      ).includes(searchable(query)),
  );
  const owners = [
    ...new Set(
      state.opportunities
        .map((opportunity) => opportunity.owner)
        .filter(Boolean),
    ),
  ];
  const detail = state.customers.find((customer) => customer.id === detailId);
  const active = opportunities.filter(
    (opportunity) =>
      state.stages.find((stage) => stage.id === opportunity.stageId)?.kind ===
      "open",
  );
  async function move(
    opportunity: Opportunity,
    stageId: string,
    lostReason?: string,
  ) {
    if (stageId === opportunity.stageId || movingId) return;
    const stage = state.stages.find((item) => item.id === stageId);
    if (!stage) return;
    if (stage.kind === "lost" && !lostReason) {
      setLoss({ opportunity, stageId });
      setLossReason(opportunity.lostReason || "");
      return;
    }
    setMovingId(opportunity.id);
    try {
      await command("opportunity.move", {
        id: opportunity.id,
        stageId,
        lostReason: stage.kind === "lost" ? lostReason : "",
      });
      toast(`Oportunidade movida para ${stage.name}.`);
      if (
        stage.kind === "won" &&
        !state.sales.some((sale) => sale.opportunityId === opportunity.id)
      )
        onCreateSale(opportunity.id);
      setLoss(null);
    } catch (reason) {
      toast(messageOf(reason));
    } finally {
      setMovingId("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CONVERSÃO"
        title="Funil de vendas"
        description="Transforme cada conversa em um próximo passo claro."
        action={
          <div className="crm-heading-actions">
            <button
              className="button button-secondary"
              onClick={() => setShowStages(true)}
            >
              <Layers3 size={17} />
              Etapas
            </button>
            <button
              className="button button-primary"
              onClick={() => setEditor("new")}
              disabled={!state.customers.length || !state.stages.length}
            >
              <Plus size={17} />
              Nova oportunidade
            </button>
          </div>
        }
      />
      <div className="crm-pipeline-summary">
        <div>
          <span>Oportunidades abertas</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>Valor aberto · {currency}</span>
          <strong>
            <Money
              value={active
                .filter((opportunity) => opportunity.currency === currency)
                .reduce((sum, opportunity) => sum + opportunity.amountMinor, 0)}
              currency={currency}
            />
          </strong>
        </div>
        <div>
          <span>Propostas registradas</span>
          <strong>{state.proposals.length}</strong>
        </div>
        <label className="crm-summary-currency">
          <span>Moeda do resumo</span>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            aria-label="Moeda do resumo do funil"
          >
            <option value="BRL">BRL</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>
      <div className="toolbar crm-pipeline-toolbar">
        <label className="crm-search">
          <Search size={17} />
          <input
            aria-label="Buscar oportunidades"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar oportunidade ou cliente"
          />
        </label>
        <select
          aria-label="Filtrar oportunidades por responsável"
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
        >
          <option value="">Todos os responsáveis</option>
          {owners.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="muted">
          Arraste os cartões ou use o seletor de etapa.
        </span>
      </div>
      {!state.customers.length && (
        <Panel>
          <EmptyState
            icon={Users}
            title="Cadastre um cliente para começar"
            description="As oportunidades precisam estar vinculadas a um cliente da sua carteira."
          />
        </Panel>
      )}
      <div className="crm-board" aria-label="Etapas do funil">
        {sortedStages.map((stage) => {
          const items = opportunities.filter(
            (opportunity) => opportunity.stageId === stage.id,
          );
          const stageTotal = items
            .filter((opportunity) => opportunity.currency === currency)
            .reduce((sum, opportunity) => sum + opportunity.amountMinor, 0);
          return (
            <section
              key={stage.id}
              className={`crm-lane crm-lane-${stage.kind} ${dropStage === stage.id ? "is-drop-target" : ""}`}
              onDragOver={(event) => {
                if (dragId) {
                  event.preventDefault();
                  setDropStage(stage.id);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDropStage("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                const opportunity = state.opportunities.find(
                  (item) => item.id === dragId,
                );
                setDragId("");
                setDropStage("");
                if (opportunity) void move(opportunity, stage.id);
              }}
            >
              <header className="crm-lane-header">
                <div>
                  <span className="crm-stage-dot" />
                  <h2>{stage.name}</h2>
                  <span className="crm-lane-count">{items.length}</span>
                </div>
                <small>
                  {money(stageTotal, currency)} · {currency}
                </small>
              </header>
              <div className="crm-lane-cards">
                {items.length ? (
                  items.map((opportunity) => {
                    const sale = state.sales.find(
                      (item) => item.opportunityId === opportunity.id,
                    );
                    const proposals = state.proposals.filter(
                      (proposal) => proposal.opportunityId === opportunity.id,
                    );
                    const overdue =
                      !!opportunity.nextActionDate &&
                      opportunity.nextActionDate <
                        localDate(state.profile.timezone) &&
                      stage.kind === "open";
                    return (
                      <article
                        draggable={!movingId}
                        data-record-id={opportunity.id}
                        onDragStart={(event) => {
                          setDragId(opportunity.id);
                          event.dataTransfer.setData(
                            "text/plain",
                            opportunity.id,
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId("");
                          setDropStage("");
                        }}
                        key={opportunity.id}
                        className={`crm-opportunity-card ${dragId === opportunity.id ? "is-dragging" : ""}`}
                      >
                        <div className="crm-card-eyebrow">
                          <button
                            onClick={() => setDetailId(opportunity.customerId)}
                          >
                            {customerName(state, opportunity.customerId)}
                            <ArrowUpRight size={12} />
                          </button>
                          <GripVertical size={15} aria-hidden="true" />
                        </div>
                        <button
                          className="crm-opportunity-title"
                          onClick={() => setEditor(opportunity)}
                        >
                          {opportunity.title}
                        </button>
                        <p className="crm-card-service">
                          {opportunity.service}
                        </p>
                        <strong className="crm-opportunity-value">
                          <Money
                            value={opportunity.amountMinor}
                            currency={opportunity.currency}
                          />
                        </strong>
                        <div className="crm-card-next">
                          <Clock3 size={14} />
                          <div>
                            <span>
                              {opportunity.nextAction ||
                                "Defina a próxima ação"}
                            </span>
                            {opportunity.nextActionDate && (
                              <small className={overdue ? "crm-overdue" : ""}>
                                {overdue ? "Vencida · " : ""}
                                {displayDate(opportunity.nextActionDate)}
                              </small>
                            )}
                          </div>
                        </div>
                        {stage.kind === "lost" && opportunity.lostReason && (
                          <p className="crm-loss-note">
                            {opportunity.lostReason}
                          </p>
                        )}
                        <div className="crm-card-owner">
                          <span className="crm-mini-avatar">
                            {opportunity.owner.slice(0, 1).toUpperCase() || "—"}
                          </span>
                          <span>{opportunity.owner || "Sem responsável"}</span>
                        </div>
                        <label className="crm-stage-select">
                          <span>Mover para</span>
                          <select
                            aria-label={`Etapa de ${opportunity.title}`}
                            value={opportunity.stageId}
                            disabled={!!movingId}
                            onChange={(event) =>
                              void move(opportunity, event.target.value)
                            }
                          >
                            {sortedStages.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="crm-card-actions">
                          <button
                            className="crm-icon-button"
                            aria-label={`Editar oportunidade ${opportunity.title}`}
                            onClick={() => setEditor(opportunity)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="crm-icon-button"
                            aria-label={`Criar proposta para ${opportunity.title}`}
                            onClick={() => {
                              setProposalOpportunity(opportunity);
                              setProposalEditor("new");
                            }}
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            className="crm-icon-button"
                            aria-label={`Agendar tarefa para ${opportunity.title}`}
                            onClick={() => setTaskOpportunity(opportunity)}
                          >
                            <CalendarDays size={15} />
                          </button>
                          <button
                            className="crm-icon-button"
                            aria-label={`Excluir oportunidade ${opportunity.title}`}
                            onClick={() => setDeleteOpportunity(opportunity)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {proposals.length > 0 && (
                          <div className="crm-card-proposals">
                            {proposals.map((proposal) => (
                              <button
                                key={proposal.id}
                                onClick={() => {
                                  setProposalOpportunity(opportunity);
                                  setProposalEditor(proposal);
                                }}
                              >
                                <FileText size={12} />
                                {proposal.title}
                                <span>{proposalLabels[proposal.status]}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {stage.kind === "won" &&
                          (sale ? (
                            <span className="badge crm-linked-sale">
                              <CheckCircle2 size={13} />
                              Venda vinculada
                              {sale.status === "cancelled"
                                ? " · cancelada"
                                : ""}
                            </span>
                          ) : (
                            <button
                              className="button button-primary crm-sale-button"
                              onClick={() => onCreateSale(opportunity.id)}
                            >
                              Confirmar cadastro de venda
                            </button>
                          ))}
                      </article>
                    );
                  })
                ) : (
                  <div className="crm-lane-empty">
                    <span>
                      {query || owner
                        ? "Nenhuma oportunidade neste filtro"
                        : "Nenhuma oportunidade nesta etapa"}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {state.proposals.length > 0 && (
        <Panel title="Propostas comerciais">
          <div className="crm-proposal-list">
            {state.proposals.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                state={state}
                onEdit={() => {
                  setProposalOpportunity(
                    state.opportunities.find(
                      (opportunity) =>
                        opportunity.id === proposal.opportunityId,
                    ) || null,
                  );
                  setProposalEditor(proposal);
                }}
                onDelete={() => setDeleteProposal(proposal)}
              />
            ))}
          </div>
        </Panel>
      )}
      {editor && (
        <OpportunityEditor
          opportunity={editor === "new" ? undefined : editor}
          state={state}
          command={command}
          onClose={() => setEditor(null)}
          onWon={onCreateSale}
        />
      )}
      {showStages && (
        <StageManager
          state={state}
          command={command}
          onClose={() => setShowStages(false)}
        />
      )}
      {proposalEditor && (
        <ProposalEditor
          proposal={proposalEditor === "new" ? undefined : proposalEditor}
          customerId={proposalOpportunity?.customerId}
          opportunityId={proposalOpportunity?.id}
          state={state}
          command={command}
          onClose={() => {
            setProposalEditor(null);
            setProposalOpportunity(null);
          }}
        />
      )}
      {taskOpportunity && (
        <TaskEditor
          customerId={taskOpportunity.customerId}
          opportunityId={taskOpportunity.id}
          state={state}
          command={command}
          onClose={() => setTaskOpportunity(null)}
        />
      )}
      {detail && (
        <CustomerDetail
          customer={detail}
          state={state}
          command={command}
          onClose={() => setDetailId("")}
          onEdit={() => {
            setCustomerEditor(detail);
            setDetailId("");
          }}
        />
      )}
      {customerEditor && (
        <CustomerEditor
          customer={customerEditor}
          command={command}
          timezone={state.profile.timezone}
          onClose={() => setCustomerEditor(null)}
        />
      )}
      {deleteOpportunity && (
        <ConfirmDelete
          title="Excluir oportunidade?"
          onClose={() => setDeleteOpportunity(null)}
          onDelete={async () => {
            await command("opportunity.delete", { id: deleteOpportunity.id });
            toast("Oportunidade excluída.");
          }}
        >
          <p>
            Confirme a exclusão de <strong>{deleteOpportunity.title}</strong>.
            Registros vinculados podem impedir a exclusão para preservar o
            histórico.
          </p>
        </ConfirmDelete>
      )}
      {deleteProposal && (
        <ConfirmDelete
          title="Excluir proposta?"
          onClose={() => setDeleteProposal(null)}
          onDelete={async () => {
            await command("proposal.delete", { id: deleteProposal.id });
            toast("Proposta excluída.");
          }}
        >
          <p>
            A proposta <strong>{deleteProposal.title}</strong> será excluída.
          </p>
        </ConfirmDelete>
      )}
      {loss && (
        <Modal title="Registrar motivo da perda" onClose={() => setLoss(null)}>
          <form
            className="crm-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (lossReason.trim())
                void move(loss.opportunity, loss.stageId, lossReason.trim());
            }}
          >
            <p className="muted">{loss.opportunity.title}</p>
            <Field label="O que impediu o fechamento?">
              <textarea
                autoFocus
                required
                rows={4}
                value={lossReason}
                onChange={(event) => setLossReason(event.target.value)}
              />
            </Field>
            <FormActions
              busy={!!movingId}
              onClose={() => setLoss(null)}
              label="Registrar perda"
            />
          </form>
        </Modal>
      )}
    </>
  );
}

export function AgendaPage() {
  const { state, command } = useWorkspace();
  const toast = useToast();
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [changing, setChanging] = useState("");
  const today = localDate(state.profile.timezone);
  const owners = [
    ...new Set(state.tasks.map((task) => task.owner).filter(Boolean)),
  ];
  const overdue = state.tasks.filter(
    (task) => !task.done && task.dueDate < today,
  );
  const dueToday = state.tasks.filter(
    (task) => !task.done && task.dueDate === today,
  );
  const completed = state.tasks.filter((task) => task.done);
  const tasks = state.tasks
    .filter(
      (task) =>
        (!owner || task.owner === owner) &&
        searchable(
          `${task.title} ${task.note} ${customerName(state, task.customerId)}`,
        ).includes(searchable(query)) &&
        (filter === "all" ||
          (filter === "done" && task.done) ||
          (filter === "open" && !task.done) ||
          (filter === "today" && !task.done && task.dueDate === today) ||
          (filter === "overdue" && !task.done && task.dueDate < today)),
    )
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  async function toggle(task: Task) {
    if (changing) return;
    setChanging(task.id);
    try {
      await command("task.save", { ...task, done: !task.done });
      toast(task.done ? "Tarefa reaberta." : "Tarefa concluída.");
    } catch (reason) {
      toast(messageOf(reason));
    } finally {
      setChanging("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PRÓXIMAS AÇÕES"
        title="Agenda e follow-ups"
        description="Mantenha cada compromisso visível e cada conversa em movimento."
        action={
          <button
            className="button button-primary"
            onClick={() => setEditor("new")}
          >
            <Plus size={17} />
            Agendar tarefa
          </button>
        }
      />
      <div className="crm-agenda-stats">
        <button
          onClick={() => setFilter("overdue")}
          className="crm-agenda-stat crm-agenda-overdue"
        >
          <Clock3 size={21} />
          <span>
            Vencidas<strong>{overdue.length}</strong>
          </span>
        </button>
        <button onClick={() => setFilter("today")} className="crm-agenda-stat">
          <CalendarDays size={21} />
          <span>
            Para hoje<strong>{dueToday.length}</strong>
          </span>
        </button>
        <button onClick={() => setFilter("open")} className="crm-agenda-stat">
          <Layers3 size={21} />
          <span>
            Em aberto<strong>{state.tasks.length - completed.length}</strong>
          </span>
        </button>
        <button onClick={() => setFilter("done")} className="crm-agenda-stat">
          <CheckCircle2 size={21} />
          <span>
            Concluídas<strong>{completed.length}</strong>
          </span>
        </button>
      </div>
      <Panel>
        <div className="crm-agenda-top">
          <nav className="crm-tabs" aria-label="Filtrar tarefas">
            {[
              { id: "open", label: "Em aberto" },
              { id: "today", label: "Hoje" },
              { id: "overdue", label: "Vencidas" },
              { id: "done", label: "Concluídas" },
              { id: "all", label: "Todas" },
            ].map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "active" : ""}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <span className="muted">
            {displayDate(today)} · {state.profile.timezone}
          </span>
        </div>
        <div className="toolbar crm-filterbar">
          <label className="crm-search">
            <Search size={17} />
            <input
              aria-label="Buscar tarefas"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tarefa ou cliente"
            />
          </label>
          <select
            aria-label="Filtrar tarefas por responsável"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {owners.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        {tasks.length ? (
          <div className="crm-agenda-list">
            {tasks.map((task) => {
              const opportunity = state.opportunities.find(
                (item) => item.id === task.opportunityId,
              );
              const isOverdue = !task.done && task.dueDate < today;
              return (
                <article
                  className={`crm-agenda-item ${task.done ? "is-done" : ""}`}
                  data-record-id={task.id}
                  key={task.id}
                >
                  <button
                    className={`crm-task-toggle ${task.done ? "is-checked" : ""}`}
                    aria-label={`${task.done ? "Reabrir" : "Concluir"} tarefa ${task.title}`}
                    aria-pressed={task.done}
                    disabled={!!changing}
                    onClick={() => void toggle(task)}
                  >
                    {task.done && <Check size={17} />}
                  </button>
                  <div className="crm-agenda-item-main">
                    <strong>{task.title}</strong>
                    <div className="crm-task-meta">
                      <span className={isOverdue ? "crm-overdue" : ""}>
                        <CalendarDays size={13} />
                        {displayDate(task.dueDate)}
                        {isOverdue
                          ? " · vencida"
                          : task.dueDate === today && !task.done
                            ? " · hoje"
                            : ""}
                      </span>
                      <span>{task.owner || "Sem responsável"}</span>
                      {task.customerId && (
                        <span>{customerName(state, task.customerId)}</span>
                      )}
                      {opportunity && <span>{opportunity.title}</span>}
                    </div>
                    {task.note && (
                      <p className="crm-preserve-text">{task.note}</p>
                    )}
                  </div>
                  <div className="crm-inline-actions">
                    <button
                      className="crm-icon-button"
                      onClick={() => setEditor(task)}
                      aria-label={`Editar tarefa ${task.title}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="crm-icon-button"
                      onClick={() => setDeleteTask(task)}
                      aria-label={`Excluir tarefa ${task.title}`}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={
              state.tasks.length
                ? "Nenhuma tarefa neste filtro"
                : "Defina seu próximo passo"
            }
            description={
              state.tasks.length
                ? "Altere os filtros ou agende um novo acompanhamento."
                : "Agende contatos, revisões de proposta e acompanhamentos com um prazo claro."
            }
            action={
              <button
                className="button button-primary"
                onClick={() => setEditor("new")}
              >
                <Plus size={16} />
                Agendar tarefa
              </button>
            }
          />
        )}
      </Panel>
      {editor && (
        <TaskEditor
          task={editor === "new" ? undefined : editor}
          state={state}
          command={command}
          onClose={() => setEditor(null)}
        />
      )}
      {deleteTask && (
        <ConfirmDelete
          title="Excluir tarefa?"
          onClose={() => setDeleteTask(null)}
          onDelete={async () => {
            await command("task.delete", { id: deleteTask.id });
            toast("Tarefa excluída.");
          }}
        >
          <p>
            A tarefa <strong>{deleteTask.title}</strong> será removida da
            agenda.
          </p>
        </ConfirmDelete>
      )}
    </>
  );
}
