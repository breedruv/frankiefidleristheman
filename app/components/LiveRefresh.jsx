"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const formatTime = (value) => (value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null);

// Polls the read-only /api/live-stats while the tab is visible and re-renders the server page when the
// scheduled refresh wrote new live data. ESPN is only contacted by the collector or the failover.
export default function LiveRefresh() {
  const router = useRouter();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let timer;
    let stopped = false;
    let lastCheckedAt = null;

    const tick = async () => {
      let delay = 60;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/live-stats", { cache: "no-store" });
          const data = await response.json();
          if (response.ok) {
            if (data.checked_at && data.checked_at !== lastCheckedAt && (data.live_rows || data.finalized_games)) router.refresh();
            lastCheckedAt = data.checked_at || lastCheckedAt;
            if (!stopped) setStatus(data);
          }
        } catch {
          // Network hiccup; try again next tick.
        }
      }
      if (!stopped) timer = setTimeout(tick, delay * 1000);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  if (!status?.checked_at) return null;
  const label = status.live_games ? `${status.live_games} live` : "No live games";
  return (
    <span className="section-subtitle">
      {label} · updated {formatTime(status.checked_at)}
    </span>
  );
}
