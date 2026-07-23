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

const JAMESSON_ID = "d562a6d6-7f1f-4b2b-9018-006ec6a4b7e3";

async function main() {
  console.log("Updating all active demands to set assignee_user_id = Jamesson James (" + JAMESSON_ID + ")...");
  
  const { data, error } = await supabase
    .from("demands")
    .update({ assignee_user_id: JAMESSON_ID })
    .is("deleted_at", null)
    .select("id, title, client_id");

  if (error) {
    console.error("Error reassigning demands:", error);
    return;
  }

  console.log(`Successfully updated ${data ? data.length : 0} demands to Jamesson James!`);
}

main().catch(console.error);
