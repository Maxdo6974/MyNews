import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flash Info — l'actualité factuelle en 3 minutes",
  description: "Bulletins audio d'actualité, construits uniquement à partir de faits recoupés.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

const demo = process.env.DEMO_MODE !== "false";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh flex flex-col">
        {demo && (
          <div className="bg-accent text-white text-xs text-center py-1.5 tracking-wide">
            MODE DÉMO — contenus d'exemple, aucune information réelle, aucun appel API
          </div>
        )}
        <header className="border-b border-line">
          <div className="mx-auto max-w-3xl px-5 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent" aria-hidden />
              Flash Info
            </Link>
            <nav className="text-sm text-ink-soft flex gap-5">
              <Link href="/" className="hover:text-ink">Écouter</Link>
              <Link href="/test" className="hover:text-ink">Test</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">{children}</main>
        <footer className="border-t border-line text-xs text-ink-soft">
          <div className="mx-auto max-w-3xl px-5 py-5 flex flex-col sm:flex-row gap-2 justify-between">
            <span>Contenu généré automatiquement à partir de sources citées. Voix générée par IA.</span>
            <span>v0.3 · étape 3</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
