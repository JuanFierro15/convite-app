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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      event_members: {
        Row: {
          event_id: string
          role: string
          user_id: string
        }
        Insert: {
          event_id: string
          role: string
          user_id: string
        }
        Update: {
          event_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          budget_cop: number | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          map_url: string | null
          name: string
          rsvp_deadline: string
          starts_at: string
          team_id: string | null
          theme_id: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
          welcome_message: string | null
        }
        Insert: {
          budget_cop?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          map_url?: string | null
          name: string
          rsvp_deadline: string
          starts_at: string
          team_id?: string | null
          theme_id?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          welcome_message?: string | null
        }
        Update: {
          budget_cop?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          map_url?: string | null
          name?: string
          rsvp_deadline?: string
          starts_at?: string
          team_id?: string | null
          theme_id?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount_cop: number
          created_at: string
          event_id: string
          expense_id: string
          id: string
          paid_by_profile_id: string
          paid_on: string
        }
        Insert: {
          amount_cop: number
          created_at?: string
          event_id: string
          expense_id: string
          id?: string
          paid_by_profile_id: string
          paid_on?: string
        }
        Update: {
          amount_cop?: number
          created_at?: string
          event_id?: string
          expense_id?: string
          id?: string
          paid_by_profile_id?: string
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_same_event"
            columns: ["expense_id", "event_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "expense_payments_paid_by_profile_id_fkey"
            columns: ["paid_by_profile_id"]
            isOneToOne: false
            referencedRelation: "team_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cop: number
          category_id: string
          created_at: string
          description: string
          event_id: string
          id: string
          note: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cop: number
          category_id: string
          created_at?: string
          description: string
          event_id: string
          id?: string
          note?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cop?: number
          category_id?: string
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          note?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_same_event"
            columns: ["category_id", "event_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_task_same_event"
            columns: ["task_id", "event_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      gift_reservations: {
        Row: {
          created_at: string
          event_id: string
          gift_id: string
          id: string
          invitation_id: string
          is_unique: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          gift_id: string
          id?: string
          invitation_id: string
          is_unique?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          gift_id?: string
          id?: string
          invitation_id?: string
          is_unique?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gift_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_reservations_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_reservations_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          kind: string
          max_reservations: number | null
          name: string
          sort_order: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          kind?: string
          max_reservations?: number | null
          name: string
          sort_order?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          kind?: string
          max_reservations?: number | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gifts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          arrived_at: string | null
          arrived_by: string | null
          created_at: string
          event_id: string
          full_name: string
          id: string
          invitation_id: string
          rsvp: string
          rsvp_updated_at: string | null
          sort_order: number
        }
        Insert: {
          arrived_at?: string | null
          arrived_by?: string | null
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          invitation_id: string
          rsvp?: string
          rsvp_updated_at?: string | null
          sort_order?: number
        }
        Update: {
          arrived_at?: string | null
          arrived_by?: string | null
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          invitation_id?: string
          rsvp?: string
          rsvp_updated_at?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          code: string
          created_at: string
          event_id: string
          group_name: string
          id: string
          kind: string
          phone: string | null
          updated_at: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          event_id: string
          group_name: string
          id?: string
          kind?: string
          phone?: string | null
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          group_name?: string
          id?: string
          kind?: string
          phone?: string | null
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string
          guest_id: string
          id: string
          invitation_id: string
          previous_rsvp: string | null
          rsvp: string
          source: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id: string
          guest_id: string
          id?: string
          invitation_id: string
          previous_rsvp?: string | null
          rsvp: string
          source: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string
          guest_id?: string
          id?: string
          invitation_id?: string
          previous_rsvp?: string | null
          rsvp?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_log_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_log_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_profile_id: string | null
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string
          event_id: string
          id: string
          note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_profile_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date: string
          event_id: string
          id?: string
          note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_profile_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string
          event_id?: string
          id?: string
          note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "team_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_profiles: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          team_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          team_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
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
      can_manage_profiles: { Args: { p_event_id: string }; Returns: boolean }
      delete_task: {
        Args: { p_delete_expense?: boolean; p_task_id: string }
        Returns: Json
      }
      get_gifts: { Args: { p_code: string }; Returns: Json }
      get_invitation: { Args: { p_code: string }; Returns: Json }
      list_rsvp_log: {
        Args: { p_event_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      record_arrivals: {
        Args: { p_arrivals: Json; p_event_id: string }
        Returns: Json
      }
      release_gift: {
        Args: { p_code: string; p_gift_id: string }
        Returns: Json
      }
      reserve_gift: {
        Args: { p_code: string; p_gift_id: string }
        Returns: Json
      }
      save_invitation: {
        Args: {
          p_event_id: string
          p_group_name: string
          p_guests: Json
          p_invitation_id: string
          p_kind?: string
          p_phone: string
        }
        Returns: Json
      }
      save_task: {
        Args: {
          p_assignee_profile_id: string
          p_due_date: string
          p_event_id: string
          p_expense?: Json
          p_expense_action?: string
          p_note: string
          p_task_id: string
          p_title: string
        }
        Returns: Json
      }
      set_rsvp: {
        Args: { p_code: string; p_guest_id: string; p_rsvp: string }
        Returns: Json
      }
      set_task_done: {
        Args: { p_done: boolean; p_task_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
