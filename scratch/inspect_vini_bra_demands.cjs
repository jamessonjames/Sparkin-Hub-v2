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
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, billing_model")
    .ilike("name", "%vini%");

  console.log("Clients found:", clients);

  if (!clients || clients.length === 0) return;

  for (const client of clients) {
    const { data: demands } = await supabase
      .from("demands")
      .select("id, title, status, assignee_user_id, deleted_at, client_edition_id, created_at")
      .eq("client_id", client.id);

    console.log(`\nDemands for client ${client.name} (${client.id}): Total ${demands ? demands.length : 0}`);
    if (demands) {
      console.table(
        demands.map((d) => ({
          id: d.id.slice(0, 8),
          title: d.title.slice(0, 30),
          status: d.status,
          assignee: d.assignee_user_id ? d.assignee_user_id.slice(0, 8) : "NULL",
          deleted_at: d.deleted_at ? d.deleted_at.slice(0, 10) : "NONE",
          edition: d.client_edition_id ? d.client_edition_id.slice(0, 8) : "NONE",
          created: d.created_at ? d.created_at.slice(0, 10) : "",
        }))
      );
    }
  }

  // Also query user roles and profiles to check user ID for Jamesson
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  console.log("\nUser Profiles in System:");
  console.table(profiles);
}

main().catch(console.error);
