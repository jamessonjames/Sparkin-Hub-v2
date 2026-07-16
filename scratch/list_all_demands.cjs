const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = "";
let envKey = "";
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.includes('VITE_SUPABASE_URL')) {
      envUrl = line.split('=')[1].trim().replace(/"/g, '').replace(/'/g, '');
    }
    if (line.includes('VITE_SUPABASE_PUBLISHABLE_KEY')) {
      envKey = line.split('=')[1].trim().replace(/"/g, '').replace(/'/g, '');
    }
  }
} catch (e) {
  console.error("Could not read .env:", e);
}

const supabase = createClient(envUrl, envKey);

async function listAll() {
  const { data, error } = await supabase.from('demands').select('id, title, status');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Found demands count:", data.length);
    console.log("Demands:", data.map(d => `${d.title} (${d.status})`));
  }
}

listAll();
