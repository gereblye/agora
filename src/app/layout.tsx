import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agora — formalizable arguments",
  description:
    "Build, share, and evaluate logically formalizable arguments across philosophy, science, and politics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <Link href="/" className="serif text-xl font-bold tracking-tight">
              Agora
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/topics/philosophy" className="hover:text-ink">Philosophy</Link>
              <Link href="/topics/science" className="hover:text-ink">Science</Link>
              <Link href="/topics/politics" className="hover:text-ink">Politics</Link>
              <Link
                href="/statements/new"
                className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90"
              >
                New statement
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 py-10 text-xs text-muted">
          Agora · Phase 0 prototype · see <code>docs/PLAN.md</code>
        </footer>
      </body>
    </html>
  );
}
