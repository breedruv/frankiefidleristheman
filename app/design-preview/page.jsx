import Link from "next/link";

function MiniTable() {
  return <div className="mini-table"><div><span>Player</span><span>PPG</span></div><div><strong>Rasheem Dunn</strong><b>25.4</b></div><div><strong>Nate Johnson</strong><b>19.8</b></div><div><strong>Dorian Finley</strong><b>18.6</b></div></div>;
}

function Header({ name, subtitle, links, theme }) {
  return <header><div className="preview-brand"><span className="preview-mark">CBB</span><div><strong>{name}</strong><small>{subtitle}</small></div></div><nav>{links}</nav><button>Week 7</button></header>;
}

export default function DesignPreviewPage() {
  return <div className="design-preview-page">
    <div className="preview-intro"><span className="preview-kicker">CBB War Room · Design study</span><h1>Three directions for the league home</h1><p>Each panel uses the same content so you can compare the personality, density, and emphasis of the design—not the data.</p><Link href="/">Return to the app</Link></div>
    <div className="preview-grid">
      <article className="design-option preview-war-room"><Header name="WAR ROOM" subtitle="Fantasy College Basketball" links="Scoreboard   Roster   Draft" /><div className="option-copy"><span className="option-number">01</span><h2>Sports war-room</h2><p>High energy, competitive, and built for quick decisions. Dark navy surfaces make stats and score changes feel important.</p></div><div className="war-layout"><div className="war-score"><small>LIVE MATCHUP</small><div><strong>ANDREW</strong><b>287</b></div><div><strong>SAM</strong><b>269</b></div><span>▲ Andrew leads by 18</span></div><div className="war-stats"><div><small>TOP PERFORMER</small><strong>Rasheem Dunn</strong><b>25.4 PPG</b></div><div><small>NEXT ACTION</small><strong>Update starters</strong><b>Center + 2 F + 2 G</b></div></div></div><div className="war-footer"><span>MODEL EDGE</span><strong>Andrew +7.2%</strong><span>LAST REFRESH 4:00 AM ET</span></div></article>
      <article className="design-option preview-modern"><Header name="College Hoops" subtitle="Fantasy league dashboard" links="Home   Matchups   Players   Draft" /><div className="option-copy"><span className="option-number">02</span><h2>Clean modern dashboard</h2><p>Calm, spacious, and easy to scan. It puts the league story first and makes the app feel more like a polished product.</p></div><div className="modern-layout"><div className="modern-score"><span>WEEK 7 · MATCHUP</span><h3>Andrew <b>287</b></h3><div className="score-line"><i /></div><h3>Sam <b>269</b></h3><small>Andrew leads by 18 points</small></div><div className="modern-side"><div><span>Active players</span><strong>42 / 48</strong></div><div><span>Games tracked</span><strong>1,248</strong></div><div><span>Top PPG</span><strong>25.4</strong></div></div></div><MiniTable /></article>
      <article className="design-option preview-warm"><Header name="B Town Sparties" subtitle="Fantasy College Basketball Hub" links="Home   Scoreboard   Roster   Draft" /><div className="option-copy"><span className="option-number">03</span><h2>Refined current style</h2><p>Keep the warmth and personality of the existing site, while making the hierarchy, navigation, and responsive layout more consistent.</p></div><div className="warm-layout"><div className="warm-score"><span>Scoreboard snapshot</span><div><strong>Andrew</strong><b>287 pts</b></div><div><strong>Sam</strong><b>269 pts</b></div><small>Tiebreaker: Bench +18</small></div><div className="preview-card"><div className="preview-card-heading"><h3>Top performers</h3><span>Week 7</span></div><MiniTable /></div></div><div className="warm-actions"><span>LINEUP</span><strong>Update week 7 starters</strong><span>DRAFT</span><strong>Refresh drafted list</strong></div></article>
    </div>
  </div>;
}

