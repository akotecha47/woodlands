import { createClient } from '@supabase/supabase-js'

console.log('KEY LENGTH:', import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.length)

export const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
)
