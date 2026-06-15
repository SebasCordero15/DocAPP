import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import CompanyWizard from "./CompanyWizard";

export default async function NewCompanyPage() {
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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 28px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: "0 0 6px" }}>Create Company</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Provision a new tenant with branding, plan, and an initial admin account.</p>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "32px 36px" }}>
          <CompanyWizard />
        </div>
      </div>
    </main>
  );
}
