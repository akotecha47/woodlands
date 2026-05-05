import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gttsjmxltrxxfplqjans.supabase.co'
const supabaseKey = 'sb_publishable_g4EcLtu7eED7aACKOMnxJw_Ou22iAtR'

export const supabase = createClient(supabaseUrl, supabaseKey)
