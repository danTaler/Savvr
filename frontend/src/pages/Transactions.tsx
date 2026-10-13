import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { api, label, money, transactionKinds } from "../api";
import { Empty } from "../components/UI";
import type { Account, Property, Transaction } from "../types";

export function Transactions({
  accounts,
  properties,
  month,
  currency,
  revision,
  edit,
}: {
  accounts: Account[];
  properties: Property[];
  month: string;
  currency: string;
  revision: number;
  edit: (t: Transaction) => void;
}) {
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState("");
  const [property, setProperty] = useState("");
  const [allDates, setAllDates] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: Transaction[] }>({
    total: 0,
    items: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setPage(1);
  }, [month, currency, search, account, kind, property, allDates]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        search,
        currency,
        page: String(page),
      });
      if (!allDates) query.set("month", month);
      if (account) query.set("account_id", account);
      if (kind) query.set("kind", kind);
      if (property) query.set("property_id", property);
      api<typeof data>(`/transactions?${query}`, { signal: controller.signal })
        .then(setData)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    month,
    currency,
    search,
    account,
    kind,
    property,
    page,
    revision,
    allDates,
  ]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Your transactions</h2>
          <p>
            Review classifications, link rental income, and keep transfers
            separate.
          </p>
        </div>
        <SlidersHorizontal size={20} />
      </div>
      <div className="filters">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search transactions"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by classification"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">All types</option>
          {transactionKinds.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by property"
          value={property}
          onChange={(e) => setProperty(e.target.value)}
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          All dates
        </label>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="loading">Loading transactions...</p>
      ) : !data.items.length ? (
        <Empty title="No transactions in this view">
          Upload a CSV or adjust the date, currency, and account filters.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table className="transaction-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction</th>
                <th>Location</th>
                <th>Account</th>
                <th>Classification</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className={!t.included ? "excluded" : ""}>
                  <td>
                    {new Date(
                      `${t.transaction_date}T12:00:00`,
                    ).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <button
                      className="transaction-description"
                      onClick={() => edit(t)}
                    >
                      {t.description}
                    </button>
                    <small>
                      {t.category}
                      {!t.included ? " / Excluded" : ""}
                    </small>
                  </td>
                  <td>
                    {t.location || "-"}
                  </td>
                  <td>
                    <span>
                      {accounts.find((a) => a.id === t.account_id)?.name}
                    </span>
                    <small>
                      {accounts.find((a) => a.id === t.account_id)?.provider}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`tag ${t.kind === "review" ? "warning" : ""}`}
                    >
                      {t.kind === "review" ? "Needs review" : label(t.kind)}
                    </span>
                    {t.kind === "review" && t.suggestion && (
                      <small>Suggested: {label(t.suggestion)}</small>
                    )}
                  </td>
                  <td
                    className={`right amount ${Number(t.amount) > 0 ? "positive" : ""}`}
                  >
                    {money(t.amount, t.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <span>{data.total} transactions</span>
        <div>
          <button
            className="button secondary"
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(data.total / 50))}
          </span>
          <button
            className="button secondary"
            disabled={page * 50 >= data.total || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
