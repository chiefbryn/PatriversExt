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
      activity_log: {
        Row: {
          action: string
          created_at: string
          document_ref: string | null
          id: string
          ip_address: string | null
          module: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          document_ref?: string | null
          id?: string
          ip_address?: string | null
          module: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          document_ref?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          attendance_date: string
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          deduction_amount: number
          employee_id: string
          id: string
          minutes_late: number
          notes: string | null
          overtime_minutes: number
          shift_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          deduction_amount?: number
          employee_id: string
          id?: string
          minutes_late?: number
          notes?: string | null
          overtime_minutes?: number
          shift_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          deduction_amount?: number
          employee_id?: string
          id?: string
          minutes_late?: number
          notes?: string | null
          overtime_minutes?: number
          shift_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_credits: {
        Row: {
          amount: number
          amount_paid: number
          balance: number
          ceo_name: string
          ceo_user_id: string
          created_at: string
          id: string
          notes: string | null
          recorded_by: string
          recorded_by_name: string | null
          sale_id: string | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_paid?: number
          balance?: number
          ceo_name: string
          ceo_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by: string
          recorded_by_name?: string | null
          sale_id?: string | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          balance?: number
          ceo_name?: string
          ceo_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string
          recorded_by_name?: string | null
          sale_id?: string | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          auto_print: boolean | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          currency: string | null
          currency_position: string | null
          dark_mode: boolean | null
          date_format: string | null
          default_uom: string | null
          email: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          low_stock_threshold: number | null
          phone_primary: string | null
          phone_secondary: string | null
          receipt_copies: number | null
          receipt_footer: string | null
          receipt_header_color: string | null
          receipt_paper_size: string | null
          receipt_title: string | null
          reg_number: string | null
          region: string | null
          session_timeout: number | null
          show_logo_on_receipt: boolean | null
          show_logo_on_thermal: boolean | null
          show_pharmacist_on_receipt: boolean | null
          show_tagline_on_receipt: boolean | null
          tagline: string | null
          tax_number: string | null
          time_format: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          auto_print?: boolean | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          currency_position?: string | null
          dark_mode?: boolean | null
          date_format?: string | null
          default_uom?: string | null
          email?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          low_stock_threshold?: number | null
          phone_primary?: string | null
          phone_secondary?: string | null
          receipt_copies?: number | null
          receipt_footer?: string | null
          receipt_header_color?: string | null
          receipt_paper_size?: string | null
          receipt_title?: string | null
          reg_number?: string | null
          region?: string | null
          session_timeout?: number | null
          show_logo_on_receipt?: boolean | null
          show_logo_on_thermal?: boolean | null
          show_pharmacist_on_receipt?: boolean | null
          show_tagline_on_receipt?: boolean | null
          tagline?: string | null
          tax_number?: string | null
          time_format?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          auto_print?: boolean | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          currency_position?: string | null
          dark_mode?: boolean | null
          date_format?: string | null
          default_uom?: string | null
          email?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          low_stock_threshold?: number | null
          phone_primary?: string | null
          phone_secondary?: string | null
          receipt_copies?: number | null
          receipt_footer?: string | null
          receipt_header_color?: string | null
          receipt_paper_size?: string | null
          receipt_title?: string | null
          reg_number?: string | null
          region?: string | null
          session_timeout?: number | null
          show_logo_on_receipt?: boolean | null
          show_logo_on_thermal?: boolean | null
          show_pharmacist_on_receipt?: boolean | null
          show_tagline_on_receipt?: boolean | null
          tagline?: string | null
          tax_number?: string | null
          time_format?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          device_key: string
          id: string
          last_seen_at: string | null
          last_sync_at: string | null
          name: string | null
          offline_access_until: string | null
          outlet_id: string | null
          platform: string | null
          registered_at: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_key: string
          id?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          name?: string | null
          offline_access_until?: string | null
          outlet_id?: string | null
          platform?: string | null
          registered_at?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_key?: string
          id?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          name?: string | null
          offline_access_until?: string | null
          outlet_id?: string | null
          platform?: string | null
          registered_at?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audit_log: {
        Row: {
          action: string
          created_at: string
          document_id: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string
        }
        Insert: {
          action: string
          created_at?: string
          document_id: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by: string
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_items: {
        Row: {
          amount: number
          batch_number: string | null
          created_at: string
          document_id: string
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          batch_number?: string | null
          created_at?: string
          document_id: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          batch_number?: string | null
          created_at?: string
          document_id?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          affects_accounting: boolean
          affects_stock: string
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          next_number: number
          prefix: string
          updated_at: string
        }
        Insert: {
          affects_accounting?: boolean
          affects_stock?: string
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          next_number?: number
          prefix: string
          updated_at?: string
        }
        Update: {
          affects_accounting?: boolean
          affects_stock?: string
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          next_number?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          amount: number
          amount_paid: number
          balance_due: number
          category: string
          client_id: string | null
          created_at: string
          customer_name: string | null
          device_id: string | null
          discount: number
          doc_number: string | null
          document_type_id: string | null
          external_ref: string | null
          id: string
          metadata: Json | null
          notes: string | null
          outlet_id: string | null
          payment_status: string
          period_date: string | null
          product_id: string | null
          quantity: number
          status: string
          sub_type: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          amount_paid?: number
          balance_due?: number
          category: string
          client_id?: string | null
          created_at?: string
          customer_name?: string | null
          device_id?: string | null
          discount?: number
          doc_number?: string | null
          document_type_id?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          outlet_id?: string | null
          payment_status?: string
          period_date?: string | null
          product_id?: string | null
          quantity?: number
          status?: string
          sub_type: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          balance_due?: number
          category?: string
          client_id?: string | null
          created_at?: string
          customer_name?: string | null
          device_id?: string | null
          discount?: number
          doc_number?: string | null
          document_type_id?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          outlet_id?: string | null
          payment_status?: string
          period_date?: string | null
          product_id?: string | null
          quantity?: number
          status?: string
          sub_type?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_schedule_overrides: {
        Row: {
          created_at: string
          day_of_week: number
          employee_id: string
          end_time: string | null
          grace_minutes: number | null
          half_day_after_minutes: number | null
          id: string
          is_off: boolean
          notes: string | null
          readiness_time: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          employee_id: string
          end_time?: string | null
          grace_minutes?: number | null
          half_day_after_minutes?: number | null
          id?: string
          is_off?: boolean
          notes?: string | null
          readiness_time?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          employee_id?: string
          end_time?: string | null
          grace_minutes?: number | null
          half_day_after_minutes?: number | null
          id?: string
          is_off?: boolean
          notes?: string | null
          readiness_time?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedule_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_salary: number
          created_at: string
          default_shift_id: string | null
          employee_code: string
          employment_status: string
          hire_date: string
          id: string
          notes: string | null
          phone: string | null
          position: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          default_shift_id?: string | null
          employee_code: string
          employment_status?: string
          hire_date?: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          default_shift_id?: string | null
          employee_code?: string
          employment_status?: string
          hire_date?: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_default_shift_id_fkey"
            columns: ["default_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          device_info: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          shift_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          shift_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          shift_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_snapshot_items: {
        Row: {
          batch_number: string | null
          cost_price: number
          expiry_date: string | null
          id: string
          product_id: string
          product_name: string
          quantity: number
          sales_price: number
          snapshot_id: string
          value_cost: number
          value_retail: number
        }
        Insert: {
          batch_number?: string | null
          cost_price?: number
          expiry_date?: string | null
          id?: string
          product_id: string
          product_name: string
          quantity?: number
          sales_price?: number
          snapshot_id: string
          value_cost?: number
          value_retail?: number
        }
        Update: {
          batch_number?: string | null
          cost_price?: number
          expiry_date?: string | null
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          sales_price?: number
          snapshot_id?: string
          value_cost?: number
          value_retail?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshot_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          captured_at: string
          id: string
          product_count: number
          shift_id: string
          snapshot_type: string
          total_cost_value: number
          total_quantity: number
          total_retail_value: number
        }
        Insert: {
          captured_at?: string
          id?: string
          product_count?: number
          shift_id: string
          snapshot_type: string
          total_cost_value?: number
          total_quantity?: number
          total_retail_value?: number
        }
        Update: {
          captured_at?: string
          id?: string
          product_count?: number
          shift_id?: string
          snapshot_type?: string
          total_cost_value?: number
          total_quantity?: number
          total_retail_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_variance_reports: {
        Row: {
          actual_closing: number
          adjustment_qty: number
          cost_impact: number
          created_at: string
          damage_qty: number
          expected_closing: number
          expired_qty: number
          id: string
          opening_qty: number
          product_id: string
          product_name: string
          retail_impact: number
          sales_qty: number
          shift_id: string
          status: string
          stock_in_qty: number
          transfer_qty: number
          variance: number
        }
        Insert: {
          actual_closing?: number
          adjustment_qty?: number
          cost_impact?: number
          created_at?: string
          damage_qty?: number
          expected_closing?: number
          expired_qty?: number
          id?: string
          opening_qty?: number
          product_id: string
          product_name: string
          retail_impact?: number
          sales_qty?: number
          shift_id: string
          status?: string
          stock_in_qty?: number
          transfer_qty?: number
          variance?: number
        }
        Update: {
          actual_closing?: number
          adjustment_qty?: number
          cost_impact?: number
          created_at?: string
          damage_qty?: number
          expected_closing?: number
          expired_qty?: number
          id?: string
          opening_qty?: number
          product_id?: string
          product_name?: string
          retail_impact?: number
          sales_qty?: number
          shift_id?: string
          status?: string
          stock_in_qty?: number
          transfer_qty?: number
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variance_reports_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      login_log: {
        Row: {
          attempted_at: string
          id: string
          ip_address: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      login_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      outlet_stock: {
        Row: {
          created_at: string
          id: string
          outlet_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          outlet_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          outlet_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_stock_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      overtime_records: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attendance_id: string | null
          created_at: string
          employee_id: string
          id: string
          minutes: number
          notes: string | null
          ot_date: string
          rate_per_hour: number
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          minutes?: number
          notes?: string | null
          ot_date?: string
          rate_per_hour?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          minutes?: number
          notes?: string | null
          ot_date?: string
          rate_per_hour?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_records_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      parked_sales: {
        Row: {
          cart_items: Json
          cashier_id: string
          created_at: string
          customer_name: string | null
          id: string
          reference: string
          total: number
        }
        Insert: {
          cart_items?: Json
          cashier_id: string
          created_at?: string
          customer_name?: string | null
          id?: string
          reference: string
          total?: number
        }
        Update: {
          cart_items?: Json
          cashier_id?: string
          created_at?: string
          customer_name?: string | null
          id?: string
          reference?: string
          total?: number
        }
        Relationships: []
      }
      payment_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          provider: string | null
          reference_format: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          provider?: string | null
          reference_format?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          provider?: string | null
          reference_format?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          document_id: string | null
          id: string
          outlet_id: string | null
          paid_at: string
          paid_by: string | null
          payment_type_id: string | null
          received_by: string | null
          reference: string | null
          sale_id: string | null
          status: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          outlet_id?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_type_id?: string | null
          received_by?: string | null
          reference?: string | null
          sale_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          outlet_id?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_type_id?: string | null
          received_by?: string | null
          reference?: string | null
          sale_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          id: string
          notes: string | null
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          notes?: string | null
          period: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          notes?: string | null
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payslips: {
        Row: {
          absent_days: number
          base_salary: number
          created_at: string
          employee_id: string
          full_day_deductions: number
          gross_salary: number
          half_day_deductions: number
          half_days: number
          id: string
          late_days: number
          late_deductions: number
          net_salary: number
          overtime_amount: number
          overtime_minutes: number
          payroll_run_id: string
          period: string
          present_days: number
          status: string
          total_deductions: number
          updated_at: string
          working_days: number
        }
        Insert: {
          absent_days?: number
          base_salary?: number
          created_at?: string
          employee_id: string
          full_day_deductions?: number
          gross_salary?: number
          half_day_deductions?: number
          half_days?: number
          id?: string
          late_days?: number
          late_deductions?: number
          net_salary?: number
          overtime_amount?: number
          overtime_minutes?: number
          payroll_run_id: string
          period: string
          present_days?: number
          status?: string
          total_deductions?: number
          updated_at?: string
          working_days?: number
        }
        Update: {
          absent_days?: number
          base_salary?: number
          created_at?: string
          employee_id?: string
          full_day_deductions?: number
          gross_salary?: number
          half_day_deductions?: number
          half_days?: number
          id?: string
          late_days?: number
          late_deductions?: number
          net_salary?: number
          overtime_amount?: number
          overtime_minutes?: number
          payroll_run_id?: string
          period?: string
          present_days?: number
          status?: string
          total_deductions?: number
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          doctor_name: string
          id: string
          items: Json
          notes: string | null
          patient_name: string
          pharmacist_id: string | null
          prescription_number: string
          status: string
        }
        Insert: {
          created_at?: string
          doctor_name: string
          id?: string
          items?: Json
          notes?: string | null
          patient_name: string
          pharmacist_id?: string | null
          prescription_number: string
          status?: string
        }
        Update: {
          created_at?: string
          doctor_name?: string
          id?: string
          items?: Json
          notes?: string | null
          patient_name?: string
          pharmacist_id?: string | null
          prescription_number?: string
          status?: string
        }
        Relationships: []
      }
      price_list: {
        Row: {
          cost_price: number
          id: string
          margin_percent: number | null
          price_tier: string | null
          product_id: string
          selling_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_price?: number
          id?: string
          margin_percent?: number | null
          price_tier?: string | null
          product_id: string
          selling_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_price?: number
          id?: string
          margin_percent?: number | null
          price_tier?: string | null
          product_id?: string
          selling_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          batch_number: string | null
          category: string
          cost_price: number
          created_at: string
          expiry_date: string | null
          id: string
          indication: string | null
          name: string
          qty: number
          reorder_level: number
          sales_price: number
          status: string
          supplier_name: string | null
          uom: string
          wholesale_price: number
        }
        Insert: {
          batch_number?: string | null
          category?: string
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          indication?: string | null
          name: string
          qty?: number
          reorder_level?: number
          sales_price?: number
          status?: string
          supplier_name?: string | null
          uom?: string
          wholesale_price?: number
        }
        Update: {
          batch_number?: string | null
          category?: string
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          indication?: string | null
          name?: string
          qty?: number
          reorder_level?: number
          sales_price?: number
          status?: string
          supplier_name?: string | null
          uom?: string
          wholesale_price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_login: string | null
          must_change_password: boolean
          otp_email: string | null
          otp_enabled: boolean
          outlet_id: string | null
          phone: string | null
          status: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_login?: string | null
          must_change_password?: boolean
          otp_email?: string | null
          otp_enabled?: boolean
          outlet_id?: string | null
          phone?: string | null
          status?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_login?: string | null
          must_change_password?: boolean
          otp_email?: string | null
          otp_enabled?: boolean
          outlet_id?: string | null
          phone?: string | null
          status?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          notes: string | null
          outlet_id: string | null
          product_name: string
          quantity_needed: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          urgency: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          outlet_id?: string | null
          product_name: string
          quantity_needed?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          outlet_id?: string | null
          product_name?: string
          quantity_needed?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          discount: number
          id: string
          line_total: number
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          discount?: number
          id?: string
          line_total?: number
          product_id: string
          quantity?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          discount?: number
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_tendered: number | null
          cashier_id: string
          change_due: number | null
          client_id: string | null
          created_at: string
          customer_name: string | null
          device_id: string | null
          discount: number
          id: string
          invoice_number: string
          notes: string | null
          outlet_id: string | null
          payment_method: string
          prescription_id: string | null
          sale_type: string
          status: string
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          amount_tendered?: number | null
          cashier_id: string
          change_due?: number | null
          client_id?: string | null
          created_at?: string
          customer_name?: string | null
          device_id?: string | null
          discount?: number
          id?: string
          invoice_number: string
          notes?: string | null
          outlet_id?: string | null
          payment_method?: string
          prescription_id?: string | null
          sale_type?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Update: {
          amount_tendered?: number | null
          cashier_id?: string
          change_due?: number | null
          client_id?: string | null
          created_at?: string
          customer_name?: string | null
          device_id?: string | null
          discount?: number
          id?: string
          invoice_number?: string
          notes?: string | null
          outlet_id?: string | null
          payment_method?: string
          prescription_id?: string | null
          sale_type?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_configs: {
        Row: {
          created_at: string
          end_time: string
          grace_minutes: number
          half_day_after_minutes: number
          id: string
          is_active: boolean
          late_tiers: Json
          name: string
          overtime_rate_per_hour: number
          readiness_time: string
          sort_order: number
          start_time: string
          updated_at: string
          working_days_per_month: number
        }
        Insert: {
          created_at?: string
          end_time: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_tiers?: Json
          name: string
          overtime_rate_per_hour?: number
          readiness_time: string
          sort_order?: number
          start_time: string
          updated_at?: string
          working_days_per_month?: number
        }
        Update: {
          created_at?: string
          end_time?: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_tiers?: Json
          name?: string
          overtime_rate_per_hour?: number
          readiness_time?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Relationships: []
      }
      shift_handovers: {
        Row: {
          handed_over_at: string
          id: string
          incoming_shift_id: string
          incoming_user_id: string
          incoming_user_name: string
          inventory_cost_value: number
          inventory_quantity: number
          inventory_retail_value: number
          notes: string | null
          outgoing_shift_id: string
          outgoing_user_id: string
          outgoing_user_name: string
        }
        Insert: {
          handed_over_at?: string
          id?: string
          incoming_shift_id: string
          incoming_user_id: string
          incoming_user_name: string
          inventory_cost_value?: number
          inventory_quantity?: number
          inventory_retail_value?: number
          notes?: string | null
          outgoing_shift_id: string
          outgoing_user_id: string
          outgoing_user_name: string
        }
        Update: {
          handed_over_at?: string
          id?: string
          incoming_shift_id?: string
          incoming_user_id?: string
          incoming_user_name?: string
          inventory_cost_value?: number
          inventory_quantity?: number
          inventory_retail_value?: number
          notes?: string | null
          outgoing_shift_id?: string
          outgoing_user_id?: string
          outgoing_user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_incoming_shift_id_fkey"
            columns: ["incoming_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_outgoing_shift_id_fkey"
            columns: ["outgoing_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_sessions: {
        Row: {
          closing_snapshot_id: string | null
          created_at: string
          device_info: string | null
          ended_at: string | null
          handover_from_shift_id: string | null
          handover_to_shift_id: string | null
          id: string
          ip_address: string | null
          notes: string | null
          opening_snapshot_id: string | null
          role: string
          shift_code: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          closing_snapshot_id?: string | null
          created_at?: string
          device_info?: string | null
          ended_at?: string | null
          handover_from_shift_id?: string | null
          handover_to_shift_id?: string | null
          id?: string
          ip_address?: string | null
          notes?: string | null
          opening_snapshot_id?: string | null
          role: string
          shift_code: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          closing_snapshot_id?: string | null
          created_at?: string
          device_info?: string | null
          ended_at?: string | null
          handover_from_shift_id?: string | null
          handover_to_shift_id?: string | null
          id?: string
          ip_address?: string | null
          notes?: string | null
          opening_snapshot_id?: string | null
          role?: string
          shift_code?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      stock: {
        Row: {
          cost_price: number
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string
          quantity: number
          reorder_level: number
          sales_price: number
          sku: string
          supplier_name: string | null
          uom: string
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id: string
          quantity?: number
          reorder_level?: number
          sales_price?: number
          sku: string
          supplier_name?: string | null
          uom?: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reorder_level?: number
          sales_price?: number
          sku?: string
          supplier_name?: string | null
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          count_id: string
          counted_qty: number | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          product_name: string
          system_qty: number
          updated_at: string
          variance: number
        }
        Insert: {
          count_id: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          system_qty?: number
          updated_at?: string
          variance?: number
        }
        Update: {
          count_id?: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          system_qty?: number
          updated_at?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          count_number: string
          counted_by: string
          counted_by_name: string | null
          created_at: string
          id: string
          item_count: number
          notes: string | null
          outlet_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          scope: string
          status: string
          submitted_at: string | null
          updated_at: string
          variance_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          count_number: string
          counted_by: string
          counted_by_name?: string | null
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          outlet_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          scope?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          variance_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          count_number?: string
          counted_by?: string
          counted_by_name?: string | null
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          outlet_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          scope?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          variance_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          client_id: string | null
          created_at: string
          document_id: string | null
          id: string
          movement_type: string
          outlet_id: string | null
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reason: string | null
          reference: string | null
          sale_id: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          movement_type: string
          outlet_id?: string | null
          product_id: string
          quantity: number
          quantity_after?: number
          quantity_before?: number
          reason?: string | null
          reference?: string | null
          sale_id?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          movement_type?: string
          outlet_id?: string | null
          product_id?: string
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reason?: string | null
          reference?: string | null
          sale_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_snapshots: {
        Row: {
          batch_number: string | null
          captured_at: string
          category: string | null
          cost_price: number
          cost_value: number
          expiry_date: string | null
          id: string
          product_id: string
          product_name: string
          quantity: number
          retail_value: number
          sales_price: number
          snapshot_date: string
          source: string
          supplier_name: string | null
          uom: string | null
        }
        Insert: {
          batch_number?: string | null
          captured_at?: string
          category?: string | null
          cost_price?: number
          cost_value?: number
          expiry_date?: string | null
          id?: string
          product_id: string
          product_name: string
          quantity?: number
          retail_value?: number
          sales_price?: number
          snapshot_date: string
          source?: string
          supplier_name?: string | null
          uom?: string | null
        }
        Update: {
          batch_number?: string | null
          captured_at?: string
          category?: string | null
          cost_price?: number
          cost_value?: number
          expiry_date?: string | null
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          retail_value?: number
          sales_price?: number
          snapshot_date?: string
          source?: string
          supplier_name?: string | null
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          from_outlet_id: string
          id: string
          notes: string | null
          product_id: string
          product_name: string
          quantity: number
          received_at: string | null
          received_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          requested_by_name: string | null
          status: string
          to_outlet_id: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          from_outlet_id: string
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          quantity: number
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          requested_by_name?: string | null
          status?: string
          to_outlet_id: string
          transfer_number?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          from_outlet_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          requested_by_name?: string | null
          status?: string
          to_outlet_id?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_outlet_id_fkey"
            columns: ["from_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_outlet_id_fkey"
            columns: ["to_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      symptom_log: {
        Row: {
          cashier_id: string
          created_at: string
          id: string
          products_added_to_cart: Json | null
          suggestions_returned: Json | null
          symptom_description: string
        }
        Insert: {
          cashier_id: string
          created_at?: string
          id?: string
          products_added_to_cart?: Json | null
          suggestions_returned?: Json | null
          symptom_description: string
        }
        Update: {
          cashier_id?: string
          created_at?: string
          id?: string
          products_added_to_cart?: Json | null
          suggestions_returned?: Json | null
          symptom_description?: string
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          client_id: string | null
          created_at: string
          details: Json | null
          device_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          outlet_id: string | null
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          outlet_id?: string | null
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          outlet_id?: string | null
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_files: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number
          file_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_document_payment: {
        Args: {
          p_amount: number
          p_document_id: string
          p_paid_by?: string
          p_payment_type_id: string
          p_reference?: string
          p_user_id: string
        }
        Returns: Json
      }
      assign_unassigned_to_outlet: {
        Args: { p_outlet_id: string }
        Returns: Json
      }
      auto_assign_uom_category: { Args: { p_force?: boolean }; Returns: Json }
      backfill_stock_snapshots: { Args: never; Returns: Json }
      bulk_delete_documents: { Args: { p_ids: string[] }; Returns: number }
      bulk_delete_products: { Args: { p_ids: string[] }; Returns: number }
      compute_attendance_status: {
        Args: { p_check_in: string; p_shift_id: string }
        Returns: Json
      }
      compute_attendance_status_for_emp: {
        Args: { p_check_in: string; p_employee_id: string; p_shift_id: string }
        Returns: Json
      }
      compute_payslip: {
        Args: { p_employee_id: string; p_period: string; p_run_id: string }
        Returns: string
      }
      compute_shift_variance: { Args: { p_shift_id: string }; Returns: number }
      confirm_document: {
        Args: { p_document_id: string; p_user_id: string }
        Returns: Json
      }
      count_unassigned_records: { Args: never; Returns: Json }
      create_stock_count: {
        Args: {
          p_notes?: string
          p_outlet_id: string
          p_product_ids?: string[]
          p_scope?: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      end_shift: { Args: { p_shift_id?: string }; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_payroll_run: { Args: { p_period: string }; Returns: Json }
      get_active_shift: { Args: { p_user_id: string }; Returns: string }
      get_email_by_username: { Args: { _username: string }; Returns: string }
      get_next_doc_number: { Args: { p_type_code: string }; Returns: string }
      get_user_outlet: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_ceo_users: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      log_document_activity: {
        Args: {
          p_action: string
          p_document_id: string
          p_new_values?: Json
          p_old_values?: Json
          p_performed_by: string
        }
        Returns: string
      }
      mark_device_synced: { Args: { p_device_key: string }; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pick_shift_for_time: { Args: { p_ts: string }; Returns: string }
      process_document: {
        Args: {
          p_category: string
          p_customer_name?: string
          p_external_ref?: string
          p_items?: Json
          p_notes?: string
          p_sub_type: string
          p_user_id: string
        }
        Returns: Json
      }
      process_sale: {
        Args: {
          p_amount_tendered?: number
          p_cashier_id: string
          p_client_id?: string
          p_created_at?: string
          p_customer_name?: string
          p_device_id?: string
          p_discount?: number
          p_items?: Json
          p_notes?: string
          p_outlet_id?: string
          p_payment_method?: string
          p_prescription_id?: string
          p_sale_type?: string
        }
        Returns: Json
      }
      product_availability: {
        Args: { p_search?: string }
        Returns: {
          category: string
          expiry_date: string
          outlet_code: string
          outlet_id: string
          outlet_name: string
          product_id: string
          product_name: string
          quantity: number
          sales_price: number
          total_qty: number
          uom: string
          updated_at: string
        }[]
      }
      purge_attendance: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      purge_payroll: { Args: { p_period?: string }; Returns: Json }
      purge_shift_history: { Args: { p_before: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_document_totals: {
        Args: { p_document_id: string }
        Returns: Json
      }
      record_check_in: { Args: never; Returns: Json }
      record_check_out: { Args: never; Returns: Json }
      register_offline_device: {
        Args: { p_device_key: string; p_name?: string; p_platform?: string }
        Returns: Json
      }
      request_stock_transfer: {
        Args: {
          p_from_outlet_id: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_to_outlet_id: string
        }
        Returns: Json
      }
      reset_system_data: { Args: never; Returns: Json }
      respond_stock_count: {
        Args: { p_action: string; p_count_id: string; p_reason?: string }
        Returns: Json
      }
      respond_stock_transfer: {
        Args: { p_action: string; p_reason?: string; p_transfer_id: string }
        Returns: Json
      }
      set_overtime_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      start_shift: { Args: { p_device?: string; p_ip?: string }; Returns: Json }
      submit_stock_count: { Args: { p_count_id: string }; Returns: Json }
      sync_offline_document: {
        Args: {
          p_amount?: number
          p_category: string
          p_client_id?: string
          p_created_at?: string
          p_customer_name?: string
          p_device_id?: string
          p_discount?: number
          p_document_type_id?: string
          p_external_ref?: string
          p_items?: Json
          p_metadata?: Json
          p_notes?: string
          p_outlet_id?: string
          p_sub_type: string
          p_tax?: number
          p_user_id: string
        }
        Returns: Json
      }
      take_shift_snapshot: {
        Args: { p_shift_id: string; p_type: string }
        Returns: string
      }
      take_stock_snapshot: {
        Args: { p_date?: string; p_source?: string }
        Returns: Json
      }
      upsert_attendance: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_date: string
          p_employee_id: string
          p_notes: string
          p_shift_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "ceo" | "pharmacist" | "cashier"
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
    Enums: {
      app_role: ["admin", "ceo", "pharmacist", "cashier"],
    },
  },
} as const
