import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Plus,
  Radio,
  Radar,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useWorkspace } from "../lib/WorkspaceContext";
import {
  displayDate,
  installmentBalances,
  localDate,
  money,
  pending,
  type Currency,
  type Page,
} from "../lib/workspace";
import { EmptyState, Panel } from "../components/ui";
import "./dashboard.css";

const Globe = lazy(() => import("../components/Globe"));

type CashPoint = { date: string; inflow: number; outflow: number };

function AnimatedValue({
  value,
  currency,
  paused,
}: {
  value: number;
  currency: Currency;
  paused: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value),
    previousCurrency = useRef(currency);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      currency !== previousCurrency.current ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.textContent = money(value, currency);
      previous.current = value;
      previousCurrency.current = currency;
      return;
    }
    const counter = { value: previous.current };
    const tween = gsap.to(counter, {
      value,
      duration: 0.7,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = money(Math.round(counter.value), currency);
      },
    });
    previous.current = value;
    return () => {
      tween.kill();
    };
  }, [value, currency, paused]);
  return <span ref={ref}>{money(value, currency)}</span>;
}

function CashFlowChart({
  points,
  currency,
  paused,
}: {
  points: CashPoint[];
  currency: Currency;
  paused: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const highest = Math.max(
    0,
    ...points.flatMap((point) => [point.inflow, point.outflow]),
  );
  const magnitude = highest ? 10 ** Math.floor(Math.log10(highest)) : 1;
  const ceiling = highest ? Math.ceil(highest / magnitude) * magnitude : 1;
  const hasData = highest > 0;
  const x = (index: number) =>
    64 + (index / Math.max(1, points.length - 1)) * 730;
  const y = (value: number) => 238 - (value / ceiling) * 196;
  const line = (key: "inflow" | "outflow") =>
    points
      .map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point[key])}`)
      .join(" ");
  const selected =
    active === null ? null : points[Math.min(active, points.length - 1)];
  const sumIn = points.reduce((total, point) => total + point.inflow, 0);
  const sumOut = points.reduce((total, point) => total + point.outflow, 0);
  useEffect(() => {
    setActive(null);
  }, [points.length, currency]);
  useEffect(() => {
    if (
      !svg.current ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const context = gsap.context(() => {
      svg.current
        ?.querySelectorAll<SVGPathElement>(".tgd-flow-stroke")
        .forEach((path) => {
          const length = path.getTotalLength();
          gsap.fromTo(
            path,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 1.15, ease: "power3.out" },
          );
        });
      gsap.fromTo(
        ".tgd-flow-area",
        { opacity: 0 },
        { opacity: 1, duration: 1.25, delay: 0.1 },
      );
    }, svg);
    return () => context.revert();
  }, [points, currency, paused]);
  const axisNumber = (minor: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  return (
    <div className="tgd-flow">
      <div className="tgd-flow-summary">
        <div>
          <span>
            {selected ? displayDate(selected.date) : "Recebido no período"}
          </span>
          <strong>{money(selected ? selected.inflow : sumIn, currency)}</strong>
        </div>
        <div className="tgd-flow-legend">
          <span>
            <i />
            Entradas{" "}
            <b>{money(selected ? selected.inflow : sumIn, currency)}</b>
          </span>
          <span>
            <i className="tgd-flow-out-dot" />
            Saídas + estornos{" "}
            <b>{money(selected ? selected.outflow : sumOut, currency)}</b>
          </span>
        </div>
      </div>
      <div className={"tgd-flow-plot" + (!hasData ? " is-empty" : "")}>
        {!hasData && (
          <div className="tgd-flow-empty">
            <span className="tgd-flow-empty-line" />
            <span>Sem movimentação neste período</span>
            <small>
              Os recebimentos e as despesas que você registrar aparecem aqui.
            </small>
          </div>
        )}
        <svg
          ref={svg}
          viewBox="0 0 820 284"
          role="group"
          aria-label={`Fluxo de caixa real em ${currency}, de ${displayDate(points[0].date)} a ${displayDate(points[points.length - 1].date)}`}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const viewX = ((event.clientX - box.left) / box.width) * 820;
            setActive(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(((viewX - 64) / 730) * (points.length - 1)),
                ),
              ),
            );
          }}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff002b" stopOpacity=".48" />
              <stop offset="65%" stopColor="#ff002b" stopOpacity=".16" />
              <stop offset="100%" stopColor="#ff002b" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id={`${uid}-stroke`}
              gradientUnits="userSpaceOnUse"
              x1="64"
              y1="0"
              x2="794"
              y2="0"
            >
              <stop offset="0%" stopColor="#ff002b" />
              <stop offset="55%" stopColor="#ff002b" />
              <stop offset="100%" stopColor="#ff3516" />
            </linearGradient>
            <linearGradient id={`${uid}-zero`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff002b" stopOpacity="0" />
              <stop offset="100%" stopColor="#ff002b" stopOpacity=".18" />
            </linearGradient>
            <filter
              id={`${uid}-glow`}
              filterUnits="userSpaceOnUse"
              x="-100"
              y="-100"
              width="1020"
              height="600"
            >
              <feGaussianBlur stdDeviation="5.5" />
            </filter>
          </defs>
          {!hasData && (
            <rect
              x="64"
              y="42"
              width="730"
              height="196"
              fill={`url(#${uid}-zero)`}
            />
          )}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="64"
                x2="794"
                y1={y(ceiling * ratio)}
                y2={y(ceiling * ratio)}
                stroke="#ff002b"
                strokeOpacity={ratio === 0 ? 0.25 : 0.13}
                strokeDasharray={ratio ? "3 7" : undefined}
              />
              <text
                x="46"
                y={y(ceiling * ratio) + 4}
                textAnchor="end"
                className="tgd-flow-axis"
              >
                {hasData || ratio === 0 ? axisNumber(ceiling * ratio) : ""}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={64 + ratio * 730}
                x2={64 + ratio * 730}
                y1="42"
                y2="238"
                stroke="#ff002b"
                strokeOpacity=".06"
              />
              <text
                x={64 + ratio * 730}
                y="270"
                textAnchor={
                  ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                }
                className="tgd-flow-axis"
              >
                {displayDate(
                  points[Math.round(ratio * (points.length - 1))].date,
                ).slice(0, 5)}
              </text>
            </g>
          ))}
          <path
            className="tgd-flow-area"
            d={`${line("inflow")} L794,238 L64,238 Z`}
            fill={`url(#${uid}-fill)`}
          />
          {hasData && (
            <path
              d={line("outflow")}
              fill="none"
              stroke="#999999"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
          )}
          <path
            d={line("inflow")}
            fill="none"
            stroke="#ff002b"
            strokeWidth="15"
            opacity=".7"
            filter={`url(#${uid}-glow)`}
          />
          <path
            className="tgd-flow-stroke"
            d={line("inflow")}
            fill="none"
            stroke={`url(#${uid}-stroke)`}
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1="35"
                y2="245"
                stroke="#ff002b"
                strokeOpacity=".65"
                strokeDasharray="3 5"
              />
              <circle
                cx={x(active)}
                cy={y(points[active]?.inflow || 0)}
                r="7"
                fill="#ff002b"
                fillOpacity=".16"
                stroke="#ff002b"
              />
              <circle
                cx={x(active)}
                cy={y(points[active]?.inflow || 0)}
                r="3"
                fill="#ffffff"
              />
            </g>
          )}
          {points.map((point, index) => (
            <g
              key={point.date}
              tabIndex={0}
              role="button"
              aria-label={`${displayDate(point.date)}: entradas ${money(point.inflow, currency)}, saídas ${money(point.outflow, currency)}`}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActive(index);
                }
              }}
            >
              <rect
                x={x(index) - 8}
                y="40"
                width="16"
                height="206"
                fill="transparent"
              />
              <title>{`${displayDate(point.date)}\nEntradas ${money(point.inflow, currency)}\nSaídas ${money(point.outflow, currency)}`}</title>
            </g>
          ))}
        </svg>
      </div>
      <div className="tgd-flow-footer">
        <span>{currency} · valores recebidos, despesas pagas e estornos</span>
        <span>
          {hasData
            ? "Passe o cursor para explorar"
            : "Aguardando seus registros"}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard({
  onNavigate,
  onAddSale,
}: {
  onNavigate: (page: Page, id?: string) => void;
  onAddSale: () => void;
}) {
  const { state, live, lastSync } = useWorkspace();
  const [currency, setCurrency] = useState<Currency>(state.profile.currency);
  const [range, setRange] = useState(14);
  const [clock, setClock] = useState(new Date());
  const root = useRef<HTMLDivElement>(null);
  const paused = state.profile.paused;
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setCurrency(state.profile.currency);
  }, [state.profile.currency]);
  useEffect(() => {
    if (
      !root.current ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-tgd-reveal]",
        { y: 20, opacity: 0.3 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.055,
          duration: 0.85,
          ease: "power3.out",
          clearProps: "transform,opacity",
        },
      );
    }, root);
    return () => context.revert();
  }, [paused]);
  const timezone = state.profile.timezone;
  const today = localDate(timezone, clock);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(clock),
  );
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(clock);
  const clockLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(clock);
  const sales = state.sales.filter(
    (sale) => sale.currency === currency && sale.status === "active",
  );
  const saleIds = new Set(
    state.sales
      .filter((sale) => sale.currency === currency)
      .map((sale) => sale.id),
  );
  const receipts = state.receipts.filter((receipt) =>
    saleIds.has(receipt.saleId),
  );
  const refunds = state.refunds.filter((refund) => saleIds.has(refund.saleId));
  const todaySales = sales.filter((sale) => sale.date === today);
  const soldToday = todaySales.reduce((sum, sale) => sum + sale.amountMinor, 0);
  const receivedToday =
    receipts
      .filter((receipt) => receipt.date === today)
      .reduce((sum, receipt) => sum + receipt.amountMinor, 0) -
    refunds
      .filter((refund) => refund.date === today)
      .reduce((sum, refund) => sum + refund.amountMinor, 0);
  const outstanding = sales.reduce(
    (sum, sale) => sum + pending(state, sale),
    0,
  );
  const expensesToday = state.expenses
    .filter(
      (expense) =>
        expense.currency === currency && expense.paid && expense.date === today,
    )
    .reduce((sum, expense) => sum + expense.amountMinor, 0);
  const overdue = sales.filter(
    (sale) =>
      pending(state, sale) > 0 &&
      installmentBalances(state, sale).some(
        (installment) => installment.balance > 0 && installment.dueDate < today,
      ),
  );
  const openStages = new Set(
    state.stages
      .filter((stage) => stage.kind === "open")
      .map((stage) => stage.id),
  );
  const openOpportunities = state.opportunities.filter((opportunity) =>
    openStages.has(opportunity.stageId),
  );
  const tasks = [...state.tasks.filter((task) => !task.done)].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  const dueTasks = tasks.filter((task) => task.dueDate <= today);
  const won = state.opportunities.filter(
    (opportunity) =>
      state.stages.find((stage) => stage.id === opportunity.stageId)?.kind ===
      "won",
  ).length;
  const lost = state.opportunities.filter(
    (opportunity) =>
      state.stages.find((stage) => stage.id === opportunity.stageId)?.kind ===
      "lost",
  ).length;
  const points = useMemo(
    () =>
      Array.from({ length: range }, (_, index) => {
        const date = new Date(today + "T12:00:00Z");
        date.setUTCDate(date.getUTCDate() - range + index + 1);
        const key = date.toISOString().slice(0, 10);
        return {
          date: key,
          inflow: receipts
            .filter((receipt) => receipt.date === key)
            .reduce((sum, receipt) => sum + receipt.amountMinor, 0),
          outflow:
            state.expenses
              .filter(
                (expense) =>
                  expense.currency === currency &&
                  expense.paid &&
                  expense.date === key,
              )
              .reduce((sum, expense) => sum + expense.amountMinor, 0) +
            refunds
              .filter((refund) => refund.date === key)
              .reduce((sum, refund) => sum + refund.amountMinor, 0),
        };
      }),
    [state.version, today, range, currency],
  );
  const serviceTotals = sales
    .filter((sale) => sale.date >= points[0].date && sale.date <= today)
    .reduce<Record<string, number>>((totals, sale) => {
      totals[sale.service] = (totals[sale.service] || 0) + sale.amountMinor;
      return totals;
    }, {});
  const serviceEntries = Object.entries(serviceTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const metrics = [
    {
      title: "Recebido hoje",
      value: receivedToday,
      note: "Recebimentos menos estornos",
      icon: ArrowDownLeft,
    },
    {
      title: "A receber",
      value: outstanding,
      note: overdue.length
        ? `${overdue.length} venda(s) com atraso`
        : "Saldo pendente de todas as vendas",
      icon: CreditCard,
    },
    {
      title: "Caixa do dia",
      value: receivedToday - expensesToday,
      note: "Entradas menos despesas pagas",
      icon: Wallet,
    },
  ];
  return (
    <div className="tgd-dashboard" ref={root}>
      <section className="tgd-hero" data-tgd-reveal>
        <div className="tgd-hero-copy">
          <span className="tgd-kicker">
            <span />
            CENTRO DE COMANDO
          </span>
          <h1>
            {greeting},<br />
            <span>{state.profile.name.trim().split(" ")[0] || "Ghost"}.</span>
          </h1>
          <p>
            Sua próxima conquista
            <br />
            começa com um movimento.
          </p>
          <div className="tgd-hero-date">
            <CalendarClock size={15} />
            <span>{dateLabel}</span>
            <time dateTime={clock.toISOString()}>{clockLabel}</time>
          </div>
          <div className="tgd-hero-actions">
            <button className="button button-primary" onClick={onAddSale}>
              <Plus size={17} />
              Adicionar venda
              <ArrowUpRight size={16} />
            </button>
            <button
              className="button button-secondary"
              onClick={() => onNavigate("prospecting")}
            >
              <Radar size={17} />
              Prospectar
            </button>
          </div>
        </div>
        <div className="tgd-hero-globe">
          <span className="tgd-globe-coordinate tgd-globe-coordinate-top">
            GHOST NETWORK / 3D
          </span>
          <Suspense
            fallback={
              <div className="tgd-globe-loading">
                <span />
                <small>Carregando o globo</small>
              </div>
            }
          >
            <Globe country="BR" paused={paused} compact />
          </Suspense>
          <button
            className="tgd-globe-link"
            onClick={() => onNavigate("prospecting")}
          >
            Explore seus próximos mercados
            <ArrowUpRight size={13} />
          </button>
        </div>
        <span className="tgd-hero-index" aria-hidden="true">
          01 / OVERVIEW
        </span>
      </section>
      <div className="tgd-overview-heading" data-tgd-reveal>
        <div>
          <span className="tgd-kicker">VISÃO FINANCEIRA</span>
          <h2>Hoje, cada movimento conta.</h2>
        </div>
        <div className="tgd-overview-controls">
          <span className={"tgd-sync-status" + (!live ? " offline" : "")}>
            <i />
            {live ? "Sincronizado · 5s" : "Reconectando"}
            <span className="sr-only">
              Última atualização{" "}
              {lastSync
                ? new Date(lastSync).toLocaleTimeString("pt-BR", {
                    timeZone: timezone,
                  })
                : "indisponível"}
            </span>
          </span>
          <label className="sr-only" htmlFor="dashboard-currency">
            Moeda do dashboard
          </label>
          <select
            id="dashboard-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
          >
            <option>BRL</option>
            <option>EUR</option>
            <option>USD</option>
          </select>
        </div>
      </div>
      <div className="tgd-finance-strip" data-tgd-reveal>
        <button className="tgd-revenue-card" onClick={() => onNavigate("live")}>
          <span className="tgd-metric-title">
            <CircleDollarSign size={18} />
            Faturado hoje
            <ArrowUpRight size={15} />
          </span>
          <strong>
            <AnimatedValue
              value={soldToday}
              currency={currency}
              paused={paused}
            />
          </strong>
          <span className="tgd-revenue-footer">
            <span>
              {todaySales.length}{" "}
              {todaySales.length === 1
                ? "venda registrada"
                : "vendas registradas"}{" "}
              · {displayDate(today)}
            </span>
            <span>
              <Radio size={13} />
              AO VIVO
            </span>
          </span>
        </button>
        <div className="tgd-support-metrics">
          {metrics.map((metric) => (
            <button
              className="tgd-support-metric"
              key={metric.title}
              onClick={() => onNavigate("finance")}
            >
              <span className="tgd-metric-title">
                <metric.icon size={15} />
                {metric.title}
                <ArrowUpRight size={13} />
              </span>
              <strong>
                <AnimatedValue
                  value={metric.value}
                  currency={currency}
                  paused={paused}
                />
              </strong>
              <small>{metric.note}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="tgd-main-grid">
        <Panel
          className="tgd-cash-panel"
          title="Fluxo de caixa"
          action={
            <div className="tgd-chart-controls">
              <select
                aria-label="Período do fluxo de caixa"
                value={range}
                onChange={(event) => setRange(Number(event.target.value))}
              >
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </select>
              <button
                className="icon-button"
                aria-label="Abrir financeiro"
                onClick={() => onNavigate("finance")}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
          }
        >
          <CashFlowChart points={points} currency={currency} paused={paused} />
        </Panel>
        <Panel
          className="tgd-pipeline-panel"
          title="Seu funil"
          action={
            <button
              className="icon-button"
              aria-label="Abrir funil de vendas"
              onClick={() => onNavigate("pipeline")}
            >
              <ArrowUpRight size={18} />
            </button>
          }
        >
          <div className="tgd-pipeline-total">
            <strong>{openOpportunities.length}</strong>
            <div>
              <span>
                oportunidades
                <br />
                em movimento
              </span>
              <small>
                {won + lost
                  ? `${Math.round((won / (won + lost)) * 100)}% de conversão entre encerradas`
                  : "Sem oportunidades encerradas"}
              </small>
            </div>
          </div>
          <div className="tgd-stage-list">
            {[...state.stages]
              .sort((a, b) => a.order - b.order)
              .map((stage, index) => {
                const count = state.opportunities.filter(
                  (opportunity) => opportunity.stageId === stage.id,
                ).length;
                return (
                  <button key={stage.id} onClick={() => onNavigate("pipeline")}>
                    <span className="tgd-stage-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="tgd-stage-content">
                      <span>
                        {stage.name}
                        <b>{count}</b>
                      </span>
                      <i>
                        <em
                          style={{
                            width: state.opportunities.length
                              ? `${(count / state.opportunities.length) * 100}%`
                              : "0%",
                          }}
                        />
                      </i>
                    </span>
                  </button>
                );
              })}
          </div>
          <div className="tgd-small-stat">
            <span>Propostas enviadas</span>
            <b>
              {
                state.proposals.filter((proposal) => proposal.status === "sent")
                  .length
              }
            </b>
          </div>
        </Panel>
      </div>
      <button className="tgd-live-banner" onClick={() => onNavigate("live")}>
        <span className="tgd-live-banner-icon">
          <Radio size={23} />
        </span>
        <span>
          <b>Seu faturamento. Em tela cheia.</b>
          <small>Acompanhe as vendas de hoje no centro ao vivo.</small>
        </span>
        <span className="tgd-live-banner-cta">
          Abrir ao vivo
          <ArrowUpRight size={17} />
        </span>
      </button>
      <div className="tgd-detail-grid">
        <Panel
          className="tgd-agenda-panel"
          title="Próximos movimentos"
          action={
            <span className="tgd-count-label">{dueTasks.length} para hoje</span>
          }
        >
          {tasks.length ? (
            <div className="tgd-priority-list">
              {tasks.slice(0, 4).map((task) => (
                <button
                  key={task.id}
                  onClick={() => onNavigate("agenda", task.id)}
                >
                  <span className="tgd-priority-icon">
                    <CalendarClock size={17} />
                  </span>
                  <span>
                    <b>{task.title}</b>
                    <small>
                      {task.dueDate < today
                        ? "Prazo vencido · "
                        : task.dueDate === today
                          ? "Hoje · "
                          : ""}
                      {displayDate(task.dueDate)}
                      {task.owner ? ` · ${task.owner}` : ""}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="Abra espaço para o próximo passo"
              description="Crie lembretes para seus contatos, propostas e follow-ups."
              action={
                <button
                  className="text-button"
                  onClick={() => onNavigate("agenda")}
                >
                  Criar tarefa
                  <Plus size={14} />
                </button>
              }
            />
          )}
        </Panel>
        <Panel
          className="tgd-service-panel"
          title="Vendas por serviço"
          action={
            <span className="tgd-count-label">
              {range} dias · {currency}
            </span>
          }
        >
          {serviceEntries.length ? (
            <div className="tgd-service-list">
              {serviceEntries.map(([name, value]) => (
                <button key={name} onClick={() => onNavigate("finance")}>
                  <span>
                    {name || "Serviço"}
                    <b>{money(value, currency)}</b>
                  </span>
                  <i>
                    <em
                      style={{
                        width: serviceEntries[0][1]
                          ? `${(value / serviceEntries[0][1]) * 100}%`
                          : "0%",
                      }}
                    />
                  </i>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Seu trabalho ganha valor aqui"
              description="Os serviços vendidos aparecem conforme você registra suas vendas."
              action={
                <button className="text-button" onClick={onAddSale}>
                  Adicionar venda
                  <Plus size={14} />
                </button>
              }
            />
          )}
        </Panel>
        <Panel
          className="tgd-activity-panel"
          title="Rastro de atividade"
          action={
            <span className="tgd-mini-live">
              <i />
              {live ? "AO VIVO" : "OFFLINE"}
            </span>
          }
        >
          {state.activities.length ? (
            <div className="tgd-activity-list">
              {[...state.activities]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 5)
                .map((activity) => (
                  <div key={activity.id}>
                    <span />
                    <div>
                      <b>{activity.title}</b>
                      <small>
                        {new Intl.DateTimeFormat("pt-BR", {
                          timeZone: timezone,
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(activity.createdAt))}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              icon={Radar}
              title="Sua operação deixa um rastro"
              description="Contatos, tarefas e vendas registrados formam seu histórico."
            />
          )}
        </Panel>
      </div>
      {state.goals.length > 0 && (
        <Panel
          className="tgd-goals-panel"
          title="Metas em foco"
          action={
            <button
              className="text-button"
              onClick={() => onNavigate("settings")}
            >
              Gerenciar
              <ArrowUpRight size={14} />
            </button>
          }
        >
          <div className="tgd-goals-grid">
            {state.goals.map((goal) => {
              const ids = new Set(
                state.sales
                  .filter((sale) => sale.currency === goal.currency)
                  .map((sale) => sale.id),
              );
              const current =
                goal.kind === "sales"
                  ? state.sales
                      .filter(
                        (sale) =>
                          sale.currency === goal.currency &&
                          sale.status === "active" &&
                          sale.date >= goal.startDate &&
                          sale.date <= goal.endDate,
                      )
                      .reduce((sum, sale) => sum + sale.amountMinor, 0)
                  : goal.kind === "receipts"
                    ? state.receipts
                        .filter(
                          (receipt) =>
                            ids.has(receipt.saleId) &&
                            receipt.date >= goal.startDate &&
                            receipt.date <= goal.endDate,
                        )
                        .reduce(
                          (sum, receipt) => sum + receipt.amountMinor,
                          0,
                        ) -
                      state.refunds
                        .filter(
                          (refund) =>
                            ids.has(refund.saleId) &&
                            refund.date >= goal.startDate &&
                            refund.date <= goal.endDate,
                        )
                        .reduce((sum, refund) => sum + refund.amountMinor, 0)
                    : state.activities.filter(
                        (activity) =>
                          localDate(timezone, new Date(activity.createdAt)) >=
                            goal.startDate &&
                          localDate(timezone, new Date(activity.createdAt)) <=
                            goal.endDate,
                      ).length;
              const ratio = goal.target
                ? Math.max(0, Math.min(100, (current / goal.target) * 100))
                : 0;
              return (
                <button
                  className="tgd-goal-card"
                  key={goal.id}
                  onClick={() => onNavigate("settings")}
                >
                  <Target size={20} />
                  <b>{goal.name}</b>
                  <span>
                    {goal.kind === "activities"
                      ? `${current} / ${goal.target}`
                      : `${money(current, goal.currency)} / ${money(goal.target, goal.currency)}`}
                  </span>
                  <progress value={ratio} max={100} />
                  <small>
                    {Math.round(ratio)}% · até {displayDate(goal.endDate)}
                  </small>
                </button>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
