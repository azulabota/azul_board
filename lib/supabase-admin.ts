import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasSupabaseAdminEnv = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)

const assertEnv = () => {
  if (!hasSupabaseAdminEnv || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables for admin API routes')
  }
}

export const createSupabaseAdminClient = () => {
  assertEnv()
  return createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

export const createSupabaseUserClient = (token: string) => {
  assertEnv()
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  })
}
