const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [k, v] = line.split("=");
  if (k && v) {
    env[k.trim()] = v.trim().replace(/^["']|["']$/g, "");
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: clients } = await supabase.from("clients").select("id, name");
  const { data: demands } = await supabase.from("demands").select("id, title, client_id, assignee_user_id, deleted_at").is("deleted_at", null);

  const profilesMap = {
    'd562a6d6-7f1f-4b2b-9018-006ec6a4b7e3': 'Jamesson',
    'dcbe0cb3-3269-4fe7-b979-1c9db53bfcdc': 'Anderson',
    '2cb90290-04f7-4ca3-a208-1688094221ab': 'Ana Claudia',
  };

  const summary = (clients || []).map(c => {
    const cDemands = (demands || []).filter(d => d.client_id === c.id);
    const byAssignee = {};
    cDemands.forEach(d => {
      const name = d.assignee_user_id ? (profilesMap[d.assignee_user_id] || d.assignee_user_id.slice(0, 8)) : 'SEM RESPONSÁVEL';
      byAssignee[name] = (byAssignee[name] || 0) + 1;
    });

    return {
      cliente: c.name,
      total_demandas: cDemands.length,
      divisao: JSON.stringify(byAssignee),
    };
  });

  console.table(summary);
}

main().catch(console.error);
