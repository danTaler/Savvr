import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Building2, X } from "lucide-react";
import { money } from "../api";
import type { PropertySummary } from "../types";

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Building2 size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-content">
        <div className="section-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function PropertyCard({
  property: p,
  currency,
  onClick,
}: {
  property: PropertySummary;
  currency: string;
  onClick: () => void;
}) {
  return (
    <button className="property-card" onClick={onClick}>
      <div className="property-top">
        <span className="property-icon">
          <Building2 size={22} />
        </span>
        <ArrowUpRight size={18} />
      </div>
      <h3>{p.name}</h3>
      <p className="property-address">
        {p.address || "Add your property details"}
      </p>
      <div className="bank-tags">
        {p.banks.length ? (
          p.banks.map((bank) => <span key={bank}>{bank}</span>)
        ) : (
          <span>No loan linked</span>
        )}
      </div>
      <div className="property-stats">
        <div>
          <small>Rent received</small>
          <strong>{money(p.rental, currency)}</strong>
        </div>
        <div>
          <small>Cash flow</small>
          <strong className={Number(p.cash_flow) < 0 ? "negative" : "positive"}>
            {money(p.cash_flow, currency)}
          </strong>
        </div>
      </div>
      <div className="property-foot">
        <span>Recorded loan balance</span>
        <strong>
          {p.allocated_balance === null
            ? "Not entered"
            : money(p.allocated_balance, currency)}
        </strong>
      </div>
      {p.known_balance_count < p.currency_loan_count && (
        <small className="muted">Some loan balances are missing</small>
      )}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FormFooter({
  busy,
  onClose,
}: {
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button className="button primary" disabled={busy}>
        {busy ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}
