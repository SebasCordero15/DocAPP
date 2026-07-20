"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Files, ClipboardList, ClipboardCheck, History, FilePlus,
  Users, Shield, Inbox, ScrollText, BarChart2, LogOut,
  ChevronLeft, ChevronRight, Globe, Trash2, FileEdit,
} from "lucide-react";

const IDLE_WARN_MS  = 58 * 60 * 1000; // show warning at 58 min
const IDLE_LIMIT_MS = 60 * 60 * 1000; // force logout at 60 min

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
  const locale   = useLocale();
  const t        = useTranslations("shell");
  const brand    = company.primaryColor;
  const font     = company.fontFamily;
  const isAdmin  = userRole === "COMPANY_ADMIN";
  const canCreate = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

  function switchLocale() {
    const next = locale === "es" ? "en" : "es";
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  }

  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [pendingTotal,  setPendingTotal]  = useState(0);
  const [pendingCRCount, setPendingCRCount] = useState(0);

  // ── idle timeout ─────────────────────────────────────────────────────────
  const lastActiveRef  = useRef(Date.now());
  const [idleWarning,  setIdleWarning]  = useState(false);
  const [countdown,    setCountdown]    = useState(120);

  const refreshTaskCounts = useCallback(() => {
    fetch("/api/tasks/counts")
      .then((r) => r.json())
      .then((d) => setPendingTotal((d.pendientes ?? 0) + (d.atrasadas ?? 0) + (d.returnedOutgoing ?? 0)))
      .catch(() => {});
  }, []);

  const refreshCRCounts = useCallback(() => {
    if (!isAdmin) return;
    fetch("/api/change-requests/counts")
      .then((r) => r.json())
      .then((d) => setPendingCRCount(d.pending ?? 0))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    refreshTaskCounts();
    const interval = setInterval(refreshTaskCounts, 30_000);
    const handler = () => { refreshTaskCounts(); refreshCRCounts(); };
    window.addEventListener("pendientes-changed", handler);
    return () => { clearInterval(interval); window.removeEventListener("pendientes-changed", handler); };
  }, [refreshTaskCounts, refreshCRCounts]);

  // Refresh badge immediately when the tab becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshTaskCounts();
        refreshCRCounts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshTaskCounts, refreshCRCounts]);

  useEffect(() => {
    refreshCRCounts();
    const interval = setInterval(refreshCRCounts, 30_000);
    return () => clearInterval(interval);
  }, [refreshCRCounts]);

  // ── idle detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const reset = () => { lastActiveRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    const tick = setInterval(() => {
      const idle = Date.now() - lastActiveRef.current;
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(tick);
        fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          window.location.href = "/login?reason=idle";
        });
        return;
      }
      if (idle >= IDLE_WARN_MS) {
        setIdleWarning(true);
        setCountdown(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idle) / 1000)));
      } else {
        setIdleWarning(false);
      }
    }, 5_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearInterval(tick);
    };
  }, []);

  // ── smooth countdown when warning is visible ──────────────────────────────
  useEffect(() => {
    if (!idleWarning) return;
    const sec = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(sec); return 0; }
        return c - 1;
      });
    }, 1_000);
    return () => clearInterval(sec);
  }, [idleWarning]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const SIDEBAR_W = sidebarOpen ? 240 : 64;

  const navItems = [
    { label: t("nav.documentos"),     icon: <Files size={18} />,          href: "/dashboard",                    badge: 0 },
    { label: t("nav.externos"),       icon: <Globe size={18} />,          href: "/dashboard/externos",           badge: 0 },
    { label: t("nav.listado"),        icon: <ClipboardList size={18} />,  href: "/dashboard/listado-maestro",    badge: 0 },
    { label: t("nav.pendientes"),     icon: <ClipboardCheck size={18} />, href: "/dashboard/pendientes",         badge: pendingTotal },
    { label: t("nav.controlCambios"), icon: <History size={18} />,        href: "/dashboard/control-cambios",    badge: 0 },
    ...(canCreate ? [
      { label: t("nav.crearDoc"),       icon: <FilePlus size={18} />,    href: "/dashboard/crear-documento",    badge: 0 },
    ] : []),
    ...(!isAdmin ? [
      { label: t("nav.solicitarCambio"), icon: <FileEdit size={18} />,   href: "/dashboard/solicitar-cambio",   badge: 0 },
      { label: t("nav.eliminarDoc"),     icon: <Trash2 size={18} />,     href: "/dashboard/eliminar-documento", badge: 0 },
    ] : []),
    ...(isAdmin ? [
      { label: t("nav.equipo"),      icon: <Users size={18} />,      href: "/dashboard/team",        badge: 0 },
      { label: t("nav.permisos"),    icon: <Shield size={18} />,     href: "/dashboard/permissions", badge: 0 },
      { label: t("nav.solicitudes"), icon: <Inbox size={18} />,      href: "/dashboard/solicitudes", badge: pendingCRCount },
      { label: t("nav.reportes"),    icon: <BarChart2 size={18} />,  href: "/dashboard/reportes",    badge: 0 },
      { label: t("nav.historial"),   icon: <ScrollText size={18} />, href: "/dashboard/audit",       badge: 0 },
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
                  gap: 10, padding: sidebarOpen ? "11px 14px" : "11px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  border: "none", background: active ? "rgba(255,255,255,0.2)" : "transparent",
                  color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 400,
                  marginBottom: 3,
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
                {isAdmin && <div style={{ fontSize: 10, opacity: 0.65 }}>{activeUserCount}/{maxUsers} {t("users")}</div>}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="shell-nav"
            title={!sidebarOpen ? t("signOut") : undefined}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              border: "none", background: "transparent",
              color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 13,
            }}
          >
            <LogOut size={16} />
            {sidebarOpen && <span>{t("signOut")}</span>}
          </button>

          {/* Locale switcher */}
          <button
            onClick={switchLocale}
            className="shell-nav"
            title={t("locale.label")}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              border: "none", background: "transparent",
              color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, marginTop: 2,
            }}
          >
            <Globe size={14} />
            {sidebarOpen && (
              <span>
                <span style={{ fontWeight: locale === "es" ? 700 : 400, color: locale === "es" ? "#fff" : "rgba(255,255,255,0.5)" }}>ES</span>
                {" / "}
                <span style={{ fontWeight: locale === "en" ? 700 : 400, color: locale === "en" ? "#fff" : "rgba(255,255,255,0.5)" }}>EN</span>
              </span>
            )}
            {!sidebarOpen && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{locale.toUpperCase()}</span>
            )}
          </button>

          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="shell-nav"
            title={sidebarOpen ? t("collapseTitle") : t("expandTitle")}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: 10, padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              border: "none", background: "transparent",
              color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 12, marginTop: 2,
            }}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {sidebarOpen && <span>{t("collapse")}</span>}
          </button>
        </div>
      </aside>

      {/* ── Content area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Persistent pending tasks banner — shows on every page */}
        {pendingTotal > 0 && (
          <div
            onClick={() => router.push("/dashboard/pendientes")}
            style={{
              background: "#dc2626", color: "#fff",
              padding: "9px 20px",
              display: "flex", alignItems: "center", gap: 10,
              flexShrink: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              boxShadow: "0 2px 6px rgba(220,38,38,0.4)",
            }}
          >
            <span style={{ fontSize: 16 }}>⚠</span>
            <span>
              Tienes {pendingTotal} tarea{pendingTotal !== 1 ? "s" : ""} pendiente{pendingTotal !== 1 ? "s" : ""} sin completar.
            </span>
            <span style={{ marginLeft: "auto", textDecoration: "underline", fontWeight: 600 }}>
              Ver pendientes →
            </span>
          </div>
        )}
        {children}
      </div>

      {/* ── Idle warning modal ── */}
      {idleWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 28px", width: 380, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>⏱</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{t("idle.title")}</h3>
            <p style={{ margin: "0 0 6px", fontSize: 14, color: "#64748b" }}>{t("idle.body")}</p>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#dc2626", margin: "12px 0 20px", fontVariantNumeric: "tabular-nums" }}>
              {String(Math.floor(countdown / 60)).padStart(2, "0")}:{String(countdown % 60).padStart(2, "0")}
            </div>
            <button
              onClick={() => { lastActiveRef.current = Date.now(); setIdleWarning(false); }}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: brand, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              {t("idle.continue")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
