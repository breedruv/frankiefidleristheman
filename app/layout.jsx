import "./globals.css";
import Link from "next/link";
import { currentMember } from "../lib/auth";
import AccountMenu from "./components/AccountMenu";
import CompleteMagicLink from "./components/CompleteMagicLink";
import PositionRosterNav from "./components/PositionRosterNav";
import { getDraftState } from "../lib/draftState";
import { getPlayerSummaries } from "../lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fantasy College Basketball",
  description: "Fantasy college basketball hub for weekly matchups, rosters, and draft planning."
};

export default async function RootLayout({ children }) {
  const member = await currentMember();
  const publicOnly = process.env.PRE_DRAFT_PRIVATE === "true" && !member;
  let rosterNavPlayers = [];
  if (member) {
    try {
      const state = await getDraftState();
      const picks = state.picks.filter((pick) => pick.team_code === "AS").sort((a, b) => a.pick_number - b.pick_number);
      const summaries = await getPlayerSummaries(picks.map((pick) => pick.player_id));
      const nameById = new Map(summaries.map((player) => [Number(player.player_id), `${player.first_name || ""} ${player.last_name || ""}`.trim()]));
      rosterNavPlayers = picks.map((pick) => ({ player_id: pick.player_id, player_position: pick.drafted_position, pickNumber: pick.pick_number, label: nameById.get(Number(pick.player_id)) || `Player ${pick.player_id}` }));
    } catch (error) {
      console.warn("Roster navigation is unavailable", error.message);
    }
  }

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <CompleteMagicLink />
          <header className="site-header">
            <Link className="brand" href={publicOnly ? "/draft/board" : "/"}>
              <span className="brand-mark">CBB</span>
              <div>
                <p className="brand-title">{publicOnly ? "Fantasy College Basketball" : "B Town Sparties"}</p>
                <p className="brand-subtitle">{publicOnly ? "Draft Board" : "Fantasy College Basketball Hub"}</p>
              </div>
            </Link>
            <nav className="site-nav" aria-label="Primary navigation">
              <div className="nav-primary">
                {publicOnly ? <Link href="/draft/board">Draft Board</Link> : <><Link href="/">Home</Link><Link href="/matchup">Matchup</Link><Link href="/scoreboard">Scoreboard</Link><details className="nav-more"><summary>Players</summary><div className="nav-more-menu"><PositionRosterNav players={rosterNavPlayers} /></div></details><details className="nav-more"><summary>Draft</summary><div className="nav-more-menu"><Link href="/draft/players">Player Focus</Link><Link href="/compare">Compare Players</Link><Link href="/draft/board">Draft Board</Link></div></details><details className="nav-more"><summary>Admin</summary><div className="nav-more-menu"><Link href="/admin/draft">Draft Setup</Link><Link href="/admin/weeks">Season Schedule</Link><Link href="/admin/import">Data Import</Link></div></details></>}
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
