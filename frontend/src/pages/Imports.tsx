import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { api, label } from "../api";
import { Empty, Modal } from "../components/UI";
import type { Account, Batch, ImportRow, Preview } from "../types";

export function Imports({
  accounts,
  batches,
  refresh,
}: {
  accounts: Account[];
  batches: Batch[];
  refresh: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [history, setHistory] = useState<{
    filename: string;
    rows: ImportRow[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setResult(null);
    setPreview(null);
    setBusy(true);
    setConfirmed(false);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Please choose a file no larger than 5 MB.");
      const body = new FormData();
      body.append("file", file);
      const data = await api<Preview>("/imports/preview", {
        method: "POST",
        body,
      });
      setPreview(data);
      setMapping(
        Object.fromEntries(data.accounts.map((a) => [a.key, a.account_id])),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api(`/imports/${preview.id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ mapping }),
        }),
      );
      setPreview(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(batch: Batch) {
    setError("");
    try {
      setHistory(await api(`/imports/${batch.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <section className="panel import-intro">
        <div>
          <span className="eyebrow">A FRESH LOOK AT YOUR FINANCES</span>
          <h2>Bring your transactions home.</h2>
          <p>
            Upload your bank and credit card exports. Preview every row before
            saving.
          </p>
        </div>
        <span className="tag">
          <CheckCircle2 size={14} /> Duplicate protection
        </span>
      </section>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="alert success">
          <CheckCircle2 size={18} />
          <span>
            Import complete. {result.imported} saved, {result.duplicate}{" "}
            duplicates skipped, {result.changed} changed rows held,{" "}
            {result.invalid} invalid rows skipped.
          </span>
        </div>
      )}
      <div
        className={`dropzone ${busy ? "busy" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files[0]);
        }}
      >
        <span className="upload-icon">
          <UploadCloud size={30} />
        </span>
        <h3>{busy ? "Processing your file..." : "Drop your CSV here"}</h3>
        <p>CSV, TSV or TXT, up to 5 MB and 5,000 rows</p>
        <button
          className="button primary"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          aria-label="Upload transaction file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <small>
          18 documented columns. Comma or tab separated. Headers are optional.
        </small>
      </div>
      {preview && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Review your import</h2>
              <p>
                Transactions are not saved until you confirm. Preview files are
                kept in import history.
              </p>
            </div>
          </div>
          <div className="import-counts">
            {Object.entries(preview.summary).map(([key, value]) => (
              <div key={key}>
                <strong>{value}</strong>
                <span>{label(key)} rows</span>
              </div>
            ))}
          </div>
          <h3>Confirm account mapping</h3>
          <p className="muted">
            Masked numbers can collide. Check every account, especially if the
            account name changed between exports.
          </p>
          <div className="mapping-list">
            {preview.accounts.map((account) => (
              <label key={account.key} className="mapping-row">
                <span>
                  <strong>{account.name}</strong>
                  <small>
                    {account.provider} / {account.number} / {account.currency}
                  </small>
                </span>
                <select
                  aria-label={`Map ${account.name}`}
                  value={mapping[account.key] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [account.key]: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Create or match this export account</option>
                  {accounts
                    .filter(
                      (a) =>
                        a.provider === account.provider &&
                        a.currency === account.currency,
                    )
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name} ({a.number})
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <p className="notice">
            Changed rows never overwrite saved transactions or your edits.
            Inspect them below and reconcile with the bank export. Rows without
            transaction IDs are rejected.
          </p>
          <RowTable rows={preview.rows} />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I checked the account mappings. Save valid new rows and skip
            duplicates, changed rows, and invalid rows.
          </label>
          <div className="form-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Dismiss preview
            </button>
            <button
              className="button primary"
              disabled={busy || !confirmed || !preview.accounts.length}
              onClick={() => void confirm()}
            >
              {busy ? "Saving..." : "Confirm import"}
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Import history</h2>
            <p>A record of every upload and its outcome</p>
          </div>
          <FileSpreadsheet size={20} />
        </div>
        {batches.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => void inspect(batch)}
                      >
                        {batch.filename}
                      </button>
                    </td>
                    <td>{new Date(batch.created_at).toLocaleString()}</td>
                    <td>
                      <span className="tag">{label(batch.status)}</span>
                    </td>
                    <td>
                      {Object.entries(batch.summary)
                        .map(([key, value]) => `${value} ${key}`)
                        .join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="A clean slate">
            Your uploads and validation results will be listed here.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Gmail sync is planned for a later release. Only files you explicitly
        upload are processed.
      </p>
      {history && (
        <Modal title={history.filename} onClose={() => setHistory(null)}>
          <p className="muted">
            Row statuses are from the original preview; the history summary
            contains the final import outcome.
          </p>
          <RowTable rows={history.rows} />
        </Modal>
      )}
    </>
  );
}

function RowTable({ rows }: { rows: ImportRow[] }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const filtered = rows.filter(
    (row) => filter === "all" || row.status === filter,
  );
  return (
    <>
      <div className="table-tools">
        <label>
          Status{" "}
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All rows</option>
            {["new", "duplicate", "changed", "invalid"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{filtered.length} rows</span>
      </div>
      <div className="table-scroll preview-table">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Description / issue</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((page - 1) * 50, page * 50).map((row) => (
              <tr key={row.line}>
                <td>{row.line}</td>
                <td>{row.error || String(row.data?.description)}</td>
                <td>
                  {row.data ? `${row.data.amount} ${row.data.currency}` : "-"}
                </td>
                <td>
                  <span
                    className={`tag ${row.status === "invalid" || row.status === "changed" ? "warning" : ""}`}
                  >
                    {label(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 50 && (
        <div className="pagination">
          <button
            className="button secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous rows
          </button>
          <span>
            Page {page} of {Math.ceil(filtered.length / 50)}
          </span>
          <button
            className="button secondary"
            disabled={page * 50 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next rows
          </button>
        </div>
      )}
    </>
  );
}
