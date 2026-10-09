import Link from "next/link";
import DraftCountdown from "../components/DraftCountdown";

export const dynamic = "force-dynamic";

export default function DraftHubPage() {
  return <div className="page draft-hub-page">
    <DraftCountdown />
    <section className="draft-hub-hero">
      <div><span className="draft-countdown-kicker">Draft headquarters</span><h1>Prepare for draft night.</h1><p>The draft happens off-site. Use this area to organize the board, research players, and keep the final results in one place.</p></div>
      <div className="draft-hub-status"><span>Draft status</span><strong>Preparation</strong><small>Draft night · November 22 at 7:00 PM ET</small></div>
    </section>
    <section className="draft-hub-links">
      <Link href="/draft/board" className="draft-hub-link"><span className="draft-hub-link-number">01</span><div><h2>Draft Board</h2><p>View teams across the top, Round 0 Franchise, and Snake Rounds 1–17 down the board.</p></div><strong>→</strong></Link>
      <Link href="/draft/players" className="draft-hub-link"><span className="draft-hub-link-number">02</span><div><h2>Player Focus</h2><p>Search and filter the player pool by conference, position, team, and scoring range.</p></div><strong>→</strong></Link>
    </section>
  </div>;
}

