import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 48, color: "#1F3A5F", margin: 0 }}>DocVault</h1>
        <p style={{ color: "#555", marginTop: 8 }}>
          Secure, multi-tenant document management.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "12px 28px",
            background: "#2E75B6",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
