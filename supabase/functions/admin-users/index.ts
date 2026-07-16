// Edge Function: admin-users
// Operações privilegiadas de gestão de time: createUser, updateUserRole, deleteUser, updateUserPermissions, updateUser.
// Usa SUPABASE_SERVICE_ROLE_KEY e re-valida o chamador via JWT (defesa em profundidade).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner" | "admin" | "collaborator";
type Body =
  | { action: "createUser"; email: string; password: string; name: string; role: Role }
  | { action: "updateUserRole"; user_id: string; role: Role }
  | { action: "deleteUser"; user_id: string }
  | { action: "updateUserPermissions"; user_id: string; can_create_demands: boolean }
  | { action: "updateUser"; user_id: string; name?: string; email?: string; password?: string };

const json = (s: number, p: unknown) =>
  new Response(JSON.stringify(p), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const canManage = (c: Role | null, t: Role) =>
  c === "owner" || (c === "admin" && (t === "admin" || t === "collaborator"));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const PUB = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Missing bearer" });
  const token = auth.slice(7);

  const user = createClient(URL_, PUB, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: ue } = await user.auth.getUser(token);
  if (ue || !u?.user) return json(401, { error: "Invalid token" });
  const callerId = u.user.id;

  const { data: rr } = await user
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .maybeSingle();
  const callerRole = (rr?.role as Role | null) ?? null;

  // Only owners and admins can call this function
  if (callerRole !== "owner" && callerRole !== "admin") {
    return json(403, { error: "Apenas proprietários ou administradores podem gerenciar usuários." });
  }

  const body = (await req.json()) as Body;
  const admin = createClient(URL_, SRK, { auth: { persistSession: false } });

  // Helper to fetch target user's role
  const getTargetRole = async (targetId: string): Promise<Role | null> => {
    const { data } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId)
      .maybeSingle();
    return (data?.role as Role | null) ?? null;
  };

  switch (body.action) {
    case "createUser": {
      if (!canManage(callerRole, body.role)) return json(403, { error: "Sem permissão para criar usuário com este cargo." });
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name, role: body.role },
      });
      if (error) return json(400, { error: error.message });
      return json(200, { id: data.user?.id });
    }

    case "updateUserRole": {
      const targetRole = await getTargetRole(body.user_id);
      // Admin cannot promote anyone to owner, nor change owner's role
      if (callerRole !== "owner" && (targetRole === "owner" || body.role === "owner")) {
        return json(403, { error: "Sem permissão para alterar o cargo deste usuário." });
      }
      if (body.user_id === callerId) {
        return json(400, { error: "Não pode alterar o próprio cargo." });
      }

      await admin.from("user_roles").delete().eq("user_id", body.user_id);
      const { error } = await admin.from("user_roles").insert({ user_id: body.user_id, role: body.role });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    case "deleteUser": {
      const targetRole = await getTargetRole(body.user_id);
      // Admin cannot delete owner
      if (callerRole !== "owner" && targetRole === "owner") {
        return json(403, { error: "Administradores não podem excluir o proprietário." });
      }
      if (body.user_id === callerId) {
        return json(400, { error: "Não pode excluir a si mesmo." });
      }

      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    case "updateUserPermissions": {
      const targetRole = await getTargetRole(body.user_id);
      // Admin cannot update owner's permissions
      if (callerRole !== "owner" && targetRole === "owner") {
        return json(403, { error: "Sem permissão para alterar permissões do proprietário." });
      }
      const { error } = await admin
        .from("user_roles")
        .update({ can_create_demands: body.can_create_demands })
        .eq("user_id", body.user_id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    case "updateUser": {
      const targetRole = await getTargetRole(body.user_id);
      // Admin cannot edit owner
      if (callerRole !== "owner" && targetRole === "owner") {
        return json(403, { error: "Sem permissão para editar informações do proprietário." });
      }

      const updatePayload: any = {};
      if (body.email) updatePayload.email = body.email;
      if (body.password) updatePayload.password = body.password;
      if (body.name) {
        updatePayload.user_metadata = { name: body.name };
      }

      const { error } = await admin.auth.admin.updateUserById(body.user_id, updatePayload);
      if (error) return json(400, { error: error.message });

      // Sync with profiles table
      const profileUpdate: any = {};
      if (body.name) profileUpdate.name = body.name;
      if (body.email) profileUpdate.email = body.email;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: pe } = await admin.from("profiles").update(profileUpdate).eq("id", body.user_id);
        if (pe) return json(400, { error: pe.message });
      }

      return json(200, { ok: true });
    }
  }
  return json(400, { error: "Unknown action" });
});
