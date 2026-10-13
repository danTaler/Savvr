import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Building2,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PieChart,
  Plus,
  ShieldCheck,
  Sun,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { api } from "./api";
import { Editor, type EditorState } from "./components/Editor";
import { Overview } from "./pages/Overview";
import { Imports } from "./pages/Imports";
import { Transactions } from "./pages/Transactions";
import { Accounts, Budgets, Incomes, Portfolio } from "./pages/Portfolio";
import type {
  Account,
  Batch,
  Dashboard,
  Income,
  Loan,
  Page,
  Property,
  Transaction,
  Workspace,
} from "./types";

const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Transactions", icon: ListFilter },
  { name: "Properties & loans", icon: Building2 },
  { name: "Income", icon: CircleDollarSign },
  { name: "Budgets", icon: PieChart },
  { name: "Accounts", icon: Wallet },
  { name: "Imports", icon: ArrowDownToLine },
] as const;
const subtitles: Record<Page, string> = {
  Overview: "A little clarity for your everyday, and everything ahead.",
  Transactions: "The details that bring your bigger picture together.",
  "Properties & loans": "Your portfolio, grounded in real numbers.",
  Income: "From your day job to your investments.",
  Budgets: "Make a plan that leaves room for living.",
  Accounts: "All your banks and credit cards, in one place.",
  Imports: "Fresh transactions. A clearer perspective.",
};

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>("Overview");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [currency, setCurrency] = useState("AUD");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("hearth-theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("hearth-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    api("/session")
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false));
    const expired = () => {
      setAuthenticated(false);
      setWorkspace(null);
      setEditor(null);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const options = { signal };
      const [accounts, properties, loans, incomes, imports, dashboard] =
        await Promise.all([
          api<Account[]>("/accounts", options),
          api<Property[]>("/properties", options),
          api<Loan[]>("/loans", options),
          api<Income[]>("/incomes", options),
          api<Batch[]>("/imports", options),
          api<Dashboard>(
            `/dashboard?month=${month}&currency=${currency}`,
            options,
          ),
        ]);
      if (!signal?.aborted)
        setWorkspace({
          accounts,
          properties,
          loans,
          incomes,
          imports,
          dashboard,
        });
    },
    [month, currency],
  );

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    load(controller.signal)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authenticated, load]);

  async function refresh() {
    await load();
    setRevision((r) => r + 1);
  }
  function navigate(next: Page) {
    setPage(next);
    setMobileMenu(false);
    setError("");
    window.scrollTo({ top: 0 });
  }
  async function editTransaction(t: Transaction) {
    try {
      setEditor({
        type: "transaction",
        value: await api(`/transactions/${t.id}`),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeBudget(id: number) {
    if (
      !window.confirm(
        "Remove this monthly budget? Transactions will not be changed.",
      )
    )
      return;
    try {
      await api(`/budgets/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setWorkspace(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (authenticated === null)
    return (
      <div className="app-loading">
        <span className="brand-mark">
          <Plus />
        </span>
        <p>Opening your workspace...</p>
      </div>
    );
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">
            <Plus size={28} />
          </span>
          hearth<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>Personal workspace</strong>
            <small>Your financial home</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => navigate(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Properties & loans" && <small>4</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={23} />
            <strong>Private by design</strong>
            <p>
              Your records stay in your own database. No bank connection
              required.
            </p>
          </div>
          <button onClick={() => void logout()}>
            <LogOut size={17} />
            Sign out
          </button>
          <span className="sidebar-version">Hearth / Personal edition</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-toggle"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <PanelLeftClose size={18} className="desktop-panel-icon" />
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{page}</strong>
            </span>
          </div>
          <div>
            <span className="local-indicator">
              <i />
              Local-first workspace
            </span>
            <button
              className="icon-button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="user-avatar">P</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR MONEY, IN PERSPECTIVE</span>
              <h1>{page === "Overview" ? "Your financial overview" : page}</h1>
              <p>{subtitles[page]}</p>
            </div>
            <button
              className="button primary"
              onClick={() => navigate("Imports")}
            >
              <Upload size={17} />
              Import CSV
            </button>
          </div>
          <div className="period-toolbar">
            <div className="period-inputs">
              <label>
                <span>Period</span>
                <input
                  type="month"
                  aria-label="Reporting month"
                  value={month}
                  onChange={(e) => {
                    if (
                      /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                      e.target.value >= "0001-06"
                    )
                      setMonth(e.target.value);
                  }}
                />
              </label>
              <label>
                <span>Currency</span>
                <select
                  aria-label="Reporting currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {[
                    ...new Set([
                      currency,
                      ...(workspace?.dashboard.currencies || ["AUD"]),
                      ...(workspace?.incomes.map((i) => i.currency) || []),
                    ]),
                  ]
                    .sort()
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </label>
            </div>
            <span className="muted">
              {workspace?.dashboard.account_count || 0} accounts /{" "}
              {workspace?.dashboard.transaction_count || 0} transactions this
              month
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                Retry
              </button>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading || !workspace ? (
            <p className="loading">Loading your financial picture...</p>
          ) : (
            <>
              {page === "Overview" && (
                <Overview
                  data={workspace.dashboard}
                  currency={currency}
                  navigate={navigate}
                  editProperty={(p) =>
                    setEditor({ type: "property", value: p })
                  }
                />
              )}
              {page === "Imports" && (
                <Imports
                  accounts={workspace.accounts}
                  batches={workspace.imports}
                  refresh={refresh}
                />
              )}
              {page === "Transactions" && (
                <Transactions
                  accounts={workspace.accounts}
                  properties={workspace.properties}
                  month={month}
                  currency={currency}
                  revision={revision}
                  edit={(t) => void editTransaction(t)}
                />
              )}
              {page === "Properties & loans" && (
                <Portfolio
                  workspace={workspace}
                  currency={currency}
                  edit={setEditor}
                />
              )}
              {page === "Income" && (
                <Incomes
                  workspace={workspace}
                  currency={currency}
                  edit={setEditor}
                />
              )}
              {page === "Budgets" && (
                <Budgets
                  workspace={workspace}
                  currency={currency}
                  edit={setEditor}
                  remove={(id) => void removeBudget(id)}
                />
              )}
              {page === "Accounts" && <Accounts workspace={workspace} />}
            </>
          )}
          <footer className="page-footer">
            <span>Built for a clearer financial picture.</span>
            <span>Hearth Budget / v0.1</span>
          </footer>
        </div>
      </main>
      {editor && workspace && (
        <Editor
          editor={editor}
          workspace={workspace}
          month={month}
          currency={currency}
          close={() => setEditor(null)}
          saved={refresh}
        />
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Plus size={28} />
          </span>
          hearth.
        </div>
        <div>
          <span className="eyebrow">YOUR MONEY, IN PERSPECTIVE</span>
          <h1>
            A clearer picture.
            <br />A little more peace of mind.
          </h1>
          <p>
            Your everyday budget, income, and property portfolio. Together in
            one private place.
          </p>
          <div className="login-features">
            <span>
              <Wallet size={19} />
              Every account
            </span>
            <span>
              <Building2 size={19} />
              Every property
            </span>
            <span>
              <ShieldCheck size={19} />
              Your own data
            </span>
          </div>
        </div>
        <small>Your financial home starts here.</small>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={login}>
          <span className="eyebrow">WELCOME HOME</span>
          <h2>Open your workspace</h2>
          <p>Sign in to your personal financial overview.</p>
          <label className="field">
            <span>Workspace password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <p className="login-note">
            <ShieldCheck size={16} />
            Protected access to your local records.
          </p>
        </form>
      </div>
    </div>
  );
}
