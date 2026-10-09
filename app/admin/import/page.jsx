import JSZip from "jszip";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import CsvTemplateDownloads from "../../components/CsvTemplateDownloads";
import { FANTASY_CSV_TABLES } from "../../../lib/fantasyCsv";
import { supabase, hasSupabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

const parseCsvText = async (text) => {
  const normalized = text.replace(/^\uFEFF/, "");
  const { parse } = await import("csv-parse/sync");
  return parse(normalized, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
};

const toNull = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

const toInt = (value) => {
  const cleaned = toNull(value);
  if (cleaned === null) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toBool = (value) => {
  const cleaned = toNull(value);
  if (cleaned === null) return null;
  return ["1", "true", "yes", "y"].includes(cleaned.toLowerCase());
};

const requiredFieldsByTable = {
  fantasyTeams: ["fantasy_team_id", "name", "short_code"],
  fantasyTeamSeasons: ["season", "fantasy_team_id"],
  fantasyRosters: ["season", "fantasy_team_id", "player_id"],
  fantasyRosterMoves: ["season", "player_id"],
  fantasyMatchups: ["season", "season_type", "week", "fantasy_team_id", "opponent_fantasy_team_id"],
  fantasyLineups: ["season", "season_type", "week", "fantasy_team_id"],
  fantasyWeeks: ["season", "season_type", "week", "start_date", "end_date"]
};

const rowLabel = (tableLabel, index) => `${tableLabel} row ${index + 1}`;

const mapRows = (tableKey, rows) => {
  return rows.map((row) => {
    switch (tableKey) {
      case "fantasyTeams":
        return {
          fantasy_team_id: toInt(row.fantasy_team_id),
          name: toNull(row.name),
          short_code: toNull(row.short_code),
          logo_url: toNull(row.logo_url)
        };
      case "fantasyTeamSeasons":
        return {
          season: toInt(row.season),
          fantasy_team_id: toInt(row.fantasy_team_id),
          draft_order: toInt(row.draft_order)
        };
      case "fantasyRosters":
        return {
          season: toInt(row.season),
          fantasy_team_id: toInt(row.fantasy_team_id),
          player_id: toInt(row.player_id),
          player_position: toNull(row.player_position)
        };
      case "fantasyRosterMoves":
        return {
          season: toInt(row.season),
          player_id: toInt(row.player_id),
          from_team_id: toInt(row.from_team_id),
          to_team_id: toInt(row.to_team_id),
          move_date: toNull(row.move_date),
          note: toNull(row.note)
        };
      case "fantasyMatchups":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          fantasy_team_id: toInt(row.fantasy_team_id),
          opponent_fantasy_team_id: toInt(row.opponent_fantasy_team_id)
        };
      case "fantasyLineups":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          fantasy_team_id: toInt(row.fantasy_team_id),
          center_id: toInt(row.center_id),
          center_game_id: toInt(row.center_game_id),
          forward1_id: toInt(row.forward1_id),
          forward1_game_id: toInt(row.forward1_game_id),
          forward2_id: toInt(row.forward2_id),
          forward2_game_id: toInt(row.forward2_game_id),
          guard1_id: toInt(row.guard1_id),
          guard1_game_id: toInt(row.guard1_game_id),
          guard2_id: toInt(row.guard2_id),
          guard2_game_id: toInt(row.guard2_game_id),
          t1_id: toInt(row.t1_id),
          t1_game_id: toInt(row.t1_game_id),
          t2_id: toInt(row.t2_id),
          t2_game_id: toInt(row.t2_game_id)
        };
      case "fantasyWeeks":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          label: toNull(row.label),
          start_date: toNull(row.start_date),
          end_date: toNull(row.end_date),
          is_dynamic: toBool(row.is_dynamic),
          notes: toNull(row.notes)
        };
      default:
        return row;
    }
  });
};

const validateRows = (tableKey, rows) => {
  const errors = [];
  const mapped = mapRows(tableKey, rows);
  const requiredFields = requiredFieldsByTable[tableKey] || [];

  mapped.forEach((row, index) => {
    for (const field of requiredFields) {
      if (row[field] === null || row[field] === undefined || row[field] === "") {
        errors.push(`${rowLabel(tableKey, index)} missing ${field}`);
      }
    }
  });

  return {
    mapped,
    errors
  };
};

const collectFileEntries = async (formData) => {
  const entries = [];

  const zipFile = formData.get("bulk_zip");
  if (zipFile && typeof zipFile.arrayBuffer === "function") {
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    for (const name of fileNames) {
      const file = zip.file(name);
      if (!file) continue;
      const text = await file.async("string");
      const baseName = name.split("/").pop().toLowerCase();
      const table = FANTASY_CSV_TABLES.find(
        (item) =>
          baseName === item.filename.toLowerCase() ||
          baseName === item.filename.replace(".csv", ".CSV").toLowerCase()
      );
      if (table) {
        entries.push({ table, text, source: `ZIP:${name}` });
      }
    }
  }

  for (const table of FANTASY_CSV_TABLES) {
    const file = formData.get(table.key);
    if (!file || typeof file.text !== "function") continue;
    entries.push({ table, text: await file.text(), source: "UPLOAD" });
  }

  return entries;
};

async function importCsv(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    redirect("/admin/import?status=error&message=Supabase%20is%20not%20configured.");
  }

  const fileEntries = await collectFileEntries(formData);
  if (fileEntries.length === 0) {
    redirect("/admin/import?status=error&message=Upload%20a%20CSV%20or%20ZIP%20file.");
  }

  const results = [];
  for (const entry of fileEntries) {
    const rows = await parseCsvText(entry.text);
    if (!rows.length) {
      results.push(`${entry.table.label}: no rows`);
      continue;
    }

    const { mapped } = validateRows(entry.table.key, rows);

    const payload = mapped.filter((row) =>
      Object.values(row).some((value) => value !== null && value !== undefined && value !== "")
    );

    if (!payload.length) {
      results.push(`${entry.table.label}: no valid rows`);
      continue;
    }

    if (entry.table.table === "fantasy_roster_moves") {
      const { error } = await supabase.from(entry.table.table).insert(payload);
      if (error) {
        throw new Error(`${entry.table.label} import failed: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from(entry.table.table).upsert(payload, {
        onConflict: entry.table.conflict
      });
      if (error) {
        throw new Error(`${entry.table.label} import failed: ${error.message}`);
      }
    }

    results.push(`${entry.table.label}: ${payload.length} rows`);
  }

  revalidatePath("/scoreboard");
  revalidatePath("/matchup");
  revalidatePath("/admin/weeks");
  const message = encodeURIComponent(results.join(" | ") || "No files uploaded.");
  redirect(`/admin/import?status=ok&message=${message}`);
}

async function previewCsv(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    redirect("/admin/import?status=error&message=Supabase%20is%20not%20configured.");
  }

  const fileEntries = await collectFileEntries(formData);
  if (fileEntries.length === 0) {
    redirect("/admin/import?status=error&message=Upload%20a%20CSV%20or%20ZIP%20file.");
  }

  const preview = [];
  const errors = [];

  for (const entry of fileEntries) {
    const rows = await parseCsvText(entry.text);
    if (!rows.length) {
      preview.push(`${entry.table.label}: empty file`);
      continue;
    }

    const { mapped, errors: rowErrors } = validateRows(entry.table.key, rows);
    errors.push(...rowErrors.slice(0, 50).map((error) => `${entry.table.label}: ${error}`));

    const validRows = mapped.filter((row) =>
      Object.values(row).some((value) => value !== null && value !== undefined && value !== "")
    );
    preview.push(`${entry.table.label}: ${validRows.length} valid rows`);
  }

  const previewMessage = encodeURIComponent(preview.join(" | ") || "No files found.");
  const errorMessage = encodeURIComponent(errors.join("\n") || "");
  redirect(`/admin/import?status=preview&message=${previewMessage}&errors=${errorMessage}`);
}

export default function AdminImportPage({ searchParams }) {
  const status = searchParams?.status;
  const message = searchParams?.message;

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Fantasy CSV Import</h2>
          <span className="section-subtitle">Upload CSV files individually or as a ZIP.</span>
        </div>
        {status && message ? (
          <div className={`import-banner import-banner-${status}`}>{message}</div>
        ) : null}
        {searchParams?.errors ? (
          <div className="import-errors">
            <strong>Validation issues</strong>
            <pre>{searchParams.errors}</pre>
          </div>
        ) : null}
        <div className="card csv-import-form">
          <form action={importCsv} className="csv-import-stack">
            <label className="csv-import-row csv-import-bulk">
              <span>
                <strong>Bulk ZIP</strong>
                <em>Upload a .zip containing any of the template CSV filenames.</em>
              </span>
              <input type="file" name="bulk_zip" accept=".zip,application/zip" />
            </label>
            {FANTASY_CSV_TABLES.map((table) => (
              <label key={table.key} className="csv-import-row">
                <span>
                  <strong>{table.label}</strong>
                  <em>{table.headers.join(", ")}</em>
                </span>
                <input type="file" name={table.key} accept=".csv,text/csv" />
              </label>
            ))}
            <div className="csv-import-note">
              <p>ZIP files can include any mix of the template filenames. Blank files are ignored.</p>
            </div>
            <div className="import-actions">
              <button className="ghost-pill" formAction={previewCsv} type="submit">
                Preview
              </button>
              <button className="solid-pill" type="submit">
                Import CSVs
              </button>
            </div>
          </form>
          <div className="csv-import-templates">
            <div className="section-title">
              <h3>Templates</h3>
              <span className="section-subtitle">Download starter files for each table.</span>
            </div>
            <CsvTemplateDownloads />
          </div>
        </div>
      </section>
    </div>
  );
}
