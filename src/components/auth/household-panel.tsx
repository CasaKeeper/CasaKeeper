"use client";

import { useState } from "react";
import { Copy, UserRound, X } from "lucide-react";
import type { HouseholdContext } from "@/lib/supabase/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function roleLabel(role: "owner" | "member") {
  return role === "owner" ? "Owner" : "Member";
}

export default function HouseholdPanel({ initial, displayNameOverride }: { initial: HouseholdContext; displayNameOverride?: string }) {
  const [household, setHousehold] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ code: string; link: string } | null>(null);
  const isOwner = household.role === "owner";

  const refresh = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: membership } = await supabase.from("household_members").select("household_id").maybeSingle();
    if (!membership?.household_id) return;
    const [{ data: invitations }, { data: members }, { data: profiles }] = await Promise.all([
      supabase.from("household_invitations").select("id, expires_at").eq("household_id", household.id).is("revoked_at", null).is("accepted_at", null).order("expires_at"),
      supabase.from("household_members").select("id, user_id, role").eq("household_id", household.id).order("joined_at"),
      supabase.from("profiles").select("id, display_name"),
    ]);
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile.display_name]));
    setHousehold((current) => ({
      ...current,
      displayName: profileById.get(current.userId) || null,
      members: (members || []).map((member) => ({ id: member.id, role: member.role as "owner" | "member", displayName: profileById.get(member.user_id) || null })),
      invitations: (invitations || []).map((invitation) => ({ id: invitation.id, expiresAt: invitation.expires_at })),
    }));
  };

  const createInvitation = async () => {
    setBusy(true); setError(""); setMessage(""); setSecret(null);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: rpcError } = await createSupabaseBrowserClient().rpc("create_household_invitation", { target_household_id: household.id, expires_at: expiresAt });
      if (rpcError || !data?.[0]?.invitation_token) throw rpcError || new Error("The invitation could not be created.");
      const code = data[0].invitation_token as string;
      setSecret({ code, link: `${window.location.origin}/join?code=${encodeURIComponent(code)}` });
      setMessage("Copy this invitation now. The code is only shown once.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create an invitation.");
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setBusy(true); setError("");
    try {
      const { error: rpcError } = await createSupabaseBrowserClient().rpc("revoke_household_invitation", { invitation_id: id });
      if (rpcError) throw rpcError;
      await refresh(); setMessage("Invitation revoked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to revoke that invitation.");
    } finally { setBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied to clipboard.`);
  };

  return <section className="panel settings-panel household-panel">
    <div className="settings-heading household-heading">
      <div className="household-heading-copy"><p className="section-kicker">Household</p><h3>{household.name}</h3><span className="panel-subtitle">Your role: <strong className="role-badge">{roleLabel(household.role)}</strong></span></div>
      <span className="household-heading-icon" aria-hidden="true"><UserRound size={18} /></span>
    </div>
    <div className="household-members">
      <div className="subsection-heading"><strong>Members</strong><span>{household.members.length} {household.members.length === 1 ? "person" : "people"}</span></div>
      {household.members.map((member) => <div className="household-member" key={member.id}><span className="member-avatar"><UserRound size={14} /></span><span className="member-name">{member.id === household.currentMemberId ? displayNameOverride || member.displayName || "Household member" : member.displayName || "Household member"}</span><span className="member-role">{roleLabel(member.role)}</span></div>)}
    </div>
    {isOwner && <div className="invitation-area">
      <div className="invitation-heading"><div><h4>Invite someone</h4><p>Invite a trusted person to share this household. Codes expire after 7 days and can be used once.</p></div><button className="button button-secondary" disabled={busy} onClick={createInvitation}>{busy ? "Creating..." : "New invitation"}</button></div>
      <div className="pending-invitations"><div className="subsection-heading"><strong>Pending invitations</strong><span>{household.invitations.length}</span></div>{household.invitations.length ? household.invitations.map((invitation) => <div className="pending-invitation" key={invitation.id}><div><strong>Invitation</strong><span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div><span className="status-badge">Pending</span><button className="icon-button" disabled={busy} onClick={() => revoke(invitation.id)} aria-label="Revoke pending invitation"><X size={16} /></button></div>) : <p className="empty-invitations">No pending invitations.</p>}</div>
      {secret && <div className="invitation-secret" role="status"><strong>Copy your invitation</strong><p>This code is shown only once and is kept in memory until you leave this page.</p><code>{secret.code}</code><div className="secret-actions"><button className="button button-secondary" onClick={() => copy(secret.code, "Invitation code")}><Copy size={15} /> Copy code</button><button className="button button-primary" onClick={() => copy(secret.link, "Invitation link")}><Copy size={15} /> Copy link</button></div></div>}
    </div>}
    {message && <p className="auth-message" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
