import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { email, password, full_name, role, department, shift_name, bar_week } = body

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: 'email, password, full_name, and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) throw authError

    const { error: profileErr } = await supabaseAdmin.from('user_profiles').insert({
      id:         data.user.id,
      full_name,
      email,
      role,
      department: department && department.trim() !== '' ? department : null,
      shift_name: shift_name && shift_name.trim() !== '' ? shift_name : null,
      bar_week:   bar_week && bar_week.trim() !== '' ? bar_week : null,
      is_active:  true,
    })
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      throw profileErr
    }

    return new Response(
      JSON.stringify({ user: data.user }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
