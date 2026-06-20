"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  detail: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "#16a34a", LOGOUT: "#6b7280",
  FILE_UPLOAD: "#2563eb", FILE_DELETE: "#dc2626", FILE_REVIEW_COMPLETE: "#7c3aed", FILE_REVIEW_UPDATE: "#d97706",
  FOLDER_CREATE: "#0891b2", FOLDER_DELETE: "#dc2626", FOLDER_RENAME: "#d97706",
  USER_INVITE: "#7c3aed", USER_ACTIVATE: "#16a34a", USER_DEACTIVATE: "#dc2626",
  COMPANY_CREATE: "#2563eb", COMPANY_ACTIVATE: "#16a34a", COMPANY_DEACTIVATE: "#dc2626", COMPANY_UPDATE: "#d97706",
};

interface Props {
  company: { primaryColor: string; fontFamily: string };
}

export default function AuditClient({ company }: Props) {
  const router = useRouter();
  const brand = company.primaryColor;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);

  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterUser) p.set("userId", filterUser);
    if (filterAction) p.set("action", filterAction);
    if (filterFrom) p.set("dateFrom", filterFrom);
    if (filterTo) p.set("dateTo", filterTo);
    p.set("page", String(page));
    const res = await fetch(`/api/admin/audit?${p}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setUsers(data.users);
      setTotal(data.total);
      setPageCount(data.pageCount);
    }
    setLoading(false);
  }, [filterUser, filterAction, filterFrom, filterTo, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function applyFilters() { setPage(1); fetchLogs(); }
  function clearFilters() {
    setFilterUser(""); setFilterAction(""); setFilterFrom(""); setFilterTo("");
    setPage(1);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <header style={{ background: brand, color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#94a3b8", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            ← Dashboard
          </button>
          <strong style={{ fontSize: 16 }}>Audit Log</strong>
        </div>
        <span style={{ fontSize: 12, color: "#64748b" }}>{total} total events</span>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── Filters ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "18px 20px", marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>User</label>
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={inputStyle}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>Action contains</label>
            <input
              type="text" placeholder="e.g. FILE_UPLOAD"
              value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>From</label>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>To</label>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyFilters} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              Filter
            </button>
            <button onClick={clearFilters} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
              Clear
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          {loading ? (
            <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</p>
          ) : logs.length === 0 ? (
            <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No audit entries match these filters.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {["When", "Action", "User", "Resource", "Detail"].map((h) => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "11px 18px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }} title={new Date(l.createdAt).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}>
                      {timeAgo(l.createdAt)}
                    </td>
                    <td style={{ padding: "11px 18px" }}>
                      <code style={{
                        background: `${ACTION_COLORS[l.action] ?? "#6b7280"}18`,
                        color: ACTION_COLORS[l.action] ?? "#6b7280",
                        padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      }}>
                        {l.action}
                      </code>
                    </td>
                    <td style={{ padding: "11px 18px", fontSize: 13, color: "#374151" }}>
                      {l.user ? (
                        <span title={l.user.email}>{l.user.name}</span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>System</span>
                      )}
                    </td>
                    <td style={{ padding: "11px 18px", fontSize: 12, color: "#64748b" }}>
                      {l.resourceType ?? <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ padding: "11px 18px", fontSize: 13, color: "#64748b", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detail ?? ""}>
                      {l.detail ?? <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {pageCount > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>← Prev</button>
            <span style={{ padding: "6px 12px", fontSize: 13, color: "#64748b" }}>Page {page} of {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} style={pageBtn(page === pageCount)}>Next →</button>
          </div>
        )}
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff" };
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "#f1f5f9" : "#fff",
  color: disabled ? "#94a3b8" : "#2563eb",
  border: "1px solid #e2e8f0",
  padding: "6px 14px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
});
