import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listProfiles } from "@/lib/users.functions";

export type AppRole = "owner" | "admin" | "collaborator";

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  theme?: string;
  highlight_color?: string;
  custom_hex?: string;
  sidebar_order?: string[] | null;
}

interface UserContextValue {
  currentUser: any;
  currentUserRole: AppRole | null;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  defaultUserId: string | null;
  setDefaultUserId: (id: string | null) => void;
  profiles: Profile[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  sidebarOrder: string[] | null;
  setSidebarOrder: (order: string[] | null) => void;
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  currentUserRole: null,
  selectedUserId: null,
  setSelectedUserId: () => {},
  defaultUserId: null,
  setDefaultUserId: () => {},
  profiles: [],
  loading: true,
  refreshProfiles: async () => {},
  sidebarOrder: null,
  setSidebarOrder: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<AppRole | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [defaultUserId, setDefaultUserIdState] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOrder, setSidebarOrder] = useState<string[] | null>(null);
  const listProfilesFn = useServerFn(listProfiles);

  const setDefaultUserId = (id: string | null) => {
    setDefaultUserIdState(id);
    if (currentUser?.id && typeof window !== "undefined") {
      const key = `CreativeFlow_DefaultUserId_${currentUser.id}`;
      if (id) {
        localStorage.setItem(key, id);
      } else {
        localStorage.removeItem(key);
      }
    }
  };

  const refreshProfiles = async () => {
      try {
        const profilesData = await listProfilesFn();
        setProfiles(profilesData.map((p: any) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          theme: p.theme,
          highlight_color: p.highlight_color,
          custom_hex: p.custom_hex,
          sidebar_order: p.sidebar_order,
        })));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const currentProfile = profilesData.find((p: any) => p.id === user.id);
          if (currentProfile?.sidebar_order) {
            setSidebarOrder(currentProfile.sidebar_order);
          }
        }
      } catch {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, name, email")
          .order("name", { ascending: true });
        setProfiles((profilesData || []).map((p: any) => ({ id: p.id, name: p.name, email: p.email })) ?? []);
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

      // Read saved default user from localStorage
      if (typeof window !== "undefined") {
        const savedDefault = localStorage.getItem(`CreativeFlow_DefaultUserId_${user.id}`);
        if (savedDefault) {
          setDefaultUserIdState(savedDefault);
          setSelectedUserId(savedDefault);
        }
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const role = (roleData?.role as AppRole) ?? null;
      setCurrentUserRole(role);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("sidebar_order")
        .eq("id", user.id)
        .maybeSingle();
      if ((profileData as any)?.sidebar_order) {
        setSidebarOrder((profileData as any).sidebar_order as string[]);
      }

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
        defaultUserId,
        setDefaultUserId,
        profiles,
        loading,
        refreshProfiles,
        sidebarOrder,
        setSidebarOrder,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
