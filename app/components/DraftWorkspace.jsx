"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TEAMS, draftOrders, nextPick } from "../../lib/draftRules.mjs";
import DraftBoardLayout from "./DraftBoardLayout";
import DraftPickEntry, { DraftPlayerPicker } from "./DraftPickEntry";

export default function DraftWorkspace({ readOnly = false }) {
  const [picks, setPicks] = useState([]);
  const [orders, setOrders] = useState({ snake: DEFAULT_TEAMS, franchise: DEFAULT_TEAMS });
  const [openPicker, setOpenPicker] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const next = nextPick(picks, orders.snake, orders.franchise);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    let queued = false;
    let queuedConfig = false;
    let hasConfig = false;
    let version = 0;
    async function refresh(includeConfig = false) {
      if (loading) {
        queued = true;
        queuedConfig ||= includeConfig;
        return;
      }
      loading = true;
      const requestVersion = ++version;
      try {
        const [picksResponse, configResponse] = await Promise.all([
          fetch("/api/draft-picks"),
          includeConfig ? fetch("/api/draft-config") : Promise.resolve(null)
        ]);
        if (!picksResponse.ok || (configResponse && !configResponse.ok)) throw new Error();
        const [picksData, config] = await Promise.all([picksResponse.json(), configResponse?.json()]);
        if (!Array.isArray(picksData.picks)) throw new Error("Invalid draft picks response.");
        if (!cancelled && requestVersion === version) {
          setPicks(picksData.picks);
          if (config) {
            setOrders(draftOrders(config.snakeOrder));
            hasConfig = true;
          }
          if (hasConfig) setReady(true);
          setLoadError("");
        }
      } catch {
        if (!cancelled && requestVersion === version) setLoadError("Unable to refresh draft state. Pick entry is paused until it reconnects.");
      } finally {
        loading = false;
        if (queued && !cancelled) {
          const includeQueuedConfig = queuedConfig;
          queued = false;
          queuedConfig = false;
          refresh(includeQueuedConfig);
        }
      }
    }
    const handleSaved = (event) => {
      version++;
      if (event.detail?.picks) setPicks(event.detail.picks);
      else refresh();
    };
    const handleVisibility = () => { if (document.visibilityState === "visible") refresh(true); };
    refresh(true);
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(!hasConfig); }, 15000);
    window.addEventListener("draft-pick-saved", handleSaved);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("draft-pick-saved", handleSaved);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (readOnly || !openPicker || !query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch("/api/draft-players?q=" + encodeURIComponent(query), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResults(data.players || []);
      } catch (error) {
        if (error.name !== "AbortError") {
          setResults([]);
          setSearchError(error.message || "Unable to search.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, openPicker, readOnly]);

  useEffect(() => {
    setOpenPicker(null);
    setQuery("");
    setSelected(null);
    setResults([]);
    setSearchError("");
  }, [next?.pickNumber, next?.teamCode]);

  function openAt(location) {
    if (!ready || loadError || readOnly) return;
    setOpenPicker((current) => current === location ? null : location);
    setQuery("");
    setSelected(null);
    setResults([]);
    setSearchError("");
    setMessage("");
    setSubmitError("");
  }

  function closePicker(restoreFocus = false) {
    const focusId = openPicker === "carousel" ? "draft-carousel-current-pick" : "draft-board-current-pick";
    setOpenPicker(null);
    setQuery("");
    setSelected(null);
    setResults([]);
    setSearchError("");
    setSubmitError("");
    if (restoreFocus) requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }

  async function submit(block = false) {
    if (!selected || !next || saving || loadError || !ready) return;
    setSaving(true);
    setMessage("");
    setSubmitError("");
    try {
      const response = await fetch("/api/draft-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, block, playerId: selected.playerId, draftedPosition: selected.position })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const updatedPicks = [...picks.filter((pick) => pick.pick_number !== data.pick.pick_number), data.pick].sort((a, b) => a.pick_number - b.pick_number);
      setPicks(updatedPicks);
      closePicker();
      setMessage(block ? data.pick.team_code + " retained " + selected.name + ". " + next.teamCode + " chooses again." : "Pick " + next.pickNumber + ": " + data.pick.team_code + " selected " + selected.name + ".");
      window.dispatchEvent(new CustomEvent("draft-pick-saved", { detail: { picks: updatedPicks } }));
    } catch (error) {
      setSubmitError(error.message || "Unable to save. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  const picker = next && <DraftPlayerPicker
    pickNumber={next.pickNumber}
    teamCode={next.teamCode}
    roundNumber={next.roundNumber}
    query={query}
    onQueryChange={(value) => { setQuery(value); setSelected(null); setSearching(Boolean(value.trim())); }}
    results={results}
    selected={selected}
    onSelect={(player) => { setSelected(player); setResults([]); }}
    searchError={searchError}
    searching={searching}
    saving={saving}
    loadError={loadError}
    submitError={submitError}
    onSubmit={submit}
    onCancel={() => closePicker(true)}
  />;

  return <>
    {loadError && <p role="alert" className="workspace-error">{loadError}</p>}
    {!ready ? <p>Loading draft...</p> : <>
      <DraftPickEntry picks={picks} orders={orders} readOnly={readOnly} openPicker={openPicker} onOpenPicker={openAt} picker={openPicker === "carousel" ? picker : null} message={message} canPick={!loadError} />
      <DraftBoardLayout picks={picks} orders={orders} readOnly={readOnly} openPicker={openPicker} onOpenPicker={openAt} picker={openPicker === "board" ? picker : null} canPick={!loadError} />
    </>}
  </>;
}
