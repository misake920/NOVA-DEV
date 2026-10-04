import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowLeft, Maximize2, Minimize2, Plus, Radio } from "lucide-react";
import NeonChart, { type NeonPoint } from "../components/NeonChart";
import { useToast } from "../components/ui";
import { useWorkspace } from "../lib/WorkspaceContext";
import {
  localDate,
  money,
  type Currency,
  type Page,
  type Sale,
} from "../lib/workspace";
import "./live.css";

function LiveAmount({
  value,
  currency,
  paused,
  numeric = false,
  className = "",
}: {
  value: number;
  currency: Currency;
  paused: boolean;
  numeric?: boolean;
  className?: string;
}) {
  const element = useRef<HTMLSpanElement>(null),
    previous = useRef(value),
    previousCurrency = useRef(currency);
  const format = (minor: number) =>
    numeric
      ? new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(minor / 100)
      : money(minor, currency);
  useEffect(() => {
    if (!element.current) return;
    if (
      previousCurrency.current !== currency ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      element.current.textContent = format(value);
      previous.current = value;
      previousCurrency.current = currency;
      return;
    }
    const amount = { value: previous.current };
    const animation = gsap.to(amount, {
      value,
      duration: 0.8,
      ease: "power3.out",
      onUpdate: () => {
        if (element.current)
          element.current.textContent = format(Math.round(amount.value));
      },
    });
    previous.current = value;
    return () => {
      animation.kill();
    };
  }, [value, currency, paused, numeric]);
  return (
    <span className={className} ref={element}>
      {format(value)}
    </span>
  );
}

function hourInZone(date: Date, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

function hourlySeries(
  sales: Sale[],
  day: string,
  timezone: string,
  limit: number,
  currentMinute?: number,
) {
  const values = Array.from({ length: 24 }, () => 0);
  let carried = 0;
  sales.forEach((sale) => {
    const registered = new Date(sale.createdAt),
      hour = hourInZone(registered, timezone);
    if (localDate(timezone, registered) !== day || hour > limit) {
      values[0] += sale.amountMinor;
      carried++;
    } else values[hour] += sale.amountMinor;
  });
  const points: NeonPoint[] = values
    .slice(0, limit + 1)
    .map((value, index) => ({
      value,
      label:
        String(index).padStart(2, "0") +
        ":00 — " +
        (index === limit && currentMinute !== undefined
          ? String(index).padStart(2, "0") +
            ":" +
            String(currentMinute).padStart(2, "0")
          : String(index).padStart(2, "0") + ":59"),
      position:
        (index === limit && currentMinute !== undefined
          ? index + currentMinute / 60
          : index) / 24,
    }));
  if (currentMinute === undefined && points.length)
    points.push({ ...points[points.length - 1], position: 1 });
  return { points, carried };
}

export default function LivePage({
  onAddSale,
  onNavigate,
}: {
  onAddSale: () => void;
  onNavigate?: (page: Page, id?: string) => void;
}) {
  const { state, live, lastSync } = useWorkspace(),
    root = useRef<HTMLDivElement>(null),
    toast = useToast();
  const [fullscreen, setFullscreen] = useState(false),
    [currency, setCurrency] = useState<Currency>(state.profile.currency),
    [clock, setClock] = useState(new Date());
  const timezone = state.profile.timezone,
    paused = state.profile.paused;
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      toast("Seu navegador não conseguiu abrir o modo de tela cheia.");
    }
  };
  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (
      !root.current ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const context = gsap.context(() => {
      gsap.fromTo(
        ".live-reveal",
        { opacity: 0, y: 15 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.07,
          ease: "power3.out",
          clearProps: "opacity,transform",
        },
      );
    }, root);
    return () => context.revert();
  }, [paused]);
  const today = localDate(timezone, clock),
    hour = hourInZone(clock, timezone);
  const minute = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      minute: "2-digit",
    }).format(clock),
  );
  const previousDate = new Date(today + "T12:00:00Z");
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const yesterday = previousDate.toISOString().slice(0, 10);
  const todaySales = useMemo(
    () =>
      state.sales.filter(
        (sale) =>
          sale.status === "active" &&
          sale.currency === currency &&
          sale.date === today,
      ),
    [state.sales, currency, today],
  );
  const yesterdaySales = useMemo(
    () =>
      state.sales.filter(
        (sale) =>
          sale.status === "active" &&
          sale.currency === currency &&
          sale.date === yesterday,
      ),
    [state.sales, currency, yesterday],
  );
  const todayRevenue = todaySales.reduce(
      (sum, sale) => sum + sale.amountMinor,
      0,
    ),
    yesterdayRevenue = yesterdaySales.reduce(
      (sum, sale) => sum + sale.amountMinor,
      0,
    );
  const relevantSaleIds = useMemo(
    () =>
      new Set(
        state.sales.filter((s) => s.currency === currency).map((s) => s.id),
      ),
    [state.sales, currency],
  );
  const receivedToday =
    state.receipts
      .filter((r) => relevantSaleIds.has(r.saleId) && r.date === today)
      .reduce((sum, row) => sum + row.amountMinor, 0) -
    state.refunds
      .filter((r) => relevantSaleIds.has(r.saleId) && r.date === today)
      .reduce((sum, row) => sum + row.amountMinor, 0);
  const expensesToday = state.expenses
    .filter(
      (expense) =>
        expense.currency === currency && expense.paid && expense.date === today,
    )
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const ticket = todaySales.length
    ? Math.round(todayRevenue / todaySales.length)
    : 0;
  const cashProfit = receivedToday - expensesToday;
  const cashMargin =
    receivedToday > 0 ? (cashProfit / receivedToday) * 100 : null;
  const todaySeries = useMemo(
    () => hourlySeries(todaySales, today, timezone, hour, minute),
    [todaySales, today, timezone, hour, minute],
  );
  const yesterdaySeries = useMemo(
    () => hourlySeries(yesterdaySales, yesterday, timezone, 23),
    [yesterdaySales, yesterday, timezone],
  );
  const comparison =
    yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : null;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(clock);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(clock);
  const zoneLabel =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(clock)
      .find((part) => part.type === "timeZoneName")
      ?.value?.replace(
        /GMT([+-])(\d)(?!\d)/,
        (_, sign: string, offset: string) => `GMT${sign}0${offset}`,
      ) || timezone;
  const syncLabel = lastSync
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(lastSync))
    : "—";
  const currencySymbol =
    new Intl.NumberFormat("pt-BR", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value || currency;

  return (
    <div className="ghost-live-page live-reference-layout" ref={root}>
      <header className="live-broadcast-header">
        <div className="live-header-lines" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="live-broadcast-toolbar">
          <button
            className="live-back-button"
            onClick={() => onNavigate?.("dashboard")}
            aria-label="Voltar ao dashboard"
          >
            <ArrowLeft size={26} />
            Voltar à dashboard
          </button>
        </div>
        <div className="live-broadcast-identity live-reveal">
          <div className="live-brand-plaque">
            <svg
              className="live-brand-symbol"
              width="72"
              height="72"
              viewBox="0 0 72 72"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m25 17-16 19 16 16M47 17l16 19-16 16"
                stroke="#ff617f"
                strokeWidth="7"
                strokeLinejoin="miter"
                strokeLinecap="square"
              />
              <path
                d="m45 8-19 56"
                stroke="#ff617f"
                strokeWidth="8"
                strokeLinecap="square"
              />
              <path d="m41 20-9 28" stroke="#ff9aad" strokeWidth="1.5" />
            </svg>
            <span className="live-brand-wordmark">
              <span>THE</span> <em>GHOST</em>
            </span>
            <i />
            <i />
          </div>
          <span className="live-room-label">
            SALA DE RECEITA <i /> {state.profile.name}
          </span>
          <h1>
            Vendas <span>hoje</span>
          </h1>
          <p className="live-calendar-label">
            <span>{dateLabel}</span>
            <i>·</i>
            <time dateTime={clock.toISOString()}>{timeLabel}</time>
            <b>{zoneLabel}</b>
          </p>
        </div>
      </header>

      <main className="live-broadcast-body">
        <section
          className="live-total-plaque live-reveal"
          aria-labelledby="live-total-title"
        >
          <span className="live-edge-diamond is-left" aria-hidden="true" />
          <span className="live-edge-diamond is-right" aria-hidden="true" />
          <div className="live-total-topline">
            <h2 id="live-total-title">FATURAMENTO CONFIRMADO</h2>
            <span>
              <i className={live ? "" : "is-offline"} />
              CM · LIVE 01
            </span>
          </div>
          <div className="live-total-value">
            <span className="live-value-currency">{currencySymbol}</span>
            <LiveAmount
              value={todayRevenue}
              currency={currency}
              numeric
              paused={paused}
            />
          </div>
          <div className="live-total-bottomline">
            <span className={!live ? "is-offline" : ""}>
              <Radio size={25} />
              {live ? "Atualização automática" : "Aguardando reconexão"}
            </span>
            {comparison === null ? (
              <span className="live-no-comparison">
                Sem histórico de ontem para comparar
              </span>
            ) : (
              <span
                className={
                  "live-day-comparison " + (comparison < 0 ? "is-negative" : "")
                }
              >
                <strong>
                  {comparison > 0 ? "+" : ""}
                  {new Intl.NumberFormat("pt-BR", {
                    maximumFractionDigits: 1,
                  }).format(comparison)}
                  %
                </strong>
                <small>vs. ontem</small>
              </span>
            )}
          </div>
          <div className="live-total-underlight" aria-hidden="true" />
        </section>

        <section
          className="live-trend-section live-reveal"
          aria-labelledby="live-trend-title"
        >
          <div className="live-trend-heading">
            <div>
              <span className="live-trend-eyebrow">DESEMPENHO POR HORÁRIO</span>
              <h2 id="live-trend-title">Tendência de vendas</h2>
              <p>Receita confirmada ao longo do dia</p>
            </div>
            <div className="live-chart-legend">
              <span>
                <i />
                Hoje
              </span>
              <span>
                <i />
                <span className="sr-only">Ontem</span>
              </span>
            </div>
          </div>
          <NeonChart
            points={todaySeries.points}
            comparisonPoints={yesterdaySeries.points}
            seriesLabel="Hoje"
            comparisonLabel="Ontem"
            currency={currency}
            paused={paused}
            empty={todaySales.length === 0 && yesterdaySales.length === 0}
            emptyTitle=""
            emptyDescription=""
            ticks={Array.from({ length: 12 }, (_, index) => ({
              label: String(index * 2).padStart(2, "0"),
              position: (index * 2) / 24,
            }))}
            ariaLabel={
              "Vendas reais por hora em " + currency + ", hoje e ontem"
            }
            className="live-large-chart"
          />
        </section>

        <section
          className="live-broadcast-summary live-reveal"
          aria-label="Resumo financeiro de hoje"
        >
          <button onClick={() => onNavigate?.("finance")}>
            <span>VENDAS CONFIRMADAS</span>
            <strong>{String(todaySales.length).padStart(2, "0")}</strong>
            <small>
              {todaySales.length === 1 ? "pedido hoje" : "pedidos hoje"}
            </small>
          </button>
          <button onClick={() => onNavigate?.("finance")}>
            <span>TICKET MÉDIO</span>
            <strong>
              <LiveAmount value={ticket} currency={currency} paused={paused} />
            </strong>
            <small>por projeto</small>
          </button>
          <button onClick={() => onNavigate?.("finance")}>
            <span title="Lucro em regime de caixa: recebimentos líquidos menos despesas pagas.">
              LUCRO DE HOJE
            </span>
            <strong className={cashProfit < 0 ? "is-negative" : ""}>
              <LiveAmount
                value={cashProfit}
                currency={currency}
                paused={paused}
              />
            </strong>
            <small>
              {cashMargin === null
                ? "Sem margem calculável"
                : new Intl.NumberFormat("pt-BR", {
                    maximumFractionDigits: 1,
                  }).format(cashMargin) + "% de margem"}
            </small>
          </button>
        </section>
        <footer className="live-broadcast-footer">
          <span>
            <i />A tela acompanha automaticamente as novas vendas registradas
            por <b>{state.profile.name}</b>
          </span>
        </footer>
        <aside
          className="live-utility-toolbar"
          aria-label="Controles do Ao vivo"
        >
          <div className="live-broadcast-controls">
            <div
              className="live-currency-switch"
              role="group"
              aria-label="Moeda dos indicadores ao vivo"
            >
              {(["BRL", "EUR", "USD"] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={currency === item}
                  className={currency === item ? "is-active" : ""}
                  onClick={() => setCurrency(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {document.fullscreenEnabled && (
              <button
                className="live-fullscreen-button"
                onClick={() => void toggleFullscreen()}
                aria-pressed={fullscreen}
              >
                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span>{fullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
              </button>
            )}
            <button className="live-add-sale" onClick={onAddSale}>
              <Plus size={15} />
              <span>Adicionar venda</span>
            </button>
          </div>
        </aside>
        <div className="live-chart-footnote">
          <span>
            Valores após descontos · {currency} · {timezone}
          </span>
          <span>Última atualização: {syncLabel}</span>
        </div>
        {todaySeries.carried + yesterdaySeries.carried > 0 && (
          <p className="live-carried-note">
            Vendas datadas de hoje ou ontem que foram registradas em outro dia
            entram no horário de abertura, às 00:00.
          </p>
        )}
        <p className="live-accounting-note">
          Lucro em regime de caixa: recebimentos líquidos menos despesas pagas.
          A margem usa esses recebimentos; vendas a prazo entram nesse indicador
          quando recebidas.
        </p>
      </main>
    </div>
  );
}
