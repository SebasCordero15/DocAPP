import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KE-Control",
  description: "Gestión Documental Confiable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
