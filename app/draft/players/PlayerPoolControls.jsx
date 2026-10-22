"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function QuickPositionFilter({ position }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function choosePosition(nextPosition) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPosition === "All") params.delete("position");
    else params.set("position", nextPosition);
    router.replace(`${pathname}?${params.toString()}`);
  }
  return <div className="quick-position-filter"><span>Position</span><div>{["All", "C", "F", "G"].map((option) => <button key={option} type="button" className={position === option ? "active" : ""} onClick={() => choosePosition(option)}>{option}</button>)}</div></div>;
}

export default function PlayerPoolControls({ search, hideDrafted }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(search);

  useEffect(() => setValue(search), [search]);

  useEffect(() => {
    const nextSearch = value.trim();
    const currentSearch = searchParams.get("search") || "";
    if (nextSearch === currentSearch) return undefined;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextSearch) params.set("search", nextSearch);
      else params.delete("search");
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(nextUrl);
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  function toggleDrafted(event) {
    const params = new URLSearchParams(searchParams.toString());
    if (event.target.checked) params.set("hide_drafted", "1");
    else params.delete("hide_drafted");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return <><div className="player-pool-controls">
    <QuickPositionFilter position={searchParams.get("position") || "All"} />
    <div className="player-search-control">
      <label htmlFor="player-pool-search">Search player or school</label>
      <input id="player-pool-search" type="search" placeholder="Start typing a player or school" value={value} onChange={(event) => setValue(event.target.value)} />
    </div>
    <label className="checkbox-label player-drafted-toggle"><input value="1" type="checkbox" checked={hideDrafted} onChange={toggleDrafted} /> Hide drafted players</label>
  </div></>;
}
