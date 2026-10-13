import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  House,
  Wallet,
} from "lucide-react";
import { money } from "../api";
import { Empty, PropertyCard } from "../components/UI";
import { SpendingBreakdown } from "../components/SpendingBreakdown";
import type { Dashboard, Page, PropertySummary } from "../types";

export function Overview({
  data: d,
  currency,
  navigate,
  editProperty,
}: {
  data: Dashboard;
  currency: string;
  navigate: (page: Page) => void;
  editProperty: (p: PropertySummary) => void;
}) {
  const maximum = Math.max(
    1,
    ...d.trend.flatMap((point) => [
      Number(point.income),
      Number(point.spending),
    ]),
  );
  const hasTrend = d.trend.some(
    (point) => Number(point.income) || Number(point.spending),
  );
  return (
    <>
      {d.total_transactions === 0 && (
        <div className="welcome-banner">
          <div>
            <span className="eyebrow">A CLEARER PICTURE STARTS HERE</span>
            <h2>Make room for your financial future.</h2>
            <p>
              Bring your accounts, income, and four properties together. Your
              first CSV is all it takes.
            </p>
          </div>
          <button className="button light" onClick={() => navigate("Imports")}>
            Import transactions <ArrowUpRight size={17} />
          </button>
        </div>
      )}
      <div className="stats-grid">
        <Metric
          title="Income received"
          value={money(d.income, currency)}
          detail="Confirmed income this month"
          icon={<ArrowDownLeft size={20} />}
          color="green"
        />
        <Metric
          title="Living & property expenses"
          value={money(d.spending, currency)}
          detail="Excludes transfers and repayments"
          icon={<ArrowUpRight size={20} />}
          color="orange"
        />
        <Metric
          title="Recorded cash flow"
          value={money(d.cash_flow, currency)}
          detail="Income less expenses and repayments"
          icon={<Wallet size={20} />}
          color="purple"
        />
        <Metric
          title="Property loan repayments"
          value={money(d.repayments, currency)}
          detail="Confirmed payments, not interest only"
          icon={<House size={20} />}
          color="blue"
        />
      </div>
      {d.review_count > 0 && (
        <button
          className="review-banner"
          onClick={() => navigate("Transactions")}
        >
          <CircleHelp size={19} />
          <span>
            <strong>{d.review_count} transactions need classification.</strong>{" "}
            Review income and potential transfers to complete your totals.
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <SpendingBreakdown dashboard={d} currency={currency} />
      <div className="analytics-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Your money over time</h2>
              <p>Income and expenses over the last six months</p>
            </div>
            <div className="legend">
              <span>
                <i className="income-dot" /> Income
              </span>
              <span>
                <i className="expense-dot" /> Expenses
              </span>
            </div>
          </div>
          {hasTrend ? (
            <div
              className="chart"
              role="img"
              aria-label="Six-month income and expense comparison"
            >
              <div className="chart-grid">
                <span>{money(maximum, currency)}</span>
                <span>{money(maximum / 2, currency)}</span>
                <span>{money(0, currency)}</span>
              </div>
              <div className="chart-bars">
                {d.trend.map((point) => (
                  <div className="chart-month" key={point.month}>
                    <div
                      className="bar-pair"
                      title={`${point.month}: income ${money(point.income, currency)}, expenses ${money(point.spending, currency)}`}
                    >
                      <div
                        className="bar income-bar"
                        style={{
                          height: `${(Number(point.income) / maximum) * 100}%`,
                        }}
                      />
                      <div
                        className="bar expense-bar"
                        style={{
                          height: `${(Number(point.spending) / maximum) * 100}%`,
                        }}
                      />
                    </div>
                    <span>
                      {new Date(`${point.month}-15`).toLocaleDateString(
                        "en-AU",
                        { month: "short" },
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty title="Your story is taking shape">
              Import and classify transactions to see your monthly trends.
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Where it went</h2>
              <p>Expenses by category</p>
            </div>
          </div>
          {d.categories.length ? (
            <div className="category-list">
              {d.categories.slice(0, 5).map((category, index) => (
                <div key={category.name}>
                  <div className="category-label">
                    <span>
                      <i
                        style={{
                          background: [
                            "#367662",
                            "#c5a576",
                            "#96a8b6",
                            "#b4a0c6",
                            "#bdcf9f",
                          ][index],
                        }}
                      />
                      {category.name}
                    </span>
                    <strong>{money(category.amount, currency)}</strong>
                  </div>
                  <div className="progress">
                    <i
                      style={{
                        width: `${(Number(category.amount) / Math.max(1, Number(d.spending))) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="A place for every expense">
              Your spending categories will appear here.
            </Empty>
          )}
        </section>
      </div>
      <div className="section-heading outside">
        <div>
          <span className="eyebrow">YOUR PROPERTY PORTFOLIO</span>
          <h2>Four properties. One clear view.</h2>
        </div>
        <button
          className="text-button"
          onClick={() => navigate("Properties & loans")}
        >
          Manage properties <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="property-grid">
        {d.properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            currency={currency}
            onClick={() => editProperty(p)}
          />
        ))}
      </div>
      <p className="footnote">
        Figures reflect included, classified transactions in {currency}.
        Unreviewed transactions and refunds are excluded from these summaries.
        Loan balances are entered manually.
      </p>
    </>
  );
}

function Metric({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className="metric">
      <div className="metric-top">
        <span>{title}</span>
        <span className={`metric-icon ${color}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
