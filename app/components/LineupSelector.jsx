"use client";

import { useMemo, useState } from "react";

const getLabel = (player, teamAbbrById) => {
  const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  const team =
    player.team_abbr ??
    teamAbbrById?.[player.team_id] ??
    player.team_name ??
    "--";
  return `${name} (${team})`;
};

const toOptions = (players, teamAbbrById) =>
  players.map((player) => ({
    value: String(player.player_id),
    label: getLabel(player, teamAbbrById)
  }));

const toValue = (value) => (value ? String(value) : "");

export default function LineupSelector({
  centers,
  forwards,
  guards,
  allPlayers,
  teamAbbrById,
  initialLineup,
  lockedPlayerIds = []
}) {
  const [centerId, setCenterId] = useState(toValue(initialLineup?.center_id));
  const [forward1Id, setForward1Id] = useState(toValue(initialLineup?.forward1_id));
  const [forward2Id, setForward2Id] = useState(toValue(initialLineup?.forward2_id));
  const [guard1Id, setGuard1Id] = useState(toValue(initialLineup?.guard1_id));
  const [guard2Id, setGuard2Id] = useState(toValue(initialLineup?.guard2_id));
  const [t1Id, setT1Id] = useState(toValue(initialLineup?.t1_id));
  const [t2Id, setT2Id] = useState(toValue(initialLineup?.t2_id));

  const centerOptions = useMemo(() => toOptions(centers, teamAbbrById), [centers, teamAbbrById]);
  const forwardOptions = useMemo(() => toOptions(forwards, teamAbbrById), [forwards, teamAbbrById]);
  const guardOptions = useMemo(() => toOptions(guards, teamAbbrById), [guards, teamAbbrById]);
  const allOptions = useMemo(() => toOptions(allPlayers, teamAbbrById), [allPlayers, teamAbbrById]);
  const lockedSet = useMemo(
    () => new Set(lockedPlayerIds.map((value) => String(value))),
    [lockedPlayerIds]
  );

  const selectedIds = useMemo(
    () =>
      new Set([
        centerId,
        forward1Id,
        forward2Id,
        guard1Id,
        guard2Id,
        t1Id,
        t2Id
      ].filter(Boolean)),
    [centerId, forward1Id, forward2Id, guard1Id, guard2Id, t1Id, t2Id]
  );

  const filterOptions = (options, currentValue) =>
    options.filter(
      (option) =>
        option.value === currentValue ||
        (!selectedIds.has(option.value) && !lockedSet.has(option.value))
    );

  const isSelectedLocked = (value) => value && lockedSet.has(value);

  return (
    <div className="lineup-grid">
      <label className="lineup-field">
        <span>Center</span>
        <select
          name="center_id"
          value={centerId}
          onChange={(event) => setCenterId(event.target.value)}
          disabled={isSelectedLocked(centerId)}
        >
          <option value="">Select center</option>
          {filterOptions(centerOptions, centerId).map((option) => (
            <option key={`c-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="lineup-field">
        <span>Forward 1</span>
        <select
          name="forward1_id"
          value={forward1Id}
          onChange={(event) => setForward1Id(event.target.value)}
          disabled={isSelectedLocked(forward1Id)}
        >
          <option value="">Select forward</option>
          {filterOptions(forwardOptions, forward1Id).map((option) => (
            <option key={`f1-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="lineup-field">
        <span>Forward 2</span>
        <select
          name="forward2_id"
          value={forward2Id}
          onChange={(event) => setForward2Id(event.target.value)}
          disabled={isSelectedLocked(forward2Id)}
        >
          <option value="">Select forward</option>
          {filterOptions(forwardOptions, forward2Id).map((option) => (
            <option key={`f2-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="lineup-field">
        <span>Guard 1</span>
        <select
          name="guard1_id"
          value={guard1Id}
          onChange={(event) => setGuard1Id(event.target.value)}
          disabled={isSelectedLocked(guard1Id)}
        >
          <option value="">Select guard</option>
          {filterOptions(guardOptions, guard1Id).map((option) => (
            <option key={`g1-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="lineup-field">
        <span>Guard 2</span>
        <select
          name="guard2_id"
          value={guard2Id}
          onChange={(event) => setGuard2Id(event.target.value)}
          disabled={isSelectedLocked(guard2Id)}
        >
          <option value="">Select guard</option>
          {filterOptions(guardOptions, guard2Id).map((option) => (
            <option key={`g2-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="lineup-spacer" aria-hidden="true" />
      <label className="lineup-field">
        <span>T1</span>
        <select
          name="t1_id"
          value={t1Id}
          onChange={(event) => setT1Id(event.target.value)}
          disabled={isSelectedLocked(t1Id)}
        >
          <option value="">Select tiebreaker</option>
          {filterOptions(allOptions, t1Id).map((option) => (
            <option key={`t1-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="lineup-field">
        <span>T2</span>
        <select
          name="t2_id"
          value={t2Id}
          onChange={(event) => setT2Id(event.target.value)}
          disabled={isSelectedLocked(t2Id)}
        >
          <option value="">Select tiebreaker</option>
          {filterOptions(allOptions, t2Id).map((option) => (
            <option key={`t2-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
