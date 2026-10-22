"use client";

import { useEffect } from "react";

const numericColumns = new Set([3, 4, 5, 6, 7]);

export default function PlayerTableSort() {
  useEffect(() => {
    const table = document.querySelector(".player-focus-table");
    if (!table) return undefined;
    const headers = [...table.querySelectorAll("thead th")];
    const body = table.querySelector("tbody");
    const handlers = headers.map((header, columnIndex) => {
      let direction = 1;
      const handler = () => {
        direction *= -1;
        headers.forEach((item) => item.classList.remove("is-sorted-asc", "is-sorted-desc"));
        header.classList.add(direction === 1 ? "is-sorted-asc" : "is-sorted-desc");
        const rows = [...body.querySelectorAll("tr")];
        rows.sort((a, b) => {
          const leftText = a.children[columnIndex]?.textContent.trim() || "";
          const rightText = b.children[columnIndex]?.textContent.trim() || "";
          if (numericColumns.has(columnIndex)) {
            const left = Number.parseFloat(leftText);
            const right = Number.parseFloat(rightText);
            if (Number.isFinite(left) && Number.isFinite(right)) return (left - right) * direction;
          }
          return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: "base" }) * direction;
        });
        rows.forEach((row) => body.appendChild(row));
      };
      header.addEventListener("click", handler);
      header.classList.add("is-sortable");
      return () => header.removeEventListener("click", handler);
    });
    return () => headers.forEach((header, index) => { header.classList.remove("is-sortable", "is-sorted-asc", "is-sorted-desc"); header.removeEventListener("click", handlers[index]); });
  }, []);

  return null;
}
