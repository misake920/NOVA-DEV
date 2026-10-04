import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  CreditCard,
  Download,
  FileText,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useWorkspace } from "../lib/WorkspaceContext";
import {
  displayDate,
  installmentBalances,
  localDate,
  money,
  netReceived,
  parseMoney,
  pending,
} from "../lib/workspace";
import type {
  Currency,
  Expense,
  Receipt,
  Sale,
  Workspace,
} from "../lib/workspace";
import {
  EmptyState,
  Field,
  Modal,
  Money,
  PageHeading,
  Panel,
  useToast,
} from "../components/ui";
import "./finance.css";

type Tab = "sales" | "receipts" | "expenses" | "receivables";
type SaleForm = {
  id?: string;
  customerId: string;
  opportunityId: string;
  service: string;
  date: string;
  gross: string;
  discount: string;
  currency: Currency;
  method: string;
  note: string;
  installments: { id: string; amount: string; dueDate: string }[];
};
type ExpenseForm = {
  id?: string;
  title: string;
  amount: string;
  currency: Currency;
  date: string;
  category: string;
  note: string;
  paid: boolean;
};
type ReceiptForm = {
  saleId: string;
  amount: string;
  date: string;
  method: string;
  note: string;
};
type RefundForm = {
  receipt: Receipt;
  amount: string;
  date: string;
  note: string;
};
export interface FinancePageProps {
  intent?: { opportunityId?: string; saleId?: string } | null;
  onIntentHandled?: () => void;
  onCreateCustomer?: () => void;
}
const currencies: Currency[] = ["BRL", "EUR", "USD"];
const paymentMethods = [
  "Pix",
  "Transferência bancária",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "PayPal",
  "Outro",
];
const tabs: { id: Tab; label: string }[] = [
  { id: "sales", label: "Vendas" },
  { id: "receipts", label: "Recebimentos" },
  { id: "expenses", label: "Despesas" },
  { id: "receivables", label: "Contas a receber" },
];
const decimal = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");
const firstDay = (date: string) => `${date.slice(0, 7)}-01`;
const inRange = (date: string, from: string, to: string) =>
  (!from || date >= from) && (!to || date <= to);
function addMonth(date: string, months: number) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
function makeInstallments(
  total: number,
  count: number,
  dueDate: string,
  previous: SaleForm["installments"] = [],
) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => ({
    id: previous[index]?.id || crypto.randomUUID(),
    amount: decimal(base + (index < total % count ? 1 : 0)),
    dueDate: addMonth(dueDate, index),
  }));
}
function refundAmount(state: Workspace, receiptId: string) {
  return state.refunds
    .filter((r) => r.receiptId === receiptId)
    .reduce((total, item) => total + item.amountMinor, 0);
}
function nextDueDate(state: Workspace, sale: Sale) {
  return (
    installmentBalances(state, sale).find((part) => part.balance > 0)
      ?.dueDate || ""
  );
}
function csvCell(value: string | number) {
  const raw = String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
function saveCsv(name: string, rows: (string | number)[][]) {
  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FinancePage({
  intent,
  onIntentHandled,
  onCreateCustomer,
}: FinancePageProps) {
  const { state, command, live, lastSync } = useWorkspace();
  const toast = useToast();
  const today = localDate(state.profile.timezone);
  const [tab, setTab] = useState<Tab>("sales");
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState<Currency | "all">("all");
  const [from, setFrom] = useState(firstDay(today));
  const [to, setTo] = useState(today);
  const [saleForm, setSaleForm] = useState<SaleForm | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm | null>(null);
  const [refundForm, setRefundForm] = useState<RefundForm | null>(null);
  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const handledIntent = useRef<string>("");
  const customerName = (id: string) =>
    state.customers.find((customer) => customer.id === id)?.name ||
    "Cliente não encontrado";
  const saleById = (id: string) => state.sales.find((sale) => sale.id === id);
  const matches = (values: string[]) =>
    !query.trim() ||
    values
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(query.trim().toLocaleLowerCase("pt-BR"));
  const currencyMatches = (value: Currency) =>
    currency === "all" || value === currency;
  const invalidRange = Boolean(from && to && from > to);

  function openSale(sale?: Sale) {
    setError("");
    setSaleForm(
      sale
        ? {
            id: sale.id,
            customerId: sale.customerId,
            opportunityId: sale.opportunityId,
            service: sale.service,
            date: sale.date,
            gross: decimal(sale.grossMinor),
            discount: decimal(sale.discountMinor),
            currency: sale.currency,
            method: sale.method,
            note: sale.note,
            installments: sale.installments.map((item) => ({
              id: item.id,
              amount: decimal(item.amountMinor),
              dueDate: item.dueDate,
            })),
          }
        : {
            customerId: "",
            opportunityId: "",
            service: "",
            date: today,
            gross: "",
            discount: "0,00",
            currency: state.profile.currency,
            method: "Pix",
            note: "",
            installments: [
              { id: crypto.randomUUID(), amount: "", dueDate: today },
            ],
          },
    );
  }
  function openExpense(expense?: Expense) {
    setError("");
    setExpenseForm(
      expense
        ? {
            id: expense.id,
            title: expense.title,
            amount: decimal(expense.amountMinor),
            currency: expense.currency,
            date: expense.date,
            category: expense.category,
            note: expense.note,
            paid: expense.paid,
          }
        : {
            title: "",
            amount: "",
            currency: state.profile.currency,
            date: today,
            category: "",
            note: "",
            paid: true,
          },
    );
  }
  function openReceipt(sale: Sale) {
    setError("");
    setReceiptForm({
      saleId: sale.id,
      amount: decimal(pending(state, sale)),
      date: today,
      method: sale.method || "Pix",
      note: "",
    });
  }
  function openRefund(receipt: Receipt) {
    setError("");
    setRefundForm({
      receipt,
      amount: decimal(receipt.amountMinor - refundAmount(state, receipt.id)),
      date: today,
      note: "",
    });
  }
  function closeForms() {
    if (submitting) return;
    setSaleForm(null);
    setExpenseForm(null);
    setReceiptForm(null);
    setRefundForm(null);
    setCancelSale(null);
    setDeleteExpense(null);
    setError("");
  }
  useEffect(() => {
    if (!intent) {
      handledIntent.current = "";
      return;
    }
    const key = JSON.stringify(intent);
    if (handledIntent.current === key) return;
    if (intent.saleId) {
      const sale = state.sales.find((item) => item.id === intent.saleId);
      if (!sale) {
        toast("A venda não está disponível.");
        onIntentHandled?.();
        return;
      }
      setDetailId(sale.id);
      setTab("sales");
    } else if (intent.opportunityId) {
      const opportunity = state.opportunities.find(
        (item) => item.id === intent.opportunityId,
      );
      if (!opportunity) {
        toast("A oportunidade não está disponível.");
        onIntentHandled?.();
        return;
      }
      const existing = state.sales.find(
        (item) =>
          item.opportunityId === opportunity.id && item.status === "active",
      );
      if (existing) {
        setDetailId(existing.id);
        toast("Esta oportunidade já possui uma venda ativa.");
      } else {
        setError("");
        setSaleForm({
          customerId: opportunity.customerId,
          opportunityId: opportunity.id,
          service: opportunity.service || opportunity.title,
          date: today,
          gross: opportunity.amountMinor
            ? decimal(opportunity.amountMinor)
            : "",
          discount: "0,00",
          currency: opportunity.currency,
          method: "Pix",
          note: "",
          installments: [
            {
              id: crypto.randomUUID(),
              amount: opportunity.amountMinor
                ? decimal(opportunity.amountMinor)
                : "",
              dueDate: today,
            },
          ],
        });
      }
      setTab("sales");
    } else {
      openSale();
      setTab("sales");
    }
    handledIntent.current = key;
    onIntentHandled?.();
  }, [intent, state.sales, state.opportunities, today, onIntentHandled, toast]);

  const sales = state.sales.filter(
    (sale) =>
      !invalidRange &&
      currencyMatches(sale.currency) &&
      inRange(sale.date, from, to) &&
      matches([
        customerName(sale.customerId),
        sale.service,
        sale.method,
        sale.note,
      ]),
  );
  const receipts = state.receipts.filter((receipt) => {
    const sale = saleById(receipt.saleId);
    return (
      sale &&
      !invalidRange &&
      currencyMatches(sale.currency) &&
      inRange(receipt.date, from, to) &&
      matches([
        customerName(sale.customerId),
        sale.service,
        receipt.method,
        receipt.note,
      ])
    );
  });
  const expenses = state.expenses.filter(
    (expense) =>
      !invalidRange &&
      currencyMatches(expense.currency) &&
      inRange(expense.date, from, to) &&
      matches([expense.title, expense.category, expense.note]),
  );
  const receivables = state.sales
    .filter(
      (sale) =>
        sale.status === "active" &&
        pending(state, sale) > 0 &&
        !invalidRange &&
        currencyMatches(sale.currency) &&
        inRange(nextDueDate(state, sale), from, to) &&
        matches([customerName(sale.customerId), sale.service]),
    )
    .sort((a, b) => nextDueDate(state, a).localeCompare(nextDueDate(state, b)));
  const allReceivables = state.sales.filter(
    (sale) => sale.status === "active" && pending(state, sale) > 0,
  );
  const summaries = useMemo(
    () =>
      currencies.map((code) => {
        const saleMap = new Map(state.sales.map((sale) => [sale.id, sale]));
        const sold = state.sales
          .filter(
            (sale) =>
              sale.currency === code &&
              sale.status === "active" &&
              inRange(sale.date, from, to),
          )
          .reduce((sum, sale) => sum + sale.amountMinor, 0);
        const received = state.receipts
          .filter(
            (receipt) =>
              saleMap.get(receipt.saleId)?.currency === code &&
              inRange(receipt.date, from, to),
          )
          .reduce((sum, receipt) => sum + receipt.amountMinor, 0);
        const refunded = state.refunds
          .filter(
            (refund) =>
              saleMap.get(refund.saleId)?.currency === code &&
              inRange(refund.date, from, to),
          )
          .reduce((sum, refund) => sum + refund.amountMinor, 0);
        const paid = state.expenses
          .filter(
            (expense) =>
              expense.currency === code &&
              expense.paid &&
              inRange(expense.date, from, to),
          )
          .reduce((sum, expense) => sum + expense.amountMinor, 0);
        const outstanding = state.sales
          .filter((sale) => sale.currency === code)
          .reduce((sum, sale) => sum + pending(state, sale), 0);
        return {
          currency: code,
          sold,
          received: received - refunded,
          paid,
          cash: received - refunded - paid,
          outstanding,
        };
      }),
    [state, from, to],
  );

  async function execute(type: string, payload: unknown, success: string) {
    if (submitting) return false;
    setSubmitting(true);
    setError("");
    try {
      await command(type, payload);
      toast(success);
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar. Seus campos foram preservados.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }
  function updateSaleAmount(field: "gross" | "discount", value: string) {
    if (!saleForm) return;
    let installments = saleForm.installments;
    try {
      const total = Math.max(
        0,
        parseMoney(field === "gross" ? value : saleForm.gross) -
          parseMoney(field === "discount" ? value : saleForm.discount || "0"),
      );
      installments = makeInstallments(
        total,
        installments.length,
        installments[0]?.dueDate || saleForm.date,
        installments,
      );
    } catch {
      /* Keep the user's partial input until the amount becomes valid. */
    }
    setSaleForm({ ...saleForm, [field]: value, installments });
  }
  async function submitSale(event: FormEvent) {
    event.preventDefault();
    if (!saleForm) return;
    try {
      const grossMinor = parseMoney(saleForm.gross);
      const discountMinor = parseMoney(saleForm.discount || "0");
      const amountMinor = grossMinor - discountMinor;
      const original = saleForm.id ? saleById(saleForm.id) : undefined;
      if (!saleForm.customerId || !saleForm.service.trim())
        throw new Error("Selecione um cliente e informe o serviço ou produto.");
      if (amountMinor <= 0)
        throw new Error(
          "O total da venda deve ser maior que zero e o desconto menor que o valor bruto.",
        );
      const installments = saleForm.installments.map((item) => ({
        ...(original?.installments.some((saved) => saved.id === item.id)
          ? { id: item.id }
          : {}),
        amountMinor: parseMoney(item.amount),
        dueDate: item.dueDate,
      }));
      if (installments.some((item) => item.amountMinor <= 0 || !item.dueDate))
        throw new Error(
          "Cada parcela precisa de um valor maior que zero e de um vencimento.",
        );
      if (
        installments.reduce((sum, item) => sum + item.amountMinor, 0) !==
        amountMinor
      )
        throw new Error(
          "A soma das parcelas deve ser exatamente igual ao total da venda.",
        );
      if (saleForm.id && amountMinor < netReceived(state, saleForm.id))
        throw new Error(
          "O total não pode ser menor que os recebimentos líquidos. Registre um estorno antes de reduzir a venda.",
        );
      if (
        original &&
        original.currency !== saleForm.currency &&
        state.receipts.some((receipt) => receipt.saleId === original.id)
      )
        throw new Error(
          "Uma venda com histórico de recebimentos não pode mudar de moeda.",
        );
      const saved = await execute(
        "sale.save",
        {
          ...(saleForm.id ? { id: saleForm.id } : {}),
          customerId: saleForm.customerId,
          opportunityId: saleForm.opportunityId,
          service: saleForm.service.trim(),
          date: saleForm.date,
          grossMinor,
          discountMinor,
          currency: saleForm.currency,
          method: saleForm.method,
          note: saleForm.note,
          installments,
        },
        saleForm.id
          ? "Venda atualizada."
          : "Venda registrada. O recebimento deve ser registrado separadamente.",
      );
      if (saved) setSaleForm(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Confira os valores da venda.",
      );
    }
  }
  async function submitReceipt(event: FormEvent) {
    event.preventDefault();
    if (!receiptForm) return;
    try {
      const sale = saleById(receiptForm.saleId);
      const amountMinor = parseMoney(receiptForm.amount);
      if (!sale || sale.status === "cancelled")
        throw new Error("Esta venda não está disponível para recebimento.");
      if (amountMinor <= 0 || amountMinor > pending(state, sale))
        throw new Error(
          "O recebimento deve ser maior que zero e não pode ultrapassar o saldo a receber.",
        );
      if (
        await execute(
          "receipt.save",
          {
            saleId: sale.id,
            amountMinor,
            date: receiptForm.date,
            method: receiptForm.method,
            installmentId: "",
            note: receiptForm.note,
          },
          "Recebimento registrado e saldo atualizado.",
        )
      )
        setReceiptForm(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Confira o recebimento.",
      );
    }
  }
  async function submitRefund(event: FormEvent) {
    event.preventDefault();
    if (!refundForm) return;
    try {
      const amountMinor = parseMoney(refundForm.amount);
      const available =
        refundForm.receipt.amountMinor -
        refundAmount(state, refundForm.receipt.id);
      if (amountMinor <= 0 || amountMinor > available)
        throw new Error(
          "O estorno deve ser maior que zero e não pode ultrapassar o valor ainda não estornado.",
        );
      if (!refundForm.note.trim())
        throw new Error(
          "Informe o motivo do estorno para preservar o histórico.",
        );
      if (
        await execute(
          "receipt.refund",
          {
            id: refundForm.receipt.id,
            amountMinor,
            date: refundForm.date,
            note: refundForm.note,
          },
          "Estorno registrado. O histórico do recebimento foi preservado.",
        )
      )
        setRefundForm(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Confira o estorno.",
      );
    }
  }
  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (!expenseForm) return;
    try {
      const amountMinor = parseMoney(expenseForm.amount);
      if (!expenseForm.title.trim() || amountMinor <= 0)
        throw new Error("Informe uma descrição e um valor maior que zero.");
      if (
        await execute(
          "expense.save",
          {
            ...(expenseForm.id ? { id: expenseForm.id } : {}),
            title: expenseForm.title.trim(),
            amountMinor,
            currency: expenseForm.currency,
            date: expenseForm.date,
            category: expenseForm.category,
            note: expenseForm.note,
            paid: expenseForm.paid,
          },
          expenseForm.id ? "Despesa atualizada." : "Despesa registrada.",
        )
      )
        setExpenseForm(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Confira a despesa.",
      );
    }
  }
  function exportCurrent() {
    let rows: (string | number)[][];
    if (tab === "sales")
      rows = [
        [
          "ID",
          "Cliente",
          "Serviço",
          "Data da venda",
          "Moeda",
          "Valor bruto",
          "Desconto",
          "Total vendido",
          "Recebido líquido",
          "A receber",
          "Situação",
        ],
        ...sales.map((sale) => [
          sale.id,
          customerName(sale.customerId),
          sale.service,
          sale.date,
          sale.currency,
          decimal(sale.grossMinor),
          decimal(sale.discountMinor),
          decimal(sale.amountMinor),
          decimal(netReceived(state, sale.id)),
          decimal(pending(state, sale)),
          sale.status === "cancelled" ? "Cancelada" : "Ativa",
        ]),
      ];
    else if (tab === "receipts")
      rows = [
        [
          "ID",
          "Cliente",
          "Serviço",
          "Data do recebimento",
          "Moeda",
          "Valor recebido original",
          "Total estornado",
          "Recebimento líquido",
          "Método",
          "Observações",
        ],
        ...receipts.map((receipt) => {
          const sale = saleById(receipt.saleId)!;
          const refunded = refundAmount(state, receipt.id);
          return [
            receipt.id,
            customerName(sale.customerId),
            sale.service,
            receipt.date,
            sale.currency,
            decimal(receipt.amountMinor),
            decimal(refunded),
            decimal(receipt.amountMinor - refunded),
            receipt.method,
            receipt.note,
          ];
        }),
      ];
    else if (tab === "expenses")
      rows = [
        [
          "ID",
          "Descrição",
          "Categoria",
          "Data",
          "Moeda",
          "Valor",
          "Situação",
          "Observações",
        ],
        ...expenses.map((expense) => [
          expense.id,
          expense.title,
          expense.category,
          expense.date,
          expense.currency,
          decimal(expense.amountMinor),
          expense.paid ? "Paga" : "Pendente",
          expense.note,
        ]),
      ];
    else
      rows = [
        [
          "Venda ID",
          "Cliente",
          "Serviço",
          "Próximo vencimento",
          "Moeda",
          "Total vendido",
          "Recebido líquido",
          "Saldo a receber",
        ],
        ...receivables.map((sale) => [
          sale.id,
          customerName(sale.customerId),
          sale.service,
          nextDueDate(state, sale),
          sale.currency,
          decimal(sale.amountMinor),
          decimal(netReceived(state, sale.id)),
          decimal(pending(state, sale)),
        ]),
      ];
    saveCsv(`THE-GHOST-${tab}-${today}.csv`, rows);
    toast(
      "CSV exportado com os filtros atuais. Valores permanecem separados por moeda.",
    );
  }
  let saleTotal = 0;
  let installmentTotal = 0;
  try {
    if (saleForm) {
      saleTotal =
        parseMoney(saleForm.gross) - parseMoney(saleForm.discount || "0");
      installmentTotal = saleForm.installments.reduce(
        (sum, item) => sum + parseMoney(item.amount),
        0,
      );
    }
  } catch {
    /* A partial amount remains editable. */
  }
  const detailSale = detailId ? saleById(detailId) : undefined;
  const financialLocked = Boolean(
    saleForm?.id &&
    state.receipts.some((receipt) => receipt.saleId === saleForm.id),
  );
  const earliestReceiptDate = saleForm?.id
    ? state.receipts
        .filter((receipt) => receipt.saleId === saleForm.id)
        .map((receipt) => receipt.date)
        .sort()[0]
    : undefined;
  const counts = {
    sales: sales.length,
    receipts: receipts.length,
    expenses: expenses.length,
    receivables: receivables.length,
  };
  const emptyAction =
    tab === "expenses" ? (
      <button className="button button-primary" onClick={() => openExpense()}>
        <Plus size={16} />
        Adicionar despesa
      </button>
    ) : tab === "sales" ? (
      <button className="button button-primary" onClick={() => openSale()}>
        <Plus size={16} />
        Adicionar venda
      </button>
    ) : undefined;
  const syncDate = lastSync ? new Date(lastSync) : null;
  const syncLabel =
    syncDate && !Number.isNaN(syncDate.getTime())
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: state.profile.timezone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(syncDate)
      : null;

  return (
    <div className="finance-page">
      <PageHeading
        eyebrow="CONTROLE FINANCEIRO"
        title="Cada venda. Cada movimento."
        description="Registre o que vendeu, acompanhe o que recebeu e saiba o que falta entrar."
        action={
          <div className="finance-heading-actions finance-no-print">
            <button
              className="button button-secondary"
              onClick={() => openExpense()}
            >
              <Plus size={16} />
              Despesa
            </button>
            <button
              className="button button-primary"
              onClick={() => openSale()}
            >
              <Plus size={16} />
              Adicionar venda
            </button>
          </div>
        }
      />
      <div className="finance-status-line">
        <span className={`finance-live ${live ? "is-live" : ""}`}>
          <i />
          {live ? "Sincronizado ao vivo" : "Aguardando conexão"}
        </span>
        <span className="muted">
          {syncLabel
            ? `Última sincronização às ${syncLabel}`
            : "Aguardando sincronização"}{" "}
          · {state.profile.timezone}
        </span>
      </div>
      <div className="finance-filters toolbar finance-no-print">
        <div className="finance-search">
          <Search size={17} />
          <input
            aria-label="Buscar registros financeiros"
            placeholder="Buscar cliente, serviço ou descrição"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Field label="De">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="Até">
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        <Field label="Moeda">
          <select
            value={currency}
            onChange={(event) =>
              setCurrency(event.target.value as Currency | "all")
            }
          >
            <option value="all">Todas, separadas</option>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="button button-secondary finance-today"
          onClick={() => {
            setFrom(today);
            setTo(today);
          }}
        >
          Hoje
        </button>
        <button
          className="button button-secondary finance-today"
          onClick={() => {
            setFrom(firstDay(today));
            setTo(today);
          }}
        >
          Este mês
        </button>
      </div>
      {invalidRange && (
        <p className="error-message" role="alert">
          A data inicial deve ser anterior ou igual à final.
        </p>
      )}
      <div className="finance-print-heading">
        THE GHOST {"</>"} · Relatório financeiro ·{" "}
        {from ? displayDate(from) : "Início"} a {to ? displayDate(to) : "Hoje"}{" "}
        · {tabs.find((item) => item.id === tab)?.label}
      </div>
      <div
        className="finance-currency-grid"
        aria-label="Resumo financeiro por moeda"
      >
        {summaries.map((summary) => (
          <section
            className={`finance-currency-card ${currency === summary.currency ? "is-selected" : ""}`}
            key={summary.currency}
            aria-label={`Resumo em ${summary.currency}`}
          >
            <div className="finance-currency-top">
              <span className="finance-currency-code">{summary.currency}</span>
              <Wallet size={18} />
              <span className="muted">Saldo líquido de caixa no período</span>
            </div>
            <strong
              className={`finance-cash-value ${summary.cash < 0 ? "is-negative" : ""}`}
            >
              <Money value={summary.cash} currency={summary.currency} />
            </strong>
            <dl>
              <div>
                <dt>Vendido no período</dt>
                <dd>
                  <Money value={summary.sold} currency={summary.currency} />
                </dd>
              </div>
              <div>
                <dt>Recebido líquido no período</dt>
                <dd>
                  <Money value={summary.received} currency={summary.currency} />
                </dd>
              </div>
              <div>
                <dt>Despesas pagas no período</dt>
                <dd>
                  <Money value={summary.paid} currency={summary.currency} />
                </dd>
              </div>
              <div className="finance-outstanding">
                <dt>A receber total</dt>
                <dd>
                  <Money
                    value={summary.outstanding}
                    currency={summary.currency}
                  />
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <p className="finance-summary-note muted">
        Caixa = recebimentos − estornos − despesas pagas no período. A receber
        considera todas as vendas ativas, independentemente da data. Os resumos
        não usam a busca por texto. Moedas não são somadas. Saldo de caixa não é
        lucro.
      </p>
      <Panel className="finance-ledger">
        <div className="finance-ledger-top">
          <div
            className="finance-tabs finance-no-print"
            role="tablist"
            aria-label="Registros financeiros"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                id={`finance-tab-${item.id}`}
                role="tab"
                aria-controls="finance-tab-panel"
                aria-selected={tab === item.id}
                className={tab === item.id ? "is-active" : ""}
                onClick={() => {
                  setTab(item.id);
                  setError("");
                }}
              >
                {item.label}
                <span>{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="finance-export-actions finance-no-print">
            <button
              className="button button-secondary"
              onClick={exportCurrent}
              disabled={invalidRange || counts[tab] === 0}
            >
              <Download size={15} />
              CSV
            </button>
            <button
              className="button button-secondary"
              onClick={() => window.print()}
              disabled={invalidRange}
            >
              <Printer size={15} />
              Imprimir / PDF
            </button>
          </div>
        </div>
        <div
          id="finance-tab-panel"
          role="tabpanel"
          aria-labelledby={`finance-tab-${tab}`}
        >
          {tab === "receivables" && (
            <p className="finance-table-note muted">
              O período filtra o próximo vencimento em aberto. Recebimentos são
              alocados do vencimento mais antigo ao mais recente.{" "}
              {allReceivables.length > receivables.length && (
                <button
                  className="finance-text-button finance-no-print"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                    setQuery("");
                    setCurrency("all");
                  }}
                >
                  Ver todas as contas em aberto
                </button>
              )}
            </p>
          )}
          {tab === "receipts" && (
            <p className="finance-table-note muted">
              O período filtra a data original dos recebimentos. Estornos abaixo
              incluem todo o histórico; o caixa acima usa a data em que cada
              movimento aconteceu.
            </p>
          )}
          {counts[tab] === 0 ? (
            <EmptyState
              icon={
                tab === "expenses"
                  ? ArrowUpRight
                  : tab === "receipts"
                    ? ArrowDownLeft
                    : tab === "receivables"
                      ? Wallet
                      : Banknote
              }
              title={
                query || currency !== "all"
                  ? "Nenhum registro com esses filtros"
                  : tab === "sales"
                    ? "Sua próxima venda começa aqui"
                    : tab === "receipts"
                      ? "Nenhum recebimento neste período"
                      : tab === "expenses"
                        ? "Despesas sob controle, desde o início"
                        : "Nenhuma conta a receber neste período"
              }
              description={
                tab === "sales"
                  ? "Selecione um cliente do CRM e registre uma venda real. O valor recebido será registrado separadamente."
                  : tab === "receipts"
                    ? "Registre pagamentos de uma venda na aba Vendas ou Contas a receber."
                    : tab === "expenses"
                      ? "Adicione custos e marque quando forem pagos. Somente despesas pagas alteram o saldo de caixa."
                      : "As vendas com saldo pendente aparecem aqui pelo próximo vencimento. Amplie o período para revisar outras contas."
              }
              action={emptyAction}
            />
          ) : (
            <div className="table-wrap">
              {tab === "sales" && (
                <table>
                  <thead>
                    <tr>
                      <th>Cliente / serviço</th>
                      <th>Data</th>
                      <th>Vendido</th>
                      <th>Recebido líquido</th>
                      <th>A receber</th>
                      <th>Situação</th>
                      <th className="finance-no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sales]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((sale) => (
                        <tr key={sale.id}>
                          <td>
                            <button
                              className="finance-record-link"
                              onClick={() => setDetailId(sale.id)}
                            >
                              {customerName(sale.customerId)}
                            </button>
                            <span className="finance-cell-detail">
                              {sale.service}
                            </span>
                          </td>
                          <td>{displayDate(sale.date)}</td>
                          <td>
                            <Money
                              value={sale.amountMinor}
                              currency={sale.currency}
                            />
                            <span className="finance-cell-detail">
                              {sale.currency} · {sale.installments.length}{" "}
                              parcela{sale.installments.length === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td>
                            <Money
                              value={netReceived(state, sale.id)}
                              currency={sale.currency}
                            />
                          </td>
                          <td>
                            <Money
                              value={pending(state, sale)}
                              currency={sale.currency}
                            />
                          </td>
                          <td>
                            <span
                              className={`badge ${sale.status === "cancelled" ? "finance-badge-muted" : pending(state, sale) === 0 ? "finance-badge-paid" : "finance-badge-pending"}`}
                            >
                              {sale.status === "cancelled"
                                ? "Cancelada"
                                : pending(state, sale) === 0
                                  ? "Recebida"
                                  : netReceived(state, sale.id) > 0
                                    ? "Parcial"
                                    : "A receber"}
                            </span>
                          </td>
                          <td className="finance-no-print">
                            <div className="finance-row-actions">
                              {sale.status === "active" && (
                                <>
                                  <button
                                    className="finance-icon-button"
                                    title={`Editar venda de ${customerName(sale.customerId)}`}
                                    aria-label={`Editar venda de ${customerName(sale.customerId)}`}
                                    onClick={() => openSale(sale)}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  {pending(state, sale) > 0 && (
                                    <button
                                      className="button button-secondary finance-small-button"
                                      onClick={() => openReceipt(sale)}
                                    >
                                      <ArrowDownLeft size={14} />
                                      Receber
                                    </button>
                                  )}
                                  <button
                                    className="finance-icon-button is-danger"
                                    title="Cancelar venda"
                                    aria-label={`Cancelar venda de ${customerName(sale.customerId)}`}
                                    onClick={() => {
                                      setError("");
                                      setCancelSale(sale);
                                    }}
                                  >
                                    <X size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {tab === "receipts" && (
                <table>
                  <thead>
                    <tr>
                      <th>Cliente / serviço</th>
                      <th>Recebido em</th>
                      <th>Valor original</th>
                      <th>Estornado</th>
                      <th>Líquido</th>
                      <th>Método</th>
                      <th className="finance-no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...receipts]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((receipt) => {
                        const sale = saleById(receipt.saleId)!;
                        const refunded = refundAmount(state, receipt.id);
                        return (
                          <tr key={receipt.id}>
                            <td>
                              <button
                                className="finance-record-link"
                                onClick={() => setDetailId(sale.id)}
                              >
                                {customerName(sale.customerId)}
                              </button>
                              <span className="finance-cell-detail">
                                {sale.service}
                              </span>
                            </td>
                            <td>{displayDate(receipt.date)}</td>
                            <td>
                              <Money
                                value={receipt.amountMinor}
                                currency={sale.currency}
                              />
                              <span className="finance-cell-detail">
                                {sale.currency}
                              </span>
                            </td>
                            <td>
                              <Money
                                value={refunded}
                                currency={sale.currency}
                              />
                            </td>
                            <td>
                              <Money
                                value={receipt.amountMinor - refunded}
                                currency={sale.currency}
                              />
                            </td>
                            <td>{receipt.method || "—"}</td>
                            <td className="finance-no-print">
                              {refunded < receipt.amountMinor ? (
                                <button
                                  className="button button-secondary finance-small-button"
                                  onClick={() => openRefund(receipt)}
                                >
                                  <RotateCcw size={14} />
                                  Estornar
                                </button>
                              ) : (
                                <span className="badge finance-badge-muted">
                                  Estorno completo
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
              {tab === "expenses" && (
                <table>
                  <thead>
                    <tr>
                      <th>Descrição / categoria</th>
                      <th>Data</th>
                      <th>Valor</th>
                      <th>Situação</th>
                      <th className="finance-no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...expenses]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((expense) => (
                        <tr key={expense.id}>
                          <td>
                            <strong>{expense.title}</strong>
                            <span className="finance-cell-detail">
                              {expense.category || "Sem categoria"}
                            </span>
                          </td>
                          <td>{displayDate(expense.date)}</td>
                          <td>
                            <Money
                              value={expense.amountMinor}
                              currency={expense.currency}
                            />
                            <span className="finance-cell-detail">
                              {expense.currency}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${expense.paid ? "finance-badge-paid" : "finance-badge-pending"}`}
                            >
                              {expense.paid ? "Paga" : "Pendente"}
                            </span>
                          </td>
                          <td className="finance-no-print">
                            <div className="finance-row-actions">
                              <button
                                className="finance-icon-button"
                                title="Editar despesa"
                                aria-label={`Editar ${expense.title}`}
                                onClick={() => openExpense(expense)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="finance-icon-button is-danger"
                                title="Excluir despesa"
                                aria-label={`Excluir ${expense.title}`}
                                onClick={() => {
                                  setError("");
                                  setDeleteExpense(expense);
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {tab === "receivables" && (
                <table>
                  <thead>
                    <tr>
                      <th>Cliente / serviço</th>
                      <th>Próximo vencimento</th>
                      <th>Vendido</th>
                      <th>Recebido líquido</th>
                      <th>A receber</th>
                      <th className="finance-no-print">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.map((sale) => {
                      const due = nextDueDate(state, sale);
                      return (
                        <tr key={sale.id}>
                          <td>
                            <button
                              className="finance-record-link"
                              onClick={() => setDetailId(sale.id)}
                            >
                              {customerName(sale.customerId)}
                            </button>
                            <span className="finance-cell-detail">
                              {sale.service}
                            </span>
                          </td>
                          <td>
                            {displayDate(due)}
                            {due && due < today && (
                              <span className="finance-cell-detail finance-overdue">
                                Vencida
                              </span>
                            )}
                          </td>
                          <td>
                            <Money
                              value={sale.amountMinor}
                              currency={sale.currency}
                            />
                            <span className="finance-cell-detail">
                              {sale.currency}
                            </span>
                          </td>
                          <td>
                            <Money
                              value={netReceived(state, sale.id)}
                              currency={sale.currency}
                            />
                          </td>
                          <td>
                            <strong>
                              <Money
                                value={pending(state, sale)}
                                currency={sale.currency}
                              />
                            </strong>
                          </td>
                          <td className="finance-no-print">
                            <button
                              className="button button-secondary finance-small-button"
                              onClick={() => openReceipt(sale)}
                            >
                              <ArrowDownLeft size={14} />
                              Registrar recebimento
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </Panel>

      {saleForm && (
        <Modal
          title={saleForm.id ? "Editar venda" : "Registrar nova venda"}
          onClose={closeForms}
        >
          <form onSubmit={submitSale} className="finance-form">
            {state.customers.length === 0 && (
              <p className="finance-information">
                Cadastre um cliente na área Clientes antes de registrar a venda.
                {onCreateCustomer && (
                  <button
                    type="button"
                    className="text-button finance-customer-shortcut"
                    onClick={() => {
                      closeForms();
                      onCreateCustomer();
                    }}
                  >
                    Cadastrar meu primeiro cliente <ArrowUpRight size={14} />
                  </button>
                )}
              </p>
            )}
            {financialLocked && (
              <p className="finance-information">
                Esta venda já possui recebimentos. Cliente, valores, moeda e
                parcelas estão protegidos para preservar o histórico financeiro.
                Você pode atualizar o serviço, as observações e o método
                previsto.
              </p>
            )}
            <div className="form-grid">
              <Field label="Cliente *">
                <select
                  required
                  disabled={financialLocked}
                  value={saleForm.customerId}
                  onChange={(event) =>
                    setSaleForm({
                      ...saleForm,
                      customerId: event.target.value,
                      opportunityId: "",
                    })
                  }
                >
                  <option value="">Selecione um cliente</option>
                  {state.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Oportunidade vinculada">
                <select
                  disabled={financialLocked}
                  value={saleForm.opportunityId}
                  onChange={(event) =>
                    setSaleForm({
                      ...saleForm,
                      opportunityId: event.target.value,
                    })
                  }
                >
                  <option value="">Sem vínculo</option>
                  {state.opportunities
                    .filter(
                      (opportunity) =>
                        opportunity.customerId === saleForm.customerId,
                    )
                    .map((opportunity) => (
                      <option key={opportunity.id} value={opportunity.id}>
                        {opportunity.title}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <Field label="Serviço ou produto *">
              <input
                required
                maxLength={240}
                value={saleForm.service}
                onChange={(event) =>
                  setSaleForm({ ...saleForm, service: event.target.value })
                }
                placeholder="O que foi vendido?"
              />
            </Field>
            <div className="form-grid">
              <Field label="Data da venda *">
                <input
                  required
                  type="date"
                  max={earliestReceiptDate}
                  value={saleForm.date}
                  onChange={(event) =>
                    setSaleForm({ ...saleForm, date: event.target.value })
                  }
                />
              </Field>
              <Field label="Moeda *">
                <select
                  value={saleForm.currency}
                  disabled={financialLocked}
                  onChange={(event) =>
                    setSaleForm({
                      ...saleForm,
                      currency: event.target.value as Currency,
                    })
                  }
                >
                  {currencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </Field>
              <Field label="Valor bruto *">
                <input
                  required
                  inputMode="decimal"
                  disabled={financialLocked}
                  value={saleForm.gross}
                  onChange={(event) =>
                    updateSaleAmount("gross", event.target.value)
                  }
                  placeholder="0,00"
                />
              </Field>
              <Field label="Desconto">
                <input
                  inputMode="decimal"
                  disabled={financialLocked}
                  value={saleForm.discount}
                  onChange={(event) =>
                    updateSaleAmount("discount", event.target.value)
                  }
                  placeholder="0,00"
                />
              </Field>
            </div>
            <div className="finance-form-total">
              <span>Total da venda</span>
              <strong>
                <Money
                  value={Math.max(0, saleTotal)}
                  currency={saleForm.currency}
                />
              </strong>
            </div>
            <div className="form-grid">
              <Field label="Método previsto">
                <select
                  value={saleForm.method}
                  onChange={(event) =>
                    setSaleForm({ ...saleForm, method: event.target.value })
                  }
                >
                  {paymentMethods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </Field>
              <Field label="Número de parcelas">
                <select
                  disabled={financialLocked}
                  value={saleForm.installments.length}
                  onChange={(event) =>
                    setSaleForm({
                      ...saleForm,
                      installments: makeInstallments(
                        Math.max(0, saleTotal),
                        Number(event.target.value),
                        saleForm.installments[0]?.dueDate || saleForm.date,
                        saleForm.installments,
                      ),
                    })
                  }
                >
                  {Array.from({ length: 24 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1} parcela{index ? "s" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset
              className="finance-installments"
              disabled={financialLocked}
            >
              <legend>Valores e vencimentos</legend>
              {saleForm.installments.map((installment, index) => (
                <div className="finance-installment-row" key={installment.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Field label={`Valor da parcela ${index + 1}`}>
                    <input
                      required
                      inputMode="decimal"
                      value={installment.amount}
                      onChange={(event) =>
                        setSaleForm({
                          ...saleForm,
                          installments: saleForm.installments.map(
                            (item, position) =>
                              position === index
                                ? { ...item, amount: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label={`Vencimento da parcela ${index + 1}`}>
                    <input
                      required
                      type="date"
                      value={installment.dueDate}
                      onChange={(event) =>
                        setSaleForm({
                          ...saleForm,
                          installments: saleForm.installments.map(
                            (item, position) =>
                              position === index
                                ? { ...item, dueDate: event.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
              <div
                className={`finance-installment-sum ${installmentTotal !== saleTotal ? "is-mismatch" : ""}`}
              >
                Soma das parcelas: {money(installmentTotal, saleForm.currency)}
                {saleTotal > 0 && installmentTotal === saleTotal && (
                  <Check size={14} />
                )}
              </div>
            </fieldset>
            <Field label="Observações">
              <textarea
                rows={3}
                maxLength={5000}
                value={saleForm.note}
                onChange={(event) =>
                  setSaleForm({ ...saleForm, note: event.target.value })
                }
              />
            </Field>
            <p className="muted finance-form-hint">
              Registrar uma venda cria o saldo a receber. Confirme o pagamento
              real separadamente.
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={submitting || state.customers.length === 0}
              >
                {submitting
                  ? "Salvando…"
                  : saleForm.id
                    ? "Salvar alterações"
                    : "Registrar venda"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {receiptForm && (
        <Modal title="Registrar recebimento" onClose={closeForms}>
          <form onSubmit={submitReceipt} className="finance-form">
            <p className="finance-information">
              {customerName(saleById(receiptForm.saleId)?.customerId || "")} ·{" "}
              {saleById(receiptForm.saleId)?.service}
              <br />
              Saldo a receber:{" "}
              <strong>
                {money(
                  saleById(receiptForm.saleId)
                    ? pending(state, saleById(receiptForm.saleId)!)
                    : 0,
                  saleById(receiptForm.saleId)?.currency,
                )}
              </strong>
            </p>
            <div className="form-grid">
              <Field
                label={`Valor recebido (${saleById(receiptForm.saleId)?.currency || ""}) *`}
              >
                <input
                  required
                  inputMode="decimal"
                  value={receiptForm.amount}
                  onChange={(event) =>
                    setReceiptForm({
                      ...receiptForm,
                      amount: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Data do recebimento *">
                <input
                  required
                  type="date"
                  value={receiptForm.date}
                  onChange={(event) =>
                    setReceiptForm({ ...receiptForm, date: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Método de pagamento">
              <select
                value={receiptForm.method}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, method: event.target.value })
                }
              >
                {paymentMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </Field>
            <Field label="Observações">
              <textarea
                rows={3}
                maxLength={5000}
                value={receiptForm.note}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, note: event.target.value })
                }
              />
            </Field>
            <p className="muted finance-form-hint">
              Registre somente o valor efetivamente recebido. Pagamentos
              parciais mantêm o restante a receber.
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Cancelar
              </button>
              <button className="button button-primary" disabled={submitting}>
                {submitting ? "Registrando…" : "Confirmar recebimento"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {refundForm && (
        <Modal title="Registrar estorno real" onClose={closeForms}>
          <form onSubmit={submitRefund} className="finance-form">
            <p className="finance-information">
              O estorno registra uma saída de dinheiro na data informada e
              preserva o recebimento original. Uma venda ativa volta a ter saldo
              a receber; uma venda cancelada permanece sem recebível.
            </p>
            <div className="form-grid">
              <Field
                label={`Valor estornado (${saleById(refundForm.receipt.saleId)?.currency || ""}) *`}
              >
                <input
                  required
                  inputMode="decimal"
                  value={refundForm.amount}
                  onChange={(event) =>
                    setRefundForm({ ...refundForm, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="Data da devolução *">
                <input
                  required
                  type="date"
                  value={refundForm.date}
                  onChange={(event) =>
                    setRefundForm({ ...refundForm, date: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Motivo do estorno *">
              <textarea
                required
                rows={3}
                maxLength={5000}
                value={refundForm.note}
                onChange={(event) =>
                  setRefundForm({ ...refundForm, note: event.target.value })
                }
                placeholder="Por que o dinheiro foi devolvido?"
              />
            </Field>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Voltar
              </button>
              <button className="button button-primary" disabled={submitting}>
                {submitting ? "Registrando…" : "Confirmar estorno"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {expenseForm && (
        <Modal
          title={expenseForm.id ? "Editar despesa" : "Adicionar despesa"}
          onClose={closeForms}
        >
          <form onSubmit={submitExpense} className="finance-form">
            <Field label="Descrição *">
              <input
                required
                maxLength={240}
                value={expenseForm.title}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, title: event.target.value })
                }
                placeholder="Ex.: hospedagem ou serviço contratado"
              />
            </Field>
            <div className="form-grid">
              <Field label="Valor *">
                <input
                  required
                  inputMode="decimal"
                  value={expenseForm.amount}
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      amount: event.target.value,
                    })
                  }
                  placeholder="0,00"
                />
              </Field>
              <Field label="Moeda *">
                <select
                  value={expenseForm.currency}
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      currency: event.target.value as Currency,
                    })
                  }
                >
                  {currencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  expenseForm.paid ? "Data do pagamento *" : "Vencimento *"
                }
              >
                <input
                  required
                  type="date"
                  value={expenseForm.date}
                  onChange={(event) =>
                    setExpenseForm({ ...expenseForm, date: event.target.value })
                  }
                />
              </Field>
              <Field label="Categoria">
                <input
                  maxLength={120}
                  value={expenseForm.category}
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      category: event.target.value,
                    })
                  }
                  placeholder="Ex.: software, marketing"
                />
              </Field>
            </div>
            <label className="finance-checkbox">
              <input
                type="checkbox"
                checked={expenseForm.paid}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, paid: event.target.checked })
                }
              />
              <span>Despesa efetivamente paga</span>
            </label>
            <p className="muted finance-form-hint">
              Somente despesas pagas entram no saldo líquido de caixa. Ao marcar
              como paga, informe a data real do pagamento.
            </p>
            <Field label="Observações">
              <textarea
                rows={3}
                maxLength={5000}
                value={expenseForm.note}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, note: event.target.value })
                }
              />
            </Field>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Cancelar
              </button>
              <button className="button button-primary" disabled={submitting}>
                {submitting
                  ? "Salvando…"
                  : expenseForm.id
                    ? "Salvar alterações"
                    : "Registrar despesa"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {cancelSale && (
        <Modal title="Cancelar esta venda?" onClose={closeForms}>
          <div className="finance-form">
            <p>
              <strong>{cancelSale.service}</strong> ·{" "}
              {customerName(cancelSale.customerId)}
            </p>
            <p className="muted">
              A venda será marcada como cancelada e o saldo a receber será
              zerado. O registro e os recebimentos permanecem no histórico.
            </p>
            {netReceived(state, cancelSale.id) > 0 && (
              <p className="finance-information">
                Há{" "}
                {money(netReceived(state, cancelSale.id), cancelSale.currency)}{" "}
                recebidos nesta venda. O cancelamento não devolve dinheiro. Se
                ocorrer uma devolução, registre o estorno separadamente na aba
                Recebimentos.
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Manter venda
              </button>
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={async () => {
                  if (
                    await execute(
                      "sale.cancel",
                      { id: cancelSale.id },
                      "Venda cancelada. O histórico foi preservado.",
                    )
                  )
                    setCancelSale(null);
                }}
              >
                {submitting ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteExpense && (
        <Modal title="Excluir esta despesa?" onClose={closeForms}>
          <div className="finance-form">
            <p>
              <strong>{deleteExpense.title}</strong> ·{" "}
              {money(deleteExpense.amountMinor, deleteExpense.currency)}
            </p>
            <p className="muted">
              O registro será removido.{" "}
              {deleteExpense.paid
                ? "Como esta despesa estava paga, sua exclusão recalcula o saldo de caixa. Use esta ação apenas para corrigir um lançamento incorreto."
                : "Uma despesa pendente não altera o saldo de caixa."}
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={submitting}
                onClick={closeForms}
              >
                Manter despesa
              </button>
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={async () => {
                  if (
                    await execute(
                      "expense.delete",
                      { id: deleteExpense.id },
                      "Despesa excluída.",
                    )
                  )
                    setDeleteExpense(null);
                }}
              >
                {submitting ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {detailSale &&
        !saleForm &&
        !receiptForm &&
        !refundForm &&
        !cancelSale && (
          <Modal title="Histórico da venda" onClose={() => setDetailId(null)}>
            <div className="finance-form">
              <div className="finance-detail-header">
                <span className="badge">
                  {detailSale.currency} ·{" "}
                  {detailSale.status === "cancelled" ? "Cancelada" : "Ativa"}
                </span>
                <h3>{detailSale.service}</h3>
                <p className="muted">
                  {customerName(detailSale.customerId)} · Venda em{" "}
                  {displayDate(detailSale.date)}
                </p>
              </div>
              <div className="finance-detail-totals">
                <div>
                  <span>Total vendido</span>
                  <strong>
                    <Money
                      value={detailSale.amountMinor}
                      currency={detailSale.currency}
                    />
                  </strong>
                </div>
                <div>
                  <span>Recebido líquido</span>
                  <strong>
                    <Money
                      value={netReceived(state, detailSale.id)}
                      currency={detailSale.currency}
                    />
                  </strong>
                </div>
                <div>
                  <span>A receber</span>
                  <strong>
                    <Money
                      value={pending(state, detailSale)}
                      currency={detailSale.currency}
                    />
                  </strong>
                </div>
              </div>
              <h4>Parcelas previstas</h4>
              <div className="finance-detail-installments">
                {detailSale.installments.map((installment, index) => (
                  <div key={installment.id}>
                    <span>
                      {index + 1}ª parcela · {displayDate(installment.dueDate)}
                    </span>
                    <Money
                      value={installment.amountMinor}
                      currency={detailSale.currency}
                    />
                  </div>
                ))}
              </div>
              <h4>Movimentações reais</h4>
              {state.receipts.filter(
                (receipt) => receipt.saleId === detailSale.id,
              ).length === 0 ? (
                <p className="muted">
                  Nenhum pagamento registrado. A venda ainda não gerou entrada
                  de caixa.
                </p>
              ) : (
                <div className="finance-movements">
                  {state.receipts
                    .filter((receipt) => receipt.saleId === detailSale.id)
                    .map((receipt) => (
                      <div className="finance-movement" key={receipt.id}>
                        <div>
                          <ArrowDownLeft size={17} />
                          <span>
                            <strong>Recebimento</strong>
                            <small>
                              {displayDate(receipt.date)} · {receipt.method}
                            </small>
                            {receipt.note && <small>{receipt.note}</small>}
                          </span>
                          <strong>
                            <Money
                              value={receipt.amountMinor}
                              currency={detailSale.currency}
                            />
                          </strong>
                        </div>
                        {state.refunds
                          .filter((refund) => refund.receiptId === receipt.id)
                          .map((refund) => (
                            <div
                              className="finance-refund-line"
                              key={refund.id}
                            >
                              <RotateCcw size={14} />
                              <span>
                                Estorno · {displayDate(refund.date)}
                                <small>{refund.note}</small>
                              </span>
                              <strong>
                                −{" "}
                                <Money
                                  value={refund.amountMinor}
                                  currency={detailSale.currency}
                                />
                              </strong>
                            </div>
                          ))}
                        {receipt.amountMinor >
                          refundAmount(state, receipt.id) && (
                          <button
                            className="finance-text-button"
                            onClick={() => openRefund(receipt)}
                          >
                            Registrar estorno deste recebimento
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
              {detailSale.note && (
                <>
                  <h4>Observações</h4>
                  <p className="finance-detail-note">{detailSale.note}</p>
                </>
              )}
              <div className="form-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setDetailId(null)}
                >
                  Fechar
                </button>
                {detailSale.status === "active" && (
                  <>
                    {pending(state, detailSale) > 0 && (
                      <button
                        className="button button-primary"
                        onClick={() => openReceipt(detailSale)}
                      >
                        <CreditCard size={16} />
                        Registrar recebimento
                      </button>
                    )}
                    <button
                      className="button button-secondary"
                      onClick={() => openSale(detailSale)}
                    >
                      <FileText size={16} />
                      Editar venda
                    </button>
                  </>
                )}
              </div>
            </div>
          </Modal>
        )}
    </div>
  );
}
