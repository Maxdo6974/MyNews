import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import Footer from "./components/Footer";
import Header from "./components/Header";
import RegisterSW from "./components/RegisterSW";

export const metadata: Metadata = {
  title: "Flash Info — l'actualité, rien que les faits",
  description: "Flashs audio d'actualité de 2 à 3 minutes, construits uniquement à partir de faits recoupés par plusieurs rédactions indépendantes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Flash Info", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0e0f12",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

const demo = process.env.DEMO_MODE !== "false";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh flex flex-col">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 bg-ink text-paper px-3 py-2 rounded">
          Aller au contenu
        </a>
        <Header demo={demo} />
        <main id="contenu" className="flex-1 mx-auto w-full max-w-2xl px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
        <Footer />
        <RegisterSW />
      </body>
    </html>
  );
}
