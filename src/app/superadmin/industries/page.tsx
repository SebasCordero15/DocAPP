import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import IndustriesClient from "./IndustriesClient";

export default async function IndustriesPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/superadmin/login");

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <header style={{ background: "#1e293b", color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 17 }}>DocVault Admin</strong>
          <span style={{ fontSize: 12, background: "#334155", padding: "2px 8px", borderRadius: 4, marginLeft: 10, color: "#94a3b8" }}>
            SUPER_ADMIN
          </span>
        </div>
        <a href="/superadmin" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Dashboard</a>
      </header>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "36px 28px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: "0 0 6px" }}>Industrias</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
            Define las industrias disponibles para clasificar empresas. Renombrar una actualiza automáticamente las empresas que la usan.
          </p>
        </div>

        <IndustriesClient />
      </div>
    </main>
  );
}
