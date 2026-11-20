// Combine ESPN with CBS, Yahoo, and Lindy's listings (draft rules confirmed 2026-11-11):
// eligible positions are the union of every source, and height is the tallest listing (82"+ adds C).
export const SOURCE_LABELS = { espn: "ESPN", cbs: "CBS", yahoo: "Yahoo", lindys: "Lindy's" };
const ORDER = ["G", "F", "C"];
const ALIASES = { PG: "G", SG: "G", G: "G", SF: "F", PF: "F", F: "F", C: "C" };
export const CENTER_HEIGHT = 82;

export function parsePositions(value) {
  return [...new Set(String(value || "").toUpperCase().split(/[^A-Z]+/).map((part) => ALIASES[part]).filter(Boolean))];
}

export function formatHeight(inches) {
  return Number.isFinite(inches) && inches > 0 ? `${Math.floor(inches / 12)}'${inches % 12}"` : "";
}

// listings: [{ source, position, height_in }]; espn: { position, height } or null for stand-in players.
export function buildSourceProfile(espn, listings = []) {
  const entries = [...(espn ? [{ source: "espn", position: espn.position, height_in: Number(espn.height) || null }] : []), ...listings];
  const positionSources = {};
  const sources = [];
  let height = null;
  let heightSources = [];
  for (const entry of entries) {
    const label = SOURCE_LABELS[entry.source] || entry.source;
    if (!sources.includes(label)) sources.push(label);
    for (const position of parsePositions(entry.position)) {
      positionSources[position] = positionSources[position] || [];
      if (!positionSources[position].includes(label)) positionSources[position].push(label);
    }
    const inches = Number(entry.height_in);
    if (!Number.isFinite(inches) || inches <= 0) continue;
    if (height === null || inches > height) { height = inches; heightSources = [label]; }
    else if (inches === height && !heightSources.includes(label)) heightSources.push(label);
  }
  const heightCenter = height !== null && height >= CENTER_HEIGHT && !positionSources.C;
  const positions = ORDER.filter((position) => positionSources[position] || (position === "C" && heightCenter));
  const summary = positions.map((position) => position === "C" && heightCenter
    ? `C (height ${formatHeight(height)} ${heightSources.join(", ")})`
    : `${position} (${positionSources[position].join(", ")})`).join(" - ");
  return { positions, position: positions.join("-"), positionSummary: summary, height, heightSources, sources, heightCenter };
}
