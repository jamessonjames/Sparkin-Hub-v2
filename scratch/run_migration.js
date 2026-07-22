const pg = require('pg');
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '../supabase/migrations/20260720100000_create_file_attachments.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString: 'postgres://postgres:sparkinhub8605!@db.qlsubkwxcteqvhkrdcqk.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Conectando ao banco de dados Supabase...');
  await client.connect();
  console.log('Conectado! Executando SQL da migração...');
  await client.query(sql);
  console.log('Tabela file_attachments criada/atualizada com sucesso!');
  await client.end();
}

main().catch(err => {
  console.error('Erro ao aplicar migração:', err);
  process.exit(1);
});
