export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: string
          name: string | null
          mobile: string | null
          building_name: string | null
          room_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role: string
          name?: string | null
          mobile?: string | null
          building_name?: string | null
          room_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: string
          name?: string | null
          mobile?: string | null
          building_name?: string | null
          room_number?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      complaint_types: {
        Row: {
          id: number
          name: string
          created_at: string
        }
        Insert: {
          name: string
          created_at?: string
        }
        Update: {
          name?: string
          created_at?: string
        }
      },
      complaints: {
        Row: {
          id: number
          tenant_id: string
          type_id: number
          description: string
          status: string
          image_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          type_id: number
          description: string
          status?: string
          image_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          type_id?: number
          description?: string
          status?: string
          image_path?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      complaint_assignments: {
        Row: {
          id: number
          complaint_id: number
          worker_id: string
          status: string
          assigned_by: string | null
          is_leader: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          complaint_id: number
          worker_id: string
          status?: string
          assigned_by?: string | null
          is_leader?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          complaint_id?: number
          worker_id?: string
          status?: string
          assigned_by?: string | null
          is_leader?: boolean | null
          created_at?: string
          updated_at?: string
        }
      },
      stores: {
        Row: { id: number; name: string; created_at: string }
        Insert: { name: string; created_at?: string }
        Update: { name?: string; created_at?: string }
      },
      materials: {
        Row: { id: number; name: string; created_at: string }
        Insert: { name: string; created_at?: string }
        Update: { name?: string; created_at?: string }
      },
      assignment_details: {
        Row: {
          assignment_id: number
          store_id: number | null
          time_in: string | null
          time_out: string | null
          needs_revisit: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          assignment_id: number
          store_id?: number | null
          time_in?: string | null
          time_out?: string | null
          needs_revisit?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: number
          store_id?: number | null
          time_in?: string | null
          time_out?: string | null
          needs_revisit?: boolean | null
          created_at?: string
          updated_at?: string
        }
      },
      assignment_materials: {
        Row: { assignment_id: number; material_id: number }
        Insert: { assignment_id: number; material_id: number }
        Update: { assignment_id?: number; material_id?: number }
      },
      assignment_visits: {
        Row: {
          id: number
          assignment_id: number
          store_id: number | null
          time_in: string | null
          time_out: string | null
          outcome: 'completed' | 'revisit' | null
          created_at: string
          created_by: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: number
          store_id?: number | null
          time_in?: string | null
          time_out?: string | null
          outcome?: 'completed' | 'revisit' | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: number
          store_id?: number | null
          time_in?: string | null
          time_out?: string | null
          outcome?: 'completed' | 'revisit' | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
        }
      },
      assignment_visit_materials: {
        Row: { visit_id: number; material_id: number }
        Insert: { visit_id: number; material_id: number }
        Update: { visit_id?: number; material_id?: number }
      }
    },
    Views: {
      assignment_visits_latest: {
        Row: {
          visit_id: number
          assignment_id: number
          store_id: number | null
          time_in: string | null
          time_out: string | null
          needs_revisit: boolean | null
          created_at: string
        }
      }
    }
  }
}