"use client";

import { useState, useEffect } from "react";

interface Industry { id: string; name: string; }

export default function IndustriesClient() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading,     setLoading]   = useState(true);
  const [newName,     setNewName]   = useState("");
  const [creating,    setCreating]  = useState(false);
  const [editId,      setEditId]    = useState<string | null>(null);
  const [editName,    setEditName]  = useState("");
  const [saving,      setSaving]    = useState(false);
  const [error,       setError]     = useState("");

  async function load() {
    setLoading(true);
    const d = await fetch("/api/superadmin/industries").then((r) => r.json()).catch(() => ({}));
    setIndustries(d.industries ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true); setError("");
    const res = await fetch("/api/superadmin/industries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Error al crear"); }
    else { setNewName(""); load(); }
    setCreating(false);
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/superadmin/industries/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Error al guardar"); }
    else { setEditId(null); load(); }
    setSaving(false);
  }

  async function remove(industry: Industry) {
    setError("");
    const res = await fetch(`/api/superadmin/industries/${industry.id}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "No se puede eliminar"); }
    else { load(); }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px 24px" }}>
        {/* Create new */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <input
            style={{ ...inp, flex: 1 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre de la nueva industria…"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            style={{ ...actionBtn, opacity: newName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
          >
            {creating ? "Guardando…" : "+ Agregar"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Cargando…</p>
        ) : industries.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "20px 0" }}>No hay industrias definidas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {industries.map((ind) => (
              <div key={ind.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                {editId === ind.id ? (
                  <>
                    <input
                      style={{ ...inp, flex: 1, padding: "7px 10px" }}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && save(ind.id)}
                      autoFocus
                    />
                    <button onClick={() => save(ind.id)} disabled={saving} style={{ ...actionBtn, padding: "7px 14px" }}>
                      {saving ? "…" : "Guardar"}
                    </button>
                    <button onClick={() => setEditId(null)} style={cancelBtn}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1e293b" }}>{ind.name}</span>
                    <button
                      onClick={() => { setEditId(ind.id); setEditName(ind.name); setError(""); }}
                      style={{ background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => remove(ind)}
                      style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, outline: "none" };
const actionBtn: React.CSSProperties = { background: "#1e293b", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13 };
const cancelBtn: React.CSSProperties = { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 };
