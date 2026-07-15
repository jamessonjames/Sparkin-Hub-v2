const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// Read .env manually
const env = fs.readFileSync(".env", "utf8");
const envVars = {};
env.split("\n").forEach((line) => {
  const parts = line.split("=");
  if (parts.length === 2) {
    envVars[parts[0].trim()] = parts[1].trim().replace(/"/g, "");
  }
});

const supabase = createClient(
  envVars.SUPABASE_URL || envVars.VITE_SUPABASE_URL,
  envVars.SUPABASE_PUBLISHABLE_KEY || envVars.VITE_SUPABASE_PUBLISHABLE_KEY
);

async function run() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*, user_roles(*)");
  console.log("PROFILES:", profiles);
  console.log("ERROR:", error);
}
run();
