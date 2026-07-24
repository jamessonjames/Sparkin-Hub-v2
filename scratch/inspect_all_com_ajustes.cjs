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
  const { data, error } = await supabase
    .from("demands")
    .select("id, title, status, due_date, assignee_user_id, is_manually_scheduled, deleted_at")
    .eq("status", "com_ajustes")
    .is("deleted_at", null);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("All com_ajustes demands:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
