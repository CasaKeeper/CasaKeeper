import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return <main className="auth-page"><section className="panel auth-card"><Link className="auth-brand" href="/">CasaKeeper</Link><p className="section-kicker">Your home, organized.</p><h1>{title}</h1>{children}<div className="auth-footer">{footer}</div></section></main>;
}

export function AuthLoading() { return <main className="auth-page"><section className="panel auth-card"><p className="muted">Checking your session...</p></section></main>; }
