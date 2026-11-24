const score = (entry) => Number(entry?.points ?? 0);
const complete = (entry) => entry?.complete === true;

export function decideMatchup({ home, away } = {}) {
  if (!home?.teamId || !away?.teamId) throw new Error("Both fantasy teams are required.");
  if (!complete(home.starters) || !complete(away.starters)) {
    return { status: "pending", waitingFor: "starters" };
  }
  if (score(home.starters) !== score(away.starters)) {
    return {
      status: "decided",
      winnerTeamId: score(home.starters) > score(away.starters) ? home.teamId : away.teamId,
      decidedBy: "starters"
    };
  }
  if (!complete(home.t1) || !complete(away.t1)) return { status: "pending", waitingFor: "t1" };
  if (score(home.t1) !== score(away.t1)) {
    return {
      status: "decided",
      winnerTeamId: score(home.t1) > score(away.t1) ? home.teamId : away.teamId,
      decidedBy: "t1"
    };
  }
  if (!complete(home.t2) || !complete(away.t2)) return { status: "pending", waitingFor: "t2" };
  if (score(home.t2) !== score(away.t2)) {
    return {
      status: "decided",
      winnerTeamId: score(home.t2) > score(away.t2) ? home.teamId : away.teamId,
      decidedBy: "t2"
    };
  }
  return { status: "review", waitingFor: "manual_decision" };
}

export function resolveMatchup({ home, away, overrideWinnerTeamId = null } = {}) {
  const computed = decideMatchup({ home, away });
  if (!overrideWinnerTeamId) return { ...computed, computed };
  if (overrideWinnerTeamId !== home?.teamId && overrideWinnerTeamId !== away?.teamId) {
    throw new Error("The override winner must be one of the matchup teams.");
  }
  return { status: "decided", winnerTeamId: overrideWinnerTeamId, decidedBy: "manual", computed };
}
