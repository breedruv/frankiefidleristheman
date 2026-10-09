require("dotenv").config({ path: ".env.local" });
const fs = require("node:fs");
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env.local");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(fs.readFileSync("db/schema.sql", "utf8"));
    console.log("Supabase schema applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

