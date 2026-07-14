import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "collaborator";

export interface MyRole {
  userId: string | null;
  role: AppRole | null;
  canCreateDemands: boolean;
  isOwner: boolean;
  isAdminOrOwner: boolean;
  isFullAccess: boolean;
  isCollaborator: boolean;
  loading: boolean;
}

export function useMyRole(): MyRole {
  const { data, isLoading } = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;
      const { data: rr } = await supabase
        .from("user_roles")
        .select("role, can_create_demands")
        .eq("user_id", user.id)
        .maybeSingle();
      return {
        userId: user.id,
        role: (rr?.role ?? null) as AppRole | null,
        canCreateDemands: rr?.can_create_demands ?? true,
      };
    },
    staleTime: 60_000,
  });

  const role = data?.role ?? null;
  return {
    userId: data?.userId ?? null,
    role,
    canCreateDemands: data?.canCreateDemands ?? false,
    isOwner: role === "owner",
    isAdminOrOwner: role === "owner" || role === "admin",
    isFullAccess: role === "owner" || role === "admin",
    isCollaborator: role === "collaborator",
    loading: isLoading,
  };
}
