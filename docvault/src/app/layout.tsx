import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DocVault",
  description: "Secure document management for businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
