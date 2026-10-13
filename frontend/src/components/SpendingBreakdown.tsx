import { useEffect, useId, useState } from "react";
import { api, money } from "../api";
import type { Dashboard } from "../types";
import { Empty } from "./UI";

type Flow = { name: string; amount: number; color: string };
type PositionedFlow = Flow & { y: number; height: number };
const incomeColors = ["#427d68", "#6b9b78", "#98ad73", "#78a5a0"];
const expenseColors = ["#bc9260", "#8a91b4", "#b88287", "#7296ac", "#a29771", "#9685af"];

export function SpendingBreakdown({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  const [month, setMonth] = useState(dashboard.month);
  const [report, setReport] = useState<Dashboard | null>(dashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headingId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (month === dashboard.month && currency === dashboard.currency) {
      setReport(dashboard);
      setLoading(false);
    } else {
      setLoading(true);
      api<Dashboard>(`/dashboard?month=${month}&currency=${currency}`, { signal: controller.signal })
        .then(setReport)
        .catch(e => { if (e.name !== "AbortError") setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [month, currency, dashboard]);

  const ready = !loading && !error && report?.month === month && report.currency === currency;
  const data = ready ? report.spending_breakdown : null;
  return <section className="panel spending-breakdown" aria-labelledby={headingId} aria-busy={loading}>
    <div className="section-heading">
      <div><h2 id={headingId}>Spending breakdown</h2><p>Follow your income into the categories that matter.</p></div>
      <span className="tag">{currency}</span>
    </div>
    {error ? <p role="alert" className="alert error">{error}</p>
      : !data ? <p className="loading">Loading spending breakdown...</p>
      : Number(data.earning) || Number(data.spending)
        ? <Sankey data={data} currency={currency} />
        : <Empty title="No cash flow for this month">Import and classify income and expenses to build your spending breakdown.</Empty>}
    <div className="breakdown-period">
      <label htmlFor={`${headingId}-month`}>Month
        <input id={`${headingId}-month`} type="month" value={month} onChange={e => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= "0001-06") setMonth(e.target.value);
        }} />
      </label>
      <span className="muted">{new Date(`${month}-15T12:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</span>
    </div>
    <div className="breakdown-totals">
      <h3>Totals for period</h3>
      <dl>
        <div><dt>Earning</dt><dd>{data ? money(data.earning, currency) : "--"}</dd></div>
        <div><dt>Spending</dt><dd>{data ? money(data.spending, currency) : "--"}</dd></div>
        <div><dt>Difference</dt><dd className={data && Number(data.difference) < 0 ? "negative" : "positive"}>{data ? money(data.difference, currency) : "--"}</dd></div>
        <div><dt>Savings rate</dt><dd>{data ? data.savings_rate === null ? "N/A" : `${data.savings_rate}%` : "--"}</dd></div>
      </dl>
    </div>
    {!!data?.provisional_income_count && <p className="footnote" role="status">
      Includes {data.provisional_income_count} income transactions identified by their CSV categories, awaiting confirmation. These are provisional and may differ from the confirmed-income dashboard totals.
    </p>}
    <p className="footnote">Spending includes expenses and property-loan repayments. Explicit income categories from the CSV are included provisionally until confirmed. Transfers, refunds, excluded transactions and other unreviewed transactions are omitted. The middle band compares income with expenses, not traced account transfers; its width is the smaller total. Any surplus or shortfall appears only in the totals below.</p>
  </section>;
}

function Sankey({ data, currency }: { data: Dashboard["spending_breakdown"]; currency: string }) {
  const id = useId();
  const incoming: Flow[] = data.income_categories.map((c, i) => ({ name: c.name, amount: Number(c.amount), color: incomeColors[i % incomeColors.length] }));
  const outgoing: Flow[] = data.expense_categories.map((c, i) => ({ name: c.name, amount: Number(c.amount), color: expenseColors[i % expenseColors.length] }));
  const earning = Number(data.earning);
  const spending = Number(data.spending);
  const count = Math.max(1, incoming.length, outgoing.length);
  const height = Math.max(340, count * 55 + 80);
  const total = Math.max(earning, spending);
  const gap = 22;
  const scale = (height - 100 - (count - 1) * gap) / total;
  const incomeHeight = earning * scale;
  const expenseHeight = spending * scale;
  const incomeY = (height - incomeHeight) / 2;
  const expenseY = (height - expenseHeight) / 2;
  function position(flows: Flow[]): PositionedFlow[] {
    const used = flows.reduce((sum, flow) => sum + flow.amount * scale, 0) + (flows.length - 1) * gap;
    let cursor = (height - used) / 2;
    return flows.map(flow => {
      const result = { ...flow, y: cursor, height: flow.amount * scale };
      cursor += result.height + gap;
      return result;
    });
  }
  const left = position(incoming);
  const right = position(outgoing);
  function ribbons(flows: PositionedFlow[], incomingSide: boolean) {
    let cursor = incomingSide ? incomeY : expenseY;
    return flows.map((flow, index) => {
      const sourceY = incomingSide ? flow.y : cursor;
      const targetY = incomingSide ? cursor : flow.y;
      const start = incomingSide ? 215 : 600;
      const end = incomingSide ? 380 : 765;
      const mid = (start + end) / 2;
      const width = flow.height;
      cursor += width;
      return <path key={index} className="sankey-ribbon" fill={flow.color} fillOpacity=".28"
        d={`M ${start} ${sourceY} C ${mid} ${sourceY}, ${mid} ${targetY}, ${end} ${targetY} L ${end} ${targetY + width} C ${mid} ${targetY + width}, ${mid} ${sourceY + width}, ${start} ${sourceY + width} Z`}>
        <title>{flow.name}: {money(flow.amount, currency)}</title>
      </path>;
    });
  }
  return <div className="sankey-scroll">
    <svg className="sankey-diagram" viewBox={`0 0 960 ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Income and spending by category</title>
      <desc id={`${id}-description`}>Income categories flow into Income, then Expenses and expense categories. Earning {money(data.earning, currency)}; spending {money(data.spending, currency)}. Band widths are proportional to amounts. The middle comparison band shows the smaller total, not traced transfers.</desc>
      <text className="sankey-caption" x="200" y="22" textAnchor="end">INCOME CATEGORIES</text>
      <text className="sankey-caption" x="780" y="22">EXPENSE CATEGORIES</text>
      {Math.min(earning, spending) > 0 && <path className="sankey-ribbon" fill="#72968b" fillOpacity=".28"
        d={`M 400 ${incomeY} C 480 ${incomeY}, 500 ${expenseY}, 580 ${expenseY} L 580 ${expenseY + Math.min(incomeHeight, expenseHeight)} C 500 ${expenseY + Math.min(incomeHeight, expenseHeight)}, 480 ${incomeY + Math.min(incomeHeight, expenseHeight)}, 400 ${incomeY + Math.min(incomeHeight, expenseHeight)} Z`}>
        <title>Income / expenses comparison: {money(Math.min(earning, spending), currency)}</title>
      </path>}
      {ribbons(left, true)}{ribbons(right, false)}
      {[{ name: "Income", amount: earning, x: 380, y: incomeY, height: incomeHeight, color: "#427262" },
        { name: "Expenses", amount: spending, x: 580, y: expenseY, height: expenseHeight, color: "#bc9260" }].map(node => <g key={node.name}>
        <rect x={node.x} y={node.y} width="20" height={node.height} rx="3" fill={node.color}><title>{node.name}: {money(node.amount, currency)}</title></rect>
        <text x={node.x + 10} y="42" textAnchor="middle" className="sankey-label">{node.name}</text>
        <text x={node.x + 10} y="58" textAnchor="middle" className="sankey-amount">{money(node.amount, currency)}</text>
      </g>)}
      {[...left.map(flow => ({ ...flow, side: "left" })), ...right.map(flow => ({ ...flow, side: "right" }))].map((flow, index) => {
        const isLeft = flow.side === "left";
        const labelY = flow.y + flow.height / 2;
        return <g key={index}>
          <rect x={isLeft ? 200 : 765} y={flow.y} width="15" height={flow.height} fill={flow.color} rx="2" />
          <text x={isLeft ? 188 : 792} y={labelY - 3} textAnchor={isLeft ? "end" : "start"} className="sankey-label">
            {flow.name.length > 27 ? `${flow.name.slice(0, 25)}...` : flow.name}<title>{flow.name}</title>
          </text>
          <text x={isLeft ? 188 : 792} y={labelY + 13} textAnchor={isLeft ? "end" : "start"} className="sankey-amount">{money(flow.amount, currency)}</text>
        </g>;
      })}
    </svg>
  </div>;
}
