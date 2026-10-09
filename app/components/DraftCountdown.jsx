"use client";

import { useEffect, useState } from "react";

const DRAFT_DATE = new Date("2026-11-22T19:00:00-05:00").getTime();

function getRemaining() {
  const difference = Math.max(0, DRAFT_DATE - Date.now());
  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference / 3600000) % 24),
    minutes: Math.floor((difference / 60000) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    live: difference === 0
  };
}

export default function DraftCountdown() {
  const [remaining, setRemaining] = useState(() => getRemaining());

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(getRemaining()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={`draft-countdown ${remaining.live ? "is-live" : ""}`}>
      <div className="draft-countdown-copy">
        <span className="draft-countdown-kicker">Draft night</span>
        <h2>{remaining.live ? "The draft is live" : "The clock is running"}</h2>
        <p>November 22, 2026 · 7:00 PM Eastern</p>
      </div>
      {remaining.live ? (
        <div className="draft-live-indicator"><span /> LIVE NOW</div>
      ) : (
        <div className="draft-countdown-units" aria-label="Time until draft night">
          {[[remaining.days, "Days"], [remaining.hours, "Hours"], [remaining.minutes, "Minutes"], [remaining.seconds, "Seconds"]].map(([value, label]) => (
            <div className="draft-countdown-unit" key={label}><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}

