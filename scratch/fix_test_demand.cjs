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
  console.log("Fixing demand 'demandas 234234'...");
  const { data, error } = await supabase
    .from("demands")
    .update({ due_date: "2026-07-24", is_manually_scheduled: false })
    .ilike("title", "%234234%")
    .select("id, title, status, due_date, is_manually_scheduled");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Fixed record:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
