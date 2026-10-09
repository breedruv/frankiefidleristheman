"use client";

import { useMemo } from "react";

const isPregameStatus = (value) => {
  const status = (value ?? "").toString().trim().toLowerCase();
  if (!status) return true;
  if (
    status.includes("scheduled") ||
    status.includes("pregame") ||
    status.includes("pre-game") ||
    status.includes("not started") ||
    status.includes("tbd")
  ) {
    return true;
  }
  return /\b\d{1,2}:\d{2}\s*(am|pm)\b/.test(status);
};

const formatLocalTime = (value) => {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const label = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  return label.replace(" AM", "AM").replace(" PM", "PM");
};

export default function StatusLabel({ status, gameDatetime }) {
  const label = useMemo(() => {
    if (isPregameStatus(status)) {
      const timeLabel = formatLocalTime(gameDatetime);
      if (timeLabel !== "--") {
        return timeLabel;
      }
    }
    return status || "--";
  }, [status, gameDatetime]);

  return <span suppressHydrationWarning>{label}</span>;
}
