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
  const { data: profiles } = await supabase.from("profiles").select("*");
  console.log("PROFILES:");
  console.table(profiles);
}

main().catch(console.error);
