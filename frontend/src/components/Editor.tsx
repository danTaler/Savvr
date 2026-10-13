import { useState, type FormEvent, type ReactNode } from "react";
import { api, incomeKinds, label, money, transactionKinds } from "../api";
import type { Income, Loan, Property, Transaction, Workspace } from "../types";
import { Field, FormFooter, Modal } from "./UI";

export type EditorState =
  | { type: "property"; value: Property }
  | { type: "income"; value?: Income }
  | { type: "loan"; value?: Loan; propertyId?: number }
  | { type: "transaction"; value: Transaction }
  | { type: "budget" };

export function Editor({
  editor,
  workspace: w,
  month,
  currency,
  close,
  saved,
}: {
  editor: EditorState;
  workspace: Workspace;
  month: string;
  currency: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await saved();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = {
    property: "Property details",
    income: "Income source",
    loan: "Property loan",
    transaction: "Review transaction",
    budget: "Monthly category budget",
  }[editor.type];
  const form = (children: ReactNode, action: (data: FormData) => void) => (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        action(new FormData(e.currentTarget));
      }}
    >
      {children}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <FormFooter busy={busy} onClose={close} />
    </form>
  );
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) close();
      }}
    >
      {editor.type === "property" &&
        form(
          <>
            <Field label="Property name">
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={editor.value.name}
              />
            </Field>
            <Field label="Address">
              <input
                name="address"
                maxLength={300}
                defaultValue={editor.value.address}
                placeholder="Add an address (optional)"
              />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                maxLength={1000}
                defaultValue={editor.value.notes}
                placeholder="Ownership, rental details, or reminders"
              />
            </Field>
            <p className="notice">
              Link loans on the Properties & loans page. Assign rental receipts
              and expenses from Transactions.
            </p>
          </>,
          (data) =>
            void submit(
              `/properties/${editor.value.id}`,
              Object.fromEntries(data),
              "PUT",
            ),
        )}
      {editor.type === "income" && (
        <IncomeForm
          value={editor.value}
          workspace={w}
          form={form}
          submit={submit}
          currency={currency}
        />
      )}
      {editor.type === "loan" &&
        form(
          <>
            <p className="notice">
              Balances and rates are entered manually, not inferred from
              repayments. For shared loans, allocations must total 100%.
            </p>
            <Field label="Loan name">
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={editor.value?.name}
                placeholder="e.g. Investment home loan"
              />
            </Field>
            <Field label="Loan account">
              <select
                name="account_id"
                required
                defaultValue={editor.value?.account_id ?? ""}
              >
                <option value="">Choose an imported loan account</option>
                {w.accounts
                  .filter((a) => a.kind !== "credit_card")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.provider} / {a.name} / {a.number}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Offset account (optional)">
              <select
                name="offset_account_id"
                defaultValue={editor.value?.offset_account_id ?? ""}
              >
                <option value="">No offset account</option>
                {w.accounts
                  .filter((a) => !["loan", "credit_card"].includes(a.kind))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} / {a.number}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Outstanding balance">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="balance"
                  defaultValue={editor.value?.balance ?? ""}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Balance as of">
                <input
                  type="date"
                  name="balance_as_of"
                  defaultValue={editor.value?.balance_as_of ?? ""}
                />
              </Field>
            </div>
            <Field label="Annual interest rate (%)">
              <input
                type="number"
                min="0"
                max="100"
                step="0.0001"
                name="interest_rate"
                defaultValue={editor.value?.interest_rate ?? ""}
                placeholder="Optional"
              />
            </Field>
            <h3>Property allocations</h3>
            <div className="allocation-list">
              {w.properties.map((p) => (
                <Field key={p.id} label={`${p.name} (%)`}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    name={`share_${p.id}`}
                    defaultValue={
                      editor.value?.allocations.find(
                        (a) => a.property_id === p.id,
                      )?.share ?? (editor.propertyId === p.id ? 100 : 0)
                    }
                  />
                </Field>
              ))}
            </div>
          </>,
          (data) =>
            void submit(
              editor.value ? `/loans/${editor.value.id}` : "/loans",
              {
                name: data.get("name"),
                account_id: Number(data.get("account_id")),
                offset_account_id: optionalId(data.get("offset_account_id")),
                balance: data.get("balance") || null,
                balance_as_of: data.get("balance_as_of") || null,
                interest_rate: data.get("interest_rate") || null,
                allocations: w.properties
                  .map((p) => ({
                    property_id: p.id,
                    share: data.get(`share_${p.id}`) || "0",
                  }))
                  .filter((a) => Number(a.share) > 0),
              },
              editor.value ? "PUT" : "POST",
            ),
        )}
      {editor.type === "transaction" && (
        <TransactionForm
          value={editor.value}
          workspace={w}
          form={form}
          submit={submit}
        />
      )}
      {editor.type === "budget" &&
        form(
          <>
            <p className="notice">
              Set a spending limit for {month} in {currency}. Saving an existing
              category updates its limit.
            </p>
            <Field label="Category">
              <input
                name="category"
                required
                maxLength={160}
                list="category-options"
                placeholder="Use the exact transaction category"
              />
              <datalist id="category-options">
                {w.dashboard.categories.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label={`Monthly limit (${currency})`}>
              <input name="amount" type="number" min="0" step="0.01" required />
            </Field>
          </>,
          (data) =>
            void submit("/budgets", {
              ...Object.fromEntries(data),
              month,
              currency,
            }),
        )}
    </Modal>
  );
}

type FormProps = {
  form: (children: ReactNode, action: (data: FormData) => void) => ReactNode;
  submit: (path: string, body: unknown, method?: string) => Promise<void>;
  workspace: Workspace;
};
function IncomeForm({
  value,
  workspace,
  form,
  submit,
  currency,
}: FormProps & { value?: Income; currency: string }) {
  const [kind, setKind] = useState(value?.kind || "salary");
  return form(
    <>
      <Field label="Source name">
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={value?.name}
          placeholder="Employer or rental source"
        />
      </Field>
      <Field label="Income type">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {incomeKinds.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={
          kind === "rental" ? "Property (required)" : "Property (optional)"
        }
      >
        <select
          name="property_id"
          required={kind === "rental"}
          defaultValue={value?.property_id ?? ""}
        >
          <option value="">No property</option>
          {workspace.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Currency">
          <input
            name="currency"
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            defaultValue={value?.currency || currency}
          />
        </Field>
        <Field label="Expected monthly amount">
          <input
            name="expected_monthly"
            type="number"
            min="0"
            step="0.01"
            defaultValue={value?.expected_monthly ?? ""}
            placeholder="Optional"
          />
        </Field>
      </div>
      <p className="notice">
        Expected amounts are planning figures. Actual income is counted only
        when an imported receipt is assigned to this source. Rental deposits may
        be net of agent fees.
      </p>
    </>,
    (data) =>
      void submit(
        value ? `/incomes/${value.id}` : "/incomes",
        {
          ...Object.fromEntries(data),
          property_id: optionalId(data.get("property_id")),
          expected_monthly: data.get("expected_monthly") || null,
        },
        value ? "PUT" : "POST",
      ),
  );
}

function TransactionForm({
  value: t,
  workspace: w,
  form,
  submit,
}: FormProps & { value: Transaction }) {
  const [kind, setKind] = useState(t.kind);
  const [source, setSource] = useState(String(t.income_source_id || ""));
  const isIncome = incomeKinds.includes(kind);
  const selectedSource = w.incomes.find((s) => String(s.id) === source);
  return form(
    <>
      <div className="transaction-summary">
        <h3>{t.description}</h3>
        <strong>{money(t.amount, t.currency)}</strong>
        <p>
          {t.transaction_date} / ID {t.external_id}
        </p>
      </div>
      {t.suggestion && (
        <p className="notice">
          Suggested: {label(t.suggestion)}. Please confirm against your records.
        </p>
      )}
      <Field label="Classification">
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setSource("");
          }}
        >
          {transactionKinds.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </Field>
      {isIncome ? (
        <>
          <Field label="Income source">
            <select
              value={source}
              required
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Choose an income source</option>
              {w.incomes
                .filter((s) => s.kind === kind && s.currency === t.currency)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            {selectedSource?.property_id
              ? `Linked to ${w.properties.find((p) => p.id === selectedSource.property_id)?.name}`
              : "Add matching sources on the Income page before assigning receipts."}
          </p>
        </>
      ) : (
        <Field label="Property">
          <select
            name="property_id"
            required={kind === "loan_repayment"}
            defaultValue={t.property_id ?? ""}
          >
            <option value="">No property</option>
            {w.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Category">
        <input
          name="category"
          required
          maxLength={160}
          defaultValue={t.category}
        />
      </Field>
      <Field label="Notes">
        <textarea name="notes" maxLength={2000} defaultValue={t.notes} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" name="included" defaultChecked={t.included} />
        Include in reports
      </label>
      {t.raw && (
        <details>
          <summary>Original imported fields</summary>
          <dl className="raw-fields">
            {Object.entries(t.raw).map(([key, value]) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>{String(value) || "(blank)"}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>,
    (data) =>
      void submit(
        `/transactions/${t.id}`,
        {
          kind,
          category: data.get("category"),
          notes: data.get("notes"),
          included: data.has("included"),
          income_source_id: isIncome ? optionalId(source) : null,
          property_id: isIncome
            ? (selectedSource?.property_id ?? null)
            : optionalId(data.get("property_id")),
        },
        "PUT",
      ),
  );
}

function optionalId(value: FormDataEntryValue | null) {
  return value ? Number(value) : null;
}
