"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasDuplicateResourceTypeName, normalizeResourceTypeName } from "@/lib/resource-types";

type ResourceType = { id: string; name: string };

export default function ResourceTypePanel({ initial, onChanged }: { initial: ResourceType[]; onChanged: (types: ResourceType[]) => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const nextName = normalizeResourceTypeName(editingId ? editingName : name);
    if (!nextName) { setError("Enter a Resource Type name."); return; }
    if (nextName.length > 80) { setError("Resource Type names must be 80 characters or fewer."); return; }
    if (hasDuplicateResourceTypeName(initial, nextName, editingId || undefined)) { setError("That Resource Type already exists."); return; }
    setBusy(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (editingId) {
        const { data, error: updateError } = await supabase.from("resource_types").update({ name: nextName }).eq("id", editingId).select("id, name").single();
        if (updateError || !data) throw updateError || new Error("Unable to rename the Resource Type.");
        onChanged(initial.map((type) => type.id === editingId ? { id: data.id, name: data.name } : type)); setEditingId(null); setEditingName("");
      } else {
        const { data, error: insertError } = await supabase.from("resource_types").insert({ name: nextName }).select("id, name").single();
        if (insertError || !data) throw insertError || new Error("Unable to create the Resource Type.");
        onChanged([...initial, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name))); setName("");
      }
    } catch (cause) { setError(cause instanceof Error && cause.message.includes("duplicate") ? "That Resource Type already exists." : cause instanceof Error ? cause.message : "Unable to save the Resource Type."); }
    finally { setBusy(false); }
  };
  const remove = async (type: ResourceType) => {
    setBusy(true); setError("");
    const { error: deleteError } = await createSupabaseBrowserClient().from("resource_types").delete().eq("id", type.id);
    if (deleteError) setError("This Resource Type cannot be removed while it is assigned to a Resource.");
    else onChanged(initial.filter((item) => item.id !== type.id));
    setBusy(false);
  };
  return <section className="panel settings-panel resource-type-panel"><div className="settings-heading"><div><p className="section-kicker">Organization</p><h3>Resource Types</h3><span className="panel-subtitle">Shared categories for household Resources.</span></div></div><div className="resource-type-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="New Resource Type" aria-label="New Resource Type" disabled={busy} /><button type="button" className="button button-secondary" onClick={() => void save()} disabled={busy}><Plus size={15} /> Add type</button></div><div className="resource-type-list">{initial.map((type) => editingId === type.id ? <div className="resource-type-row" key={type.id}><input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label={`Rename ${type.name}`} disabled={busy} /><button type="button" className="icon-button" onClick={() => void save()} disabled={busy} aria-label="Save Resource Type"><Pencil size={14} /></button><button type="button" className="icon-button" onClick={() => { setEditingId(null); setEditingName(""); }} aria-label="Cancel rename"><X size={14} /></button></div> : <div className="resource-type-row" key={type.id}><span>{type.name}</span><button type="button" className="icon-button" onClick={() => { setEditingId(type.id); setEditingName(type.name); setError(""); }} disabled={busy} aria-label={`Rename ${type.name}`}><Pencil size={14} /></button><button type="button" className="icon-button danger-icon" onClick={() => void remove(type)} disabled={busy} aria-label={`Delete ${type.name}`}><Trash2 size={14} /></button></div>)}</div>{error && <p className="field-error" role="alert">{error}</p>}</section>;
}
