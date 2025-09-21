export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: string
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
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          type_id: number
          description: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          type_id?: number
          description?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}