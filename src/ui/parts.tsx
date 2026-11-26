import type { ReactNode } from 'react';

/** Page title with a quiet line under it and the page's actions on the right. */
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-text"><h1>{title}</h1>{meta && <div className="page-meta">{meta}</div>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** One figure with a label and an optional icon tile. */
export function StatCard({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-top"><span className="label">{label}</span>{icon && <span className="stat-icon">{icon}</span>}</div>
      <div className="value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Panel({ title, sub, extra, children, flush }: { title?: string; sub?: ReactNode; extra?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`panel${flush ? ' flush' : ''}`}>
      {(title || extra) && (
        <header className="panel-head"><div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>{extra}</header>
      )}
      {children}
    </section>
  );
}
