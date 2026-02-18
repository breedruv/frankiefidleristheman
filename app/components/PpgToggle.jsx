"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function PpgToggle({ season, week, ppgMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checked = ppgMode === "last5";

  const handleChange = (event) => {
    const next = event.target.checked ? "last5" : "season";
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (season) params.set("season", String(season));
    if (week) params.set("week", String(week));
    params.set("ppg", next);
    router.push(`/matchup?${params.toString()}`);
  };

  return (
    <label className="ppg-toggle">
      <span>Season</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        aria-label="Toggle PPG mode"
      />
      <span>Last 5</span>
    </label>
  );
}
