import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listProfiles } from "@/lib/users.functions";

export type AppRole = "owner" | "admin" | "collaborator";

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
}

interface UserContextValue {
  currentUser: any;
  currentUserRole: AppRole | null;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  profiles: Profile[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  currentUserRole: null,
  selectedUserId: null,
  setSelectedUserId: () => {},
  profiles: [],
  loading: true,
  refreshProfiles: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<AppRole | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const listProfilesFn = useServerFn(listProfiles);

  const refreshProfiles = async () => {
    try {
      const profilesData = await listProfilesFn();
      setProfiles(profilesData.map((p: any) => ({ id: p.id, name: p.name, email: p.email })));
    } catch {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email")
        .order("name", { ascending: true });
      setProfiles(profilesData ?? []);
    }
  };

  useEffect(() => {
    async function load() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUser(user);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const role = (roleData?.role as AppRole) ?? null;
      setCurrentUserRole(role);

      await refreshProfiles();

      setLoading(false);
    }
    load();
  }, [listProfilesFn]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentUserRole,
        selectedUserId,
        setSelectedUserId,
        profiles,
        loading,
        refreshProfiles,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
