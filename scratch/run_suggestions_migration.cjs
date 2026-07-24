const pg = require("pg");
const fs = require("fs");
const path = require("path");

const sqlPath = path.join(__dirname, "../supabase/migrations/20260724170000_create_demand_suggestions.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: "postgres://postgres:sparkinhub8605!@db.qlsubkwxcteqvhkrdcqk.supabase.co:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Conectando ao banco de dados Supabase...");
  await client.connect();
  console.log("Conectado! Executando SQL da migração demand_suggestions...");
  await client.query(sql);
  console.log("Executando reload do schema cache...");
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("Tabelas demand_suggestions e capture_settings criadas com sucesso!");
  await client.end();
}

main().catch((err) => {
  console.error("Erro ao aplicar migração:", err);
  process.exit(1);
});
