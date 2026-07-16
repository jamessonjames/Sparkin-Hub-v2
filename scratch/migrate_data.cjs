const { createClient } = require('@supabase/supabase-js');

// Old Supabase Project Credentials (Lovable Internal)
const OLD_URL = "https://xrwbqvnymwoimidockds.supabase.co";
const OLD_KEY = "sb_publishable_YcpZCqNrS9kuWvafrj8f9Q_7rVh26ww";

// New Supabase Project Credentials (User's Custom) - Using SECRET admin key to bypass RLS
const NEW_URL = "https://qlsubkwxcteqvhkrdcqk.supabase.co";
const NEW_KEY = "sb_secret_o8rK3SF60cCWvmgSBWUTMQ_cuI1oKNp";

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

async function migrate() {
  console.log("Starting administrative data migration from Lovable Supabase to your Custom Supabase (Bypassing RLS)...");

  try {
    // 1. Migrate Clients
    console.log("Fetching clients from old database...");
    const { data: clients, error: clientFetchError } = await oldClient.from('clients').select('*');
    if (clientFetchError) throw clientFetchError;

    if (clients && clients.length > 0) {
      console.log(`Found ${clients.length} clients. Copying to new database...`);
      for (const client of clients) {
        const { error: clientInsertError } = await newClient.from('clients').upsert(client);
        if (clientInsertError) {
          console.error(`Error inserting client ${client.name}:`, clientInsertError.message);
        } else {
          console.log(`Migrated client: ${client.name}`);
        }
      }
      console.log("Clients migration completed.");
    } else {
      console.log("No clients found to migrate.");
    }

    // 2. Migrate Demands
    console.log("Fetching demands from old database...");
    const { data: demands, error: demandFetchError } = await oldClient.from('demands').select('*');
    if (demandFetchError) throw demandFetchError;

    if (demands && demands.length > 0) {
      console.log(`Found ${demands.length} demands. Copying to new database...`);
      for (const demand of demands) {
        const { estimated_hours, ...demandPayload } = demand;
        // Set user reference foreign keys to null to avoid constraint violations
        demandPayload.created_by_user_id = null;
        demandPayload.assignee_user_id = null;
        
        const { error: demandInsertError } = await newClient.from('demands').upsert(demandPayload);
        if (demandInsertError) {
          console.error(`Error inserting demand ${demand.title}:`, demandInsertError.message);
        } else {
          console.log(`Migrated demand: ${demand.title}`);
        }
      }
      console.log("Demands migration completed.");
    } else {
      console.log("No demands found to migrate.");
    }

    // 3. Migrate Comments
    console.log("Fetching comments from old database...");
    const { data: comments, error: commentFetchError } = await oldClient.from('comments').select('*');
    if (commentFetchError) {
      console.log("Could not fetch comments (table might not exist in old):", commentFetchError.message);
    } else if (comments && comments.length > 0) {
      console.log(`Found ${comments.length} comments. Copying to new database...`);
      for (const comment of comments) {
        const { error: commentInsertError } = await newClient.from('comments').upsert(comment);
        if (commentInsertError) {
          console.error(`Error inserting comment:`, commentInsertError.message);
        } else {
          console.log(`Migrated comment for demand ID: ${comment.demand_id}`);
        }
      }
      console.log("Comments migration completed.");
    }

    // 4. Migrate Notes
    console.log("Fetching notes from old database...");
    const { data: notes, error: notesFetchError } = await oldClient.from('notes').select('*');
    if (notesFetchError) {
      console.log("Could not fetch notes (table might not exist in old):", notesFetchError.message);
    } else if (notes && notes.length > 0) {
      console.log(`Found ${notes.length} notes. Copying to new database...`);
      for (const note of notes) {
        const { error: noteInsertError } = await newClient.from('notes').upsert(note);
        if (noteInsertError) {
          console.error(`Error inserting note:`, noteInsertError.message);
        } else {
          console.log(`Migrated note: ${note.title || 'Untitled'}`);
        }
      }
      console.log("Notes migration completed.");
    }

    console.log("🎉 MIGRATION SUCCESSFULLY COMPLETED!");
  } catch (err) {
    console.error("Migration failed:", err.message);
  }
}

migrate();
