export default function Loading() {
  return <div className="page draft-players-page player-focus-loading">
    <div className="draft-subnav"><span>Draft Board</span><span className="active">Player Focus</span><span>Compare Players</span></div>
    <section className="draft-focus-hero"><div><span className="loading-line loading-kicker" /><span className="loading-line loading-title" /><span className="loading-line loading-copy" /></div><div className="draft-focus-count"><span className="loading-block" /></div></section>
    <div className="player-pool-controls loading-controls"><span className="loading-block" /><span className="loading-block" /></div>
    <section className="card"><div className="section-title"><span className="loading-line loading-section-title" /></div><div className="player-loading-table">{Array.from({ length: 10 }, (_, index) => <div className="player-loading-row" key={index}><span className="loading-avatar" /><span className="loading-line" /><span className="loading-line short" /><span className="loading-line short" /></div>)}</div></section>
  </div>;
}
