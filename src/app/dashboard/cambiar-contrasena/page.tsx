"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle, Eye, EyeOff } from "lucide-react";

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["#dc2626", "#d97706", "#eab308", "#16a34a"];
  const labels = ["Muy débil", "Débil", "Moderada", "Fuerte"];

  if (!password) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < score ? colors[score - 1] : "#e2e8f0", transition: "background 0.2s" }} />
        ))}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: score > 0 ? colors[score - 1] : "#94a3b8", fontWeight: 600 }}>
        {score > 0 ? labels[score - 1] : ""}
      </p>
    </div>
  );
}

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [current,  setCurrent]  = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPw !== confirm) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setError("La nueva contraseña debe tener al menos una mayúscula, una minúscula y un número");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Error al cambiar la contraseña");
      } else {
        setDone(true);
        setTimeout(() => router.push("/dashboard"), 1800);
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
        <div style={{ textAlign: "center", background: "#fff", borderRadius: 16, padding: "48px 40px", border: "1px solid #e2e8f0", maxWidth: 400, width: "100%" }}>
          <CheckCircle size={52} color="#16a34a" style={{ margin: "0 auto 16px" }} />
          <h2 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: 20, fontWeight: 800 }}>¡Contraseña actualizada!</h2>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Redirigiendo al panel…</p>
        </div>
      </div>
    );
  }

  const pwField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    toggleShow: () => void,
    autoFocus?: boolean
  ) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 5 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoFocus={autoFocus}
          style={{ width: "100%", padding: "10px 40px 10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
        />
        <button
          type="button"
          onClick={toggleShow}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
      <form
        onSubmit={submit}
        style={{ background: "#fff", borderRadius: 16, padding: "40px 36px", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", width: "100%", maxWidth: 420 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <KeyRound size={24} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1e293b" }}>Cambiar contraseña</h2>
        </div>
        <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 28px" }}>
          Tu cuenta tiene una contraseña temporal. Establece una nueva contraseña para continuar.
        </p>

        {pwField("Contraseña actual (temporal)", current, setCurrent, showCur, () => setShowCur(v => !v), true)}
        {pwField("Nueva contraseña", newPw, setNewPw, showNew, () => setShowNew(v => !v))}
        <StrengthBar password={newPw} />
        <div style={{ marginTop: newPw ? 16 : 0 }} />
        {pwField("Confirmar nueva contraseña", confirm, setConfirm, showConf, () => setShowConf(v => !v))}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 20px" }}>
          Mínimo 8 caracteres · una mayúscula · una minúscula · un número
        </p>

        <button
          type="submit"
          disabled={saving}
          style={{ width: "100%", padding: "12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Guardando…" : "Establecer nueva contraseña"}
        </button>
      </form>
    </div>
  );
}
