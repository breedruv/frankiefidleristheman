"use client";

import JSZip from "jszip";
import { useMemo, useState } from "react";
import { FANTASY_CSV_TABLES, makeSampleCsv } from "../../lib/fantasyCsv";

export default function CsvTemplateDownloads() {
  const [downloading, setDownloading] = useState(false);
  const templates = useMemo(
    () =>
      FANTASY_CSV_TABLES.map((table) => ({
        ...table,
        href: `data:text/csv;charset=utf-8,${encodeURIComponent(makeSampleCsv(table))}`
      })),
    []
  );

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      templates.forEach((table) => {
        zip.file(table.filename, makeSampleCsv(table));
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fantasy_csv_templates.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="csv-template-stack">
      <button className="ghost-pill csv-template-zip" type="button" onClick={downloadZip} disabled={downloading}>
        {downloading ? "Building ZIP..." : "Download all templates as ZIP"}
      </button>
      <div className="csv-template-grid">
        {templates.map((table) => (
          <a
            key={table.key}
            className="csv-template-card"
            href={table.href}
            download={table.filename}
          >
            <strong>{table.label}</strong>
            <span>Download template CSV</span>
          </a>
        ))}
      </div>
    </div>
  );
}
