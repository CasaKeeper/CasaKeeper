"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/auth/redirects";
import { householdErrorMessage } from "@/lib/household";

export default function JoinForm() {
  const params = useSearchParams(); const router = useRouter(); const code = params.get("code")?.trim() || ""; const [signedIn, setSignedIn] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  useEffect(() => { createSupabaseBrowserClient().auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).finally(() => setLoading(false)); }, []);
  const accept = async () => { setBusy(true); setError(""); try { const { error: rpcError } = await createSupabaseBrowserClient().rpc("accept_household_invitation", { raw_token: code }); if (rpcError) throw rpcError; setSuccess("You joined the household. Opening your home..."); router.refresh(); router.replace("/"); } catch (cause) { setError(householdErrorMessage(cause, "join")); } finally { setBusy(false); } };
  const next = safeNextPath(`/join?code=${encodeURIComponent(code)}`);
  return <main className="auth-page"><section className="panel auth-card join-card"><p className="section-kicker">Household invitation</p><h1>Join a household</h1>{!code ? <p className="auth-error" role="alert">This invitation link is missing its code. Ask the household owner to send a new link.</p> : loading ? <p className="muted">Checking your sign-in...</p> : signedIn ? <><p className="muted">You’re signed in. Accept this invitation only if you recognize the household owner.</p><button className="button button-primary auth-submit" disabled={busy} onClick={accept}>{busy ? "Joining..." : "Accept invitation"}</button></> : <><p className="muted">Sign in or create an account first. The invitation will remain ready for you and will not be accepted automatically.</p><div className="join-actions"><Link className="button button-primary" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link><Link className="button button-secondary" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link></div></>}{success && <p className="auth-message" role="status">{success}</p>}{error && <p className="auth-error" role="alert">{error}</p>}</section></main>;
}
