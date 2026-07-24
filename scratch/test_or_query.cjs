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
  const testUserId = "d562a6d6-7f1f-4b2b-9018-006ec6a4b7e3";
  const { data, error } = await supabase
    .from("demands")
    .select("id, title, assignee_user_id")
    .or(`assignee_user_id.eq.${testUserId},assignee_user_id.is.null`);

  if (error) {
    console.error("Supabase Query Error:", error);
  } else {
    console.log("Success! Returned count:", data.length);
  }
}

main().catch(console.error);
