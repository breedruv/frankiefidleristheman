import "./globals.css";
import Link from "next/link";
import { Bebas_Neue, Archivo } from "next/font/google";
import PositionRosterNav from "./components/PositionRosterNav";
import { getFantasyRoster } from "../lib/queries";

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
  title: "CBB War Room",
  description: "Fantasy college basketball hub for weekly matchups, rosters, and draft planning."
};

export default async function RootLayout({ children }) {
  const teamId = 2;
  const roster = await getFantasyRoster({ teamId });
  const players = roster
    .map((player) => {
      const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
      return {
        player_id: player.player_id,
        label: name || `Player ${player.player_id}`,
        player_position: player.player_position
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="app-shell">
          <header className="site-header">
            <div className="brand">
              <span className="brand-mark">CBB</span>
              <div>
                <p className="brand-title">B Town Sparties</p>
                <p className="brand-subtitle">Fantasy College Basketball Hub</p>
              </div>
            </div>
            <nav className="site-nav">
              <Link href="/">Home</Link>
              <Link href="/scoreboard">Scoreboard</Link>
              <Link href="/matchup">Matchup</Link>
              <Link href="/roster">Roster</Link>
              <PositionRosterNav players={players} />
              <Link href="/compare">Compare</Link>
              <Link href="/draft">Draft</Link>
              <Link href="/admin/weeks">Admin</Link>
            </nav>
            <div className="header-actions">
              <button className="ghost-pill" type="button">Week 7</button>
              <button className="solid-pill" type="button">Import CSV</button>
            </div>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>Data refresh: matchups every 5 minutes, game stats daily.</span>
            <span>Built for a two-person league. Public access for now.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
