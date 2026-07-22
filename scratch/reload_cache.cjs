const pg = require('pg');

const client = new pg.Client({
  connectionString: 'postgres://postgres:sparkinhub8605!@db.qlsubkwxcteqvhkrdcqk.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Conectando ao banco de dados Supabase...');
  await client.connect();
  console.log('Executando reload do schema cache...');
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('Schema cache recarregado com sucesso!');
  await client.end();
}

main().catch(err => {
  console.error('Erro ao recarregar cache:', err);
  process.exit(1);
});
