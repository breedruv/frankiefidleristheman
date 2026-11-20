import "./globals.css";
import Link from "next/link";
import { Bebas_Neue, Archivo } from "next/font/google";
import { currentMember } from "../lib/auth";
import AccountMenu from "./components/AccountMenu";
import CompleteMagicLink from "./components/CompleteMagicLink";

export const dynamic = "force-dynamic";

const display = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display"
});

const body = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body"
});

export const metadata = {
  title: "Btown Sparties",
  description: "Fantasy college basketball hub for weekly matchups, rosters, and draft planning."
};

export default async function RootLayout({ children }) {
  const member = await currentMember();
  const publicOnly = process.env.PRE_DRAFT_PRIVATE === "true" && !member;

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="app-shell">
          <CompleteMagicLink />
          <header className="site-header">
            <div className="brand">
              <span className="brand-mark">CBB</span>
              <div>
                <p className="brand-title">B Town Sparties</p>
                <p className="brand-subtitle">Fantasy College Basketball Hub</p>
              </div>
            </div>
            <nav className="site-nav" aria-label="Primary navigation">
              <div className="nav-primary">
                <Link href="/draft/board">Draft Board</Link>
                {!publicOnly && <Link href="/draft/players">Player Focus</Link>}
                {!publicOnly && <Link className="nav-highlight" href="/compare">Compare</Link>}
              </div>
            </nav>
            <div className="header-actions">
              <AccountMenu member={member} />
            </div>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>Data refresh: matchups every 5 minutes, game stats daily.</span>
            <span>{publicOnly ? "Public draft board · Research reserved for Andrew and Sam." : "Andrew and Sam’s fantasy basketball workspace."}</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
