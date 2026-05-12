import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Investment Memo Agent" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "monospace", margin: 0, background: "#fafafa" }}>
        <nav style={{ padding: "1rem 2rem", borderBottom: "1px solid #ddd", background: "#fff" }}>
          <Link href="/deals" style={{ fontWeight: "bold", textDecoration: "none", color: "#111" }}>
            Investment Memo Agent
          </Link>
        </nav>
        <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>{children}</main>
      </body>
    </html>
  );
}
