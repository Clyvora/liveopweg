import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is verplicht voor PostGIS-migraties");

const migrationDirectory = resolve("infra", "postgis");
const migrations = (await readdir(migrationDirectory))
  .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name))
  .sort();
if (!migrations.length) throw new Error("Geen PostGIS-migraties gevonden");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  connection: { application_name: "mobilityradar-migrations" },
});

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS mobilityradar_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const name of migrations) {
    const applied = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM mobilityradar_schema_migrations WHERE name = ${name}) AS exists
    `;
    if (applied[0]?.exists) continue;
    const body = await readFile(resolve(migrationDirectory, name), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(body);
      await transaction`INSERT INTO mobilityradar_schema_migrations (name) VALUES (${name})`;
    });
    console.log(JSON.stringify({ event: "postgis.migration.applied", name }));
  }
} finally {
  await sql.end({ timeout: 5 });
}
