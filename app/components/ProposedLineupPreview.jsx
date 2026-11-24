import styles from "./ProposedLineupPreview.module.css";

const slots = ["C", "F1", "F2", "G1", "G2", "T1", "T2"];
const exampleProposals = {
  Andrew: ["Caleb Wilson vs Opponent", "Nick Martinelli vs Opponent", "Koa Peat vs Opponent", "Richie Saunders vs Opponent", "Ryan Conwell vs Opponent", "Braden Smith vs Opponent", "Coen Carr vs Opponent"],
  Sam: ["Patrick Ngongba II vs Opponent", "Tre Carroll vs Opponent", "Pryce Sandfort vs Opponent", "Bennett Stirtz vs Opponent", "Kylan Boswell vs Opponent", "Nijel Pack vs Opponent", "Anthony Roy vs Opponent"]
};

export default function ProposedLineupPreview({ proposals = exampleProposals, title = "Proposed lineups", compact = false }) {
  return <section className={styles.card} data-compact={compact || undefined} aria-label="Proposed lineup layout preview">
    <div className={styles.heading}><div><span>{compact ? "Current scoring window" : "Dashboard study"}</span><h2>{title}</h2></div><small>Friday–Sunday · locks Friday at noon ET</small></div>
    <div className={styles.columns}>
      {Object.entries(proposals).map(([owner, players]) => <section key={owner} className={styles.column}><h3>{owner}</h3>{slots.map((slot, index) => <div className={`${styles.row} ${slot === "T1" ? styles.tiebreaker : ""}`} key={slot}><b>{slot}</b><span>{players[index]}</span></div>)}</section>)}
    </div>
  </section>;
}
