import Link from "next/link";
import ProposedLineupPreview from "./ProposedLineupPreview";
import HomeRosterBoard from "./HomeRosterBoard";
import MatchupDetailTable from "./MatchupDetailTable";
import styles from "./HomeDashboard.module.css";

const dateRange = (start, end) => {
  if (!start || !end) return "Schedule pending";
  const format = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(`${value}T12:00:00Z`));
  return `${format(start)} – ${format(end)}`;
};

export default function HomeDashboard({ roster, rosterPlayers, teamName, matchup, sampleLineups }) {
  const proposal = () => Array(7).fill("No proposal yet");
  const proposals = { Andrew: proposal(), Sam: proposal() };
  const window = matchup?.window;
  const opponent = matchup?.opponent;
  const homeScore = sampleLineups?.home.slice(0, 5).reduce((total, player) => total + player.points, 0) ?? "—";
  const awayScore = sampleLineups?.away.slice(0, 5).reduce((total, player) => total + player.points, 0) ?? "—";

  return <div className={styles.page}>
    <section className={styles.hero}><div><span>B Town Sparties</span><h1>Team dashboard</h1><p>{window?.label || "Season schedule pending"} · {window ? dateRange(window.start_date, window.end_date) : ""}</p></div><div className={styles.record}><span>Season standing</span><strong>#—</strong><small>W-L — · OW —</small></div></section>
    <section className={styles.dashboard}><aside className={styles.leftRail}><article className={styles.matchup}><div className={styles.cardHeading}><div><span>{sampleLineups ? "Sample matchup · local only" : "Current Matchup"}</span><h2>A/S vs {opponent?.short_code || "BJ"}</h2><small>{window ? dateRange(window.start_date, window.end_date) : "Schedule not loaded"}</small></div><Link href="/scoreboard">Full Scoreboard →</Link></div><div className={styles.scoreline}><div><strong>A/S</strong><b>{homeScore}</b></div><em>vs</em><div><strong>{opponent?.short_code || "BJ"}</strong><b>{awayScore}</b></div></div>{sampleLineups ? <MatchupDetailTable home={sampleLineups.home} away={sampleLineups.away} isSample /> : <><p>Starting-five totals settle the matchup. T1 and T2 are used only if the score is tied.</p><MatchupDetailTable /></>}</article><article className={styles.standings}><div><span>League standings</span><Link href="/scoreboard">View all →</Link></div><ol><li><b>Rank</b><b>Team</b><b>W-L</b><b>OW</b></li><li><span>—</span><span>Standings begin with the first result.</span><span>—</span><span>—</span></li></ol></article><ProposedLineupPreview proposals={proposals} title="Proposed lineups" compact /></aside><HomeRosterBoard players={rosterPlayers} /></section>
    <section className={styles.actions}><Link href="/matchup"><span>Lineups</span><strong>Review roster and propose a lineup →</strong></Link><Link href="/scoreboard"><span>League</span><strong>Open the full scoreboard →</strong></Link></section>
  </div>;
}
