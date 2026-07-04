"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Files, ClipboardList, ClipboardCheck, History, FilePlus,
  Users, Shield, Inbox, ScrollText, BarChart2, LogOut,
  ChevronLeft, ChevronRight,
} from "lucide-react";

interface Props {
  company: {
    name: string;
    primaryColor: string;
    fontFamily: string;
    logoUrl: string | null;
  };
  userRole: string;
  activeUserCount: number;
  maxUsers: number;
  forcePasswordChange?: boolean;
  children: React.ReactNode;
}

export default function DashboardShellClient({
  company, userRole, activeUserCount, maxUsers, forcePasswordChange, children,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const brand    = company.primaryColor;
  const font     = company.fontFamily;
  const isAdmin  = userRole === "COMPANY_ADMIN";
  const canCreate = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [pendingTotal,  setPendingTotal]  = useState(0);
  const [pendingCRCount, setPendingCRCount] = useState(0);

  useEffect(() => {
    fetch("/api/tasks/counts")
      .then((r) => r.json())
      .then((d) => setPendingTotal((d.pendientes ?? 0) + (d.atrasadas ?? 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/change-requests/counts")
      .then((r) => r.json())
      .then((d) => setPendingCRCount(d.pending ?? 0))
      .catch(() => {});
  }, [isAdmin]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const SIDEBAR_W = sidebarOpen ? 240 : 64;

  const navItems = [
    { label: "Documentos",      icon: <Files size={18} />,         href: "/dashboard",                        badge: 0 },
    { label: "Listado Maestro", icon: <ClipboardList size={18} />, href: "/dashboard/listado-maestro",        badge: 0 },
    { label: "Pendientes",      icon: <ClipboardCheck size={18} />, href: "/dashboard/pendientes",            badge: pendingTotal },
    { label: "Control Cambios", icon: <History size={18} />,       href: "/dashboard/control-cambios",        badge: 0 },
    ...(canCreate ? [
      { label: "Crear Documento", icon: <FilePlus size={18} />,    href: "/dashboard/crear-documento",        badge: 0 },
    ] : []),
    ...(isAdmin ? [
      { label: "Equipo",       icon: <Users size={18} />,      href: "/dashboard/team",        badge: 0 },
      { label: "Permisos",     icon: <Shield size={18} />,     href: "/dashboard/permissions", badge: 0 },
      { label: "Solicitudes",  icon: <Inbox size={18} />,      href: "/dashboard/solicitudes", badge: pendingCRCount },
      { label: "Reportes",     icon: <BarChart2 size={18} />,  href: "/dashboard/reportes",   badge: 0 },
      { label: "Auditoría",    icon: <ScrollText size={18} />, href: "/dashboard/audit",      badge: 0 },
    ] : []),
  ];

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return (pathname ?? "").startsWith(href);
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: `'${font}', Inter, system-ui, sans-serif` }}>

      <style>{`
        .shell-nav { transition: background 0.15s ease, color 0.15s ease; border-radius: 8px; }
        .shell-nav:hover { background: rgba(255,255,255,0.12) !important; }
        .shell-nav-active { background: rgba(255,255,255,0.2) !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{
        width: SIDEBAR_W, flexShrink: 0, height: "100vh",
        background: brand, color: "#fff",
        display: "flex", flexDirection: "column",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        boxShadow: "2px 0 12px rgba(0,0,0,0.15)",
        position: "relative", zIndex: 10,
      }}>

        {/* Logo + Company name */}
        <div style={{
          padding: sidebarOpen ? "20px 16px 16px" : "20px 0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center",
          justifyContent: sidebarOpen ? "flex-start" : "center", gap: 10,
          flexShrink: 0, cursor: "pointer",
        }} onClick={() => router.push("/dashboard")}>
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="" style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 6, background: "rgba(255,255,255,0.18)", padding: 3, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
              {company.name.charAt(0).toUpperCase()}
            </div>
          )}
          {sidebarOpen && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company.name}</div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>KE-Control</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto", overflowX: "hidden" }}>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className={`shell-nav${active ? " shell-nav-active" : ""}`}
                title={!sidebarOpen ? item.label : undefined}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  border: "none", background: active ? "rgba(255,255,255,0.2)" : "transparent",
                  color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400,
                  marginBottom: 2,
                }}
              >
                <span style={{ flexShrink: 0, position: "relative" }}>
                  {item.icon}
                  {item.badge > 0 && !sidebarOpen && (
                    <span style={{ position: "absolute", top: -5, right: -5, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 14, height: 14, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid " + brand }}>
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
                {sidebarOpen && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{item.label}</span>}
                {sidebarOpen && item.badge > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User + logout + collapse */}
        <div style={{ padding: sidebarOpen ? "12px 8px 8px" : "12px 0 8px", borderTop: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
          {sidebarOpen && (
            <div style={{ padding: "8px 12px", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {userRole.charAt(0).toUpperCase()}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{userRole.replace("_", " ")}</div>
                {isAdmin && <div style={{ fontSize: 10, opacity: 0.65 }}>{activeUserCount}/{maxUsers} users</div>}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="shell-nav"
            title={!sidebarOpen ? "Sign out" : undefined}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              border: "none", background: "transparent",
              color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 13,
            }}
          >
            <LogOut size={16} />
            {sidebarOpen && <span>Sign out</span>}
          </button>
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="shell-nav"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              border: "none", background: "transparent",
              color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 12, marginTop: 2,
            }}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {sidebarOpen && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Content area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
