import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gttsjmxltrxxfplqjans.supabase.co'

// Add VITE_SUPABASE_SERVICE_ROLE_KEY to .env.local to enable admin user management.
// The service role key is found in Supabase Dashboard → Project Settings → API.
// NOTE: Keep this key secret — never commit .env.local. For production, move
// these admin operations to a Supabase Edge Function.
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? ''

export const hasAdminClient = Boolean(serviceRoleKey)

export const supabaseAdmin = hasAdminClient
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { storageKey: 'sb-admin-token', autoRefreshToken: false, persistSession: false },
    })
  : null
