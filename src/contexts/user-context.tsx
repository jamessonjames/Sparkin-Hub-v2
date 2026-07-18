import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  currentUserRole: null,
  selectedUserId: null,
  setSelectedUserId: () => {},
  profiles: [],
  loading: true,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<AppRole | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

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

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email")
        .order("name", { ascending: true });
      setProfiles(profilesData ?? []);

      setLoading(false);
    }
    load();
  }, []);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentUserRole,
        selectedUserId,
        setSelectedUserId,
        profiles,
        loading,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
