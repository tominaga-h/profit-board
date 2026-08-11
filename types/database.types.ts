// Supabase のリモートスキーマから自動生成した型定義。
//
// 生成コマンド:
//   make db-types
//
// ★ 手で編集しないこと。スキーマを変えたら再生成する。
//   マイグレーション（supabase/migrations/）が唯一の正であり、このファイルはその写像。
//
// ★ Drizzle 移行後、DB アクセスにはこの型を使わない（server/api/** は server/db/schema.ts を使う）。
//   composables/*.ts が API レスポンスの Row 型（AppUser / Member / Project 等）の
//   導出元としてのみ参照しているため、クライアント側の型定義として残存させている。

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      m_fiscal_years: {
        Row: {
          created_at: string
          id: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      m_projects: {
        Row: {
          company_name: string
          created_at: string
          id: number
          service_name: string
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: number
          service_name: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: number
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      m_users: {
        Row: {
          created_at: string
          email: string
          family_name: string
          first_name: string
          id: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          family_name: string
          first_name: string
          id?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          family_name?: string
          first_name?: string
          id?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      t_costs: {
        Row: {
          amount: number
          cost_type: string
          created_at: string
          fiscal_year: number
          id: number
          month: number
          project_id: number
          unit_price: number | null
          updated_at: string
          user_id: number | null
          work_days: number | null
          work_hours: number | null
        }
        Insert: {
          amount?: number
          cost_type?: string
          created_at?: string
          fiscal_year: number
          id?: number
          month: number
          project_id: number
          unit_price?: number | null
          updated_at?: string
          user_id?: number | null
          work_days?: number | null
          work_hours?: number | null
        }
        Update: {
          amount?: number
          cost_type?: string
          created_at?: string
          fiscal_year?: number
          id?: number
          month?: number
          project_id?: number
          unit_price?: number | null
          updated_at?: string
          user_id?: number | null
          work_days?: number | null
          work_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "t_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "m_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "t_costs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "m_users"
            referencedColumns: ["id"]
          },
        ]
      }
      t_sales: {
        Row: {
          amount: number
          category_small: string
          created_at: string
          fiscal_year: number
          id: number
          month: number
          project_id: number
          updated_at: string
        }
        Insert: {
          amount?: number
          category_small: string
          created_at?: string
          fiscal_year: number
          id?: number
          month: number
          project_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category_small?: string
          created_at?: string
          fiscal_year?: number
          id?: number
          month?: number
          project_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "t_sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "m_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      t_status: {
        Row: {
          created_at: string
          fiscal_year: number
          id: number
          month: number
          project_id: number
          remark: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fiscal_year: number
          id?: number
          month: number
          project_id: number
          remark?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fiscal_year?: number
          id?: number
          month?: number
          project_id?: number
          remark?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "t_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "m_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_app_user: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
