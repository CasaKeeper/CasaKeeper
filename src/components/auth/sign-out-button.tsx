"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return <button className="button button-secondary" disabled={busy} onClick={async () => { setBusy(true); await createSupabaseBrowserClient().auth.signOut(); router.replace("/login"); router.refresh(); }}>{busy ? "Signing out..." : "Sign out"}</button>;
}
