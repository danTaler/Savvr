import { Building2, CircleDollarSign, Plus } from "lucide-react";
import { label, money } from "../api";
import type { EditorState } from "../components/Editor";
import { Empty, PropertyCard } from "../components/UI";
import type { Workspace } from "../types";

export function Portfolio({
  workspace: w,
  currency,
  edit,
}: {
  workspace: Workspace;
  currency: string;
  edit: (editor: EditorState) => void;
}) {
  return (
    <>
      <div className="portfolio-banner">
        <span className="property-icon">
          <Building2 size={25} />
        </span>
        <div>
          <h2>A home for your property finances.</h2>
          <p>
            Track rent, operating expenses, and loans without mixing them with
            your everyday spending.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            edit({ type: "loan", propertyId: w.properties[0]?.id })
          }
        >
          <Plus size={17} />
          Link a loan
        </button>
      </div>
      <div className="property-grid">
        {w.dashboard.properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            currency={currency}
            onClick={() => edit({ type: "property", value: p })}
          />
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Loans & offset accounts</h2>
            <p>
              Manually recorded balances, with explicit property allocations
            </p>
          </div>
        </div>
        {w.loans.length ? (
          <div className="loan-list">
            {w.loans.map((loan) => {
              const account = w.accounts.find((a) => a.id === loan.account_id);
              const offset = w.accounts.find(
                (a) => a.id === loan.offset_account_id,
              );
              return (
                <article className="loan-row" key={loan.id}>
                  <span className="bank-icon">
                    <Building2 size={23} />
                  </span>
                  <div className="loan-name">
                    <h3>{loan.name}</h3>
                    <p>
                      {account?.provider} / {account?.name}
                    </p>
                    <small>
                      {loan.allocations
                        .map(
                          (a) =>
                            `${w.properties.find((p) => p.id === a.property_id)?.name} (${Number(a.share)}%)`,
                        )
                        .join(", ")}
                    </small>
                    {offset && <small>Offset: {offset.name}</small>}
                  </div>
                  <div>
                    <small>Recorded balance</small>
                    <strong>{money(loan.balance, account?.currency)}</strong>
                    <small>
                      {loan.balance_as_of
                        ? `As of ${loan.balance_as_of}`
                        : "No balance date"}
                    </small>
                  </div>
                  <div>
                    <small>Annual interest rate</small>
                    <strong>
                      {loan.interest_rate === null
                        ? "Not entered"
                        : `${Number(loan.interest_rate)}%`}
                    </strong>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => edit({ type: "loan", value: loan })}
                  >
                    Edit loan
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Connect your property loans"
            action={
              <button
                className="button secondary"
                onClick={() =>
                  edit({ type: "loan", propertyId: w.properties[0]?.id })
                }
              >
                Link your first loan
              </button>
            }
          >
            Import your loan accounts, then link them to one or more properties.
          </Empty>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Property cash flow</h2>
            <p>Recorded transactions for the selected month in {currency}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Rent received</th>
                <th>Operating expenses</th>
                <th>Loan repayments</th>
                <th>Cash flow</th>
              </tr>
            </thead>
            <tbody>
              {w.dashboard.properties.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(p.rental, currency)}</td>
                  <td>{money(p.expenses, currency)}</td>
                  <td>{money(p.repayments, currency)}</td>
                  <td
                    className={
                      Number(p.cash_flow) < 0 ? "negative" : "positive"
                    }
                  >
                    {money(p.cash_flow, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="footnote">
        Cash flow is not taxable profit. Repayments are not split into principal
        and interest. Assign transactions to properties explicitly; linking a
        loan does not automatically classify transactions.
      </p>
    </>
  );
}

export function Incomes({
  workspace: w,
  currency,
  edit,
}: {
  workspace: Workspace;
  currency: string;
  edit: (editor: EditorState) => void;
}) {
  return (
    <>
      <div className="section-heading outside">
        <div>
          <span className="eyebrow">EVERY INCOME STREAM, TOGETHER</span>
          <h2>Know what is coming in.</h2>
        </div>
        <button
          className="button primary"
          onClick={() => edit({ type: "income" })}
        >
          <Plus size={17} />
          Add income source
        </button>
      </div>
      <div className="income-metrics">
        {["salary", "rental", "other"].map((kind) => {
          const amount =
            kind === "other"
              ? ["interest", "dividend", "other_income"].reduce(
                  (sum, k) => sum + Number(w.dashboard.income_by_kind[k] || 0),
                  0,
                )
              : w.dashboard.income_by_kind[kind];
          return (
            <section className="metric" key={kind}>
              <div className="metric-top">
                <span>{kind === "other" ? "Other income" : label(kind)}</span>
                <CircleDollarSign size={20} />
              </div>
              <strong>{money(amount, currency)}</strong>
              <p>Confirmed receipts this month</p>
            </section>
          );
        })}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Your income sources</h2>
            <p>Expected amounts are kept separate from received income.</p>
          </div>
        </div>
        {w.incomes.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Property</th>
                  <th>Expected / month</th>
                  <th>Received this month</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {w.incomes.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>
                      <span className="tag">{label(source.kind)}</span>
                    </td>
                    <td>
                      {w.properties.find((p) => p.id === source.property_id)
                        ?.name || "-"}
                    </td>
                    <td>{money(source.expected_monthly, source.currency)}</td>
                    <td>
                      {source.currency === currency
                        ? money(
                            w.dashboard.sources.find((s) => s.id === source.id)
                              ?.received || "0",
                            currency,
                          )
                        : `Select ${source.currency} to view`}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => edit({ type: "income", value: source })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Give every income a source"
            action={
              <button
                className="button secondary"
                onClick={() => edit({ type: "income" })}
              >
                Add your first source
              </button>
            }
          >
            Start with your salary and rental properties, then assign imported
            receipts from Transactions.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Credits are not automatically treated as income. Transfers, refunds, and
        loan proceeds need separate classification. Rental receipts reflect
        deposited amounts, not necessarily gross rent.
      </p>
    </>
  );
}

export function Budgets({
  workspace: w,
  currency,
  edit,
  remove,
}: {
  workspace: Workspace;
  currency: string;
  edit: (editor: EditorState) => void;
  remove: (id: number) => void;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>A little intention goes a long way.</h2>
          <p>Monthly category limits based on included expense transactions.</p>
        </div>
        <button
          className="button primary"
          onClick={() => edit({ type: "budget" })}
        >
          <Plus size={17} />
          Set a budget
        </button>
      </div>
      {w.dashboard.budgets.length ? (
        <div className="budget-list">
          {w.dashboard.budgets.map((b) => {
            const used = Number(b.amount)
              ? (Number(b.spent) / Number(b.amount)) * 100
              : Number(b.spent)
                ? 100
                : 0;
            const over = Number(b.spent) > Number(b.amount);
            return (
              <div className="budget-row" key={b.id}>
                <div className="section-heading">
                  <h3>{b.category}</h3>
                  <span>
                    {money(b.spent, currency)}{" "}
                    <small>of {money(b.amount, currency)}</small>
                  </span>
                </div>
                <div className={`progress ${over ? "over" : ""}`}>
                  <i style={{ width: `${Math.min(100, used)}%` }} />
                </div>
                <div className="section-heading">
                  <small className={over ? "negative" : "muted"}>
                    {money(
                      Math.abs(Number(b.amount) - Number(b.spent)),
                      currency,
                    )}{" "}
                    {over ? "over budget" : "remaining"}
                  </small>
                  <button className="text-button" onClick={() => remove(b.id)}>
                    Remove budget
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Plan your month"
          action={
            <button
              className="button secondary"
              onClick={() => edit({ type: "budget" })}
            >
              Create a category budget
            </button>
          }
        >
          Set a limit for a transaction category such as Groceries or Takeaway &
          Snacks.
        </Empty>
      )}
    </section>
  );
}

export function Accounts({ workspace: w }: { workspace: Workspace }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Your connected accounts</h2>
          <p>
            Accounts are created through confirmed CSV imports. No bank
            credentials are stored.
          </p>
        </div>
        <span className="tag">{w.accounts.length} accounts</span>
      </div>
      {w.accounts.length ? (
        <div className="account-grid">
          {w.accounts.map((a) => (
            <article className="account-card" key={a.id}>
              <div className="section-heading">
                <span className="bank-icon">
                  <Building2 size={23} />
                </span>
                <span className="tag">{label(a.kind)}</span>
              </div>
              <p className="eyebrow">{a.provider}</p>
              <h3>{a.name}</h3>
              <p>
                {a.number} / {a.currency}
              </p>
              <small>{a.transaction_count} imported transactions</small>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="All your accounts, one place">
          Import your first CSV to add bank, loan, offset, and credit card
          accounts.
        </Empty>
      )}
      <p className="footnote">
        Transaction exports do not establish current account balances. Account
        names and masked numbers are confirmed during each import.
      </p>
    </section>
  );
}
