export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_editions: {
        Row: {
          billing_month: number | null
          billing_year: number | null
          client_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          updated_at: string | null
        }
        Insert: {
          billing_month?: number | null
          billing_year?: number | null
          client_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          updated_at?: string | null
        }
        Update: {
          billing_month?: number | null
          billing_year?: number | null
          client_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_editions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_gems: {
        Row: {
          category: string
          client_id: string
          created_at: string | null
          gem_url: string
          id: string
          name: string
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string | null
          gem_url: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string | null
          gem_url?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_gems_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          access_active: boolean
          billing_model: Database["public"]["Enums"]["billing_model"]
          color: string | null
          commercial_notes: string | null
          contact_name: string | null
          created_at: string
          credits_enabled: boolean
          deleted_at: string | null
          email: string | null
          fixed_type: Database["public"]["Enums"]["fixed_type"] | null
          id: string
          internal_notes: string | null
          is_project: boolean | null
          monthly_value: number | null
          name: string
          parent_id: string | null
          password_hash: string | null
          phone: string | null
          require_password: boolean
          slug: string
          sort_order: number | null
          updated_at: string
          work_type_id: string | null
        }
        Insert: {
          access_active?: boolean
          billing_model?: Database["public"]["Enums"]["billing_model"]
          color?: string | null
          commercial_notes?: string | null
          contact_name?: string | null
          created_at?: string
          credits_enabled?: boolean
          deleted_at?: string | null
          email?: string | null
          fixed_type?: Database["public"]["Enums"]["fixed_type"] | null
          id?: string
          internal_notes?: string | null
          is_project?: boolean | null
          monthly_value?: number | null
          name: string
          parent_id?: string | null
          password_hash?: string | null
          phone?: string | null
          require_password?: boolean
          slug: string
          sort_order?: number | null
          updated_at?: string
          work_type_id?: string | null
        }
        Update: {
          access_active?: boolean
          billing_model?: Database["public"]["Enums"]["billing_model"]
          color?: string | null
          commercial_notes?: string | null
          contact_name?: string | null
          created_at?: string
          credits_enabled?: boolean
          deleted_at?: string | null
          email?: string | null
          fixed_type?: Database["public"]["Enums"]["fixed_type"] | null
          id?: string
          internal_notes?: string | null
          is_project?: boolean | null
          monthly_value?: number | null
          name?: string
          parent_id?: string | null
          password_hash?: string | null
          phone?: string | null
          require_password?: boolean
          slug?: string
          sort_order?: number | null
          updated_at?: string
          work_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_tiers: {
        Row: {
          extra_per_credit: number | null
          id: string
          max_credits: number | null
          min_credits: number
          price: number
          sort_order: number
        }
        Insert: {
          extra_per_credit?: number | null
          id?: string
          max_credits?: number | null
          min_credits: number
          price: number
          sort_order: number
        }
        Update: {
          extra_per_credit?: number | null
          id?: string
          max_credits?: number | null
          min_credits?: number
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          billing_model: string | null
          client_color: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          estimated_value: number | null
          id: string
          internal_notes: string | null
          name: string
          phone: string | null
          source: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          billing_model?: string | null
          client_color?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          name: string
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          billing_model?: string | null
          client_color?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      demand_comments: {
        Row: {
          author_label: string | null
          author_type: string
          author_user_id: string | null
          body: string
          created_at: string
          demand_id: string
          id: string
          is_internal: boolean | null
        }
        Insert: {
          author_label?: string | null
          author_type: string
          author_user_id?: string | null
          body: string
          created_at?: string
          demand_id: string
          id?: string
          is_internal?: boolean | null
        }
        Update: {
          author_label?: string | null
          author_type?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          demand_id?: string
          id?: string
          is_internal?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_comments_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_types: {
        Row: {
          created_at: string
          default_credits: number
          id: string
          name: string
          per_slide: boolean
        }
        Insert: {
          created_at?: string
          default_credits?: number
          id?: string
          name: string
          per_slide?: boolean
        }
        Update: {
          created_at?: string
          default_credits?: number
          id?: string
          name?: string
          per_slide?: boolean
        }
        Relationships: []
      }
      demands: {
        Row: {
          approved_credits: number | null
          assignee_user_id: string | null
          client_edition_id: string | null
          client_id: string
          created_at: string
          created_by_client: boolean
          created_by_user_id: string | null
          deleted_at: string | null
          demand_type_id: string | null
          description: string | null
          due_date: string | null
          estimated_credits: number
          estimated_hours: number | null
          id: string
          internal_notes: string | null
          is_manually_scheduled: boolean
          price: number | null
          priority: Database["public"]["Enums"]["demand_priority"]
          reference_month: string
          sort_order: number | null
          status: Database["public"]["Enums"]["demand_status"]
          status_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_credits?: number | null
          assignee_user_id?: string | null
          client_edition_id?: string | null
          client_id: string
          created_at?: string
          created_by_client?: boolean
          created_by_user_id?: string | null
          deleted_at?: string | null
          demand_type_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_credits?: number
          estimated_hours?: number | null
          id?: string
          internal_notes?: string | null
          is_manually_scheduled?: boolean
          price?: number | null
          priority?: Database["public"]["Enums"]["demand_priority"]
          reference_month?: string
          sort_order?: number | null
          status?: Database["public"]["Enums"]["demand_status"]
          status_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_credits?: number | null
          assignee_user_id?: string | null
          client_edition_id?: string | null
          client_id?: string
          created_at?: string
          created_by_client?: boolean
          created_by_user_id?: string | null
          deleted_at?: string | null
          demand_type_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_credits?: number
          estimated_hours?: number | null
          id?: string
          internal_notes?: string | null
          is_manually_scheduled?: boolean
          price?: number | null
          priority?: Database["public"]["Enums"]["demand_priority"]
          reference_month?: string
          sort_order?: number | null
          status?: Database["public"]["Enums"]["demand_status"]
          status_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demands_client_edition_id_fkey"
            columns: ["client_edition_id"]
            isOneToOne: false
            referencedRelation: "client_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_demand_type_id_fkey"
            columns: ["demand_type_id"]
            isOneToOne: false
            referencedRelation: "demand_types"
            referencedColumns: ["id"]
          },
        ]
      }
      file_attachments: {
        Row: {
          created_at: string | null
          created_by: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          category: string | null
          client_id: string | null
          created_at: string | null
          demand_id: string | null
          due_date: string
          id: string
          notes: string | null
          paid_value: number | null
          recipient_provider: string | null
          status: string
          title: string
          total_value: number
          type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          demand_id?: string | null
          due_date: string
          id?: string
          notes?: string | null
          paid_value?: number | null
          recipient_provider?: string | null
          status?: string
          title: string
          total_value: number
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          demand_id?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          paid_value?: number | null
          recipient_provider?: string | null
          status?: string
          title?: string
          total_value?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          client_id: string
          content: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          is_pinned: boolean
          note_type: Database["public"]["Enums"]["note_type"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          can_create_demands: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          can_create_demands?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          can_create_demands?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin" | "collaborator"
      billing_model: "fixed" | "credits" | "seasonal"
      demand_priority: "low" | "medium" | "high" | "urgent"
      demand_status:
        | "rascunho"
        | "nao_iniciado"
        | "fazendo"
        | "para_analise"
        | "com_ajustes"
        | "concluido"
      fixed_type: "monthly" | "one_off"
      note_type:
        | "reuniao"
        | "briefing"
        | "ideias"
        | "copy"
        | "planejamento"
        | "observacoes"
      note_visibility: "private" | "shared"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "collaborator"],
      billing_model: ["fixed", "credits", "seasonal"],
      demand_priority: ["low", "medium", "high", "urgent"],
      demand_status: [
        "rascunho",
        "nao_iniciado",
        "fazendo",
        "para_analise",
        "com_ajustes",
        "concluido",
      ],
      fixed_type: ["monthly", "one_off"],
      note_type: [
        "reuniao",
        "briefing",
        "ideias",
        "copy",
        "planejamento",
        "observacoes",
      ],
      note_visibility: ["private", "shared"],
    },
  },
} as const
