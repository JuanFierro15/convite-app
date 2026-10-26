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
          theme_id?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          welcome_message?: string | null
        }
        Relationships: []
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
      get_gifts: { Args: { p_code: string }; Returns: Json }
      get_invitation: { Args: { p_code: string }; Returns: Json }
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
      set_rsvp: {
        Args: { p_code: string; p_guest_id: string; p_rsvp: string }
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
