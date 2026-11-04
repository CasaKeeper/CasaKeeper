import JoinForm from "@/components/auth/join-form";
import type { Metadata } from "next";
import { Suspense } from "react";

export const instant = false;
export const metadata: Metadata = { referrer: "no-referrer" };

export default function JoinPage() { return <Suspense fallback={<main className="auth-page"><section className="panel auth-card"><p className="muted">Loading invitation...</p></section></main>}><JoinForm /></Suspense>; }
