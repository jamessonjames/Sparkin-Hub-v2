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
  const { data, error } = await supabase.from("demand_suggestions").select("id").limit(1);
  if (error) {
    console.log("Table demand_suggestions error/does not exist:", error.message);
  } else {
    console.log("Table demand_suggestions exists!");
  }
}

main().catch(console.error);
