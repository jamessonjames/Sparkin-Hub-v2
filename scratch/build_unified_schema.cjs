const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../supabase/migrations');
const outputFile = path.join(__dirname, '../supabase/schema_completo.sql');

try {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Sorts chronologically by filename prefix timestamp

  let unifiedSql = `-- Creative Flow Hub Unified SQL Schema\n`;
  unifiedSql += `-- Generated on ${new Date().toISOString()}\n\n`;

  for (const file of files) {
    unifiedSql += `-- ==========================================\n`;
    unifiedSql += `-- MIGRATION: ${file}\n`;
    unifiedSql += `-- ==========================================\n\n`;
    unifiedSql += fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    unifiedSql += `\n\n`;
  }

  fs.writeFileSync(outputFile, unifiedSql);
  console.log(`Successfully built unified schema at: ${outputFile}`);
} catch (e) {
  console.error("Error building unified schema:", e);
}
