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

function safeParseDate(dateStr) {
  if (!dateStr) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const cleaned = dateStr.replace(" ", "T");
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(dateStr);
}

function formatTzString(date) {
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? "+" : "-";
  const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, "0");
  
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`;
}

async function test() {
  const { data, error } = await supabase.from('demands').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log("DEMANDS IN DB:");
  for (const d of data) {
    console.log(`- Title: ${d.title}`);
    console.log(`  due_date: ${d.due_date}`);
    console.log(`  parsed: ${d.due_date ? safeParseDate(d.due_date).toString() : 'null'}`);
    console.log(`  formatted local: ${d.due_date ? formatTzString(safeParseDate(d.due_date)) : 'null'}`);
  }
}

test();
