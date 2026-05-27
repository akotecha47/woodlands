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
    console.log('[create-user] received body:', JSON.stringify(body))
    const { email, password, full_name, role, department } = body

    if (!email || !password || !full_name || !role) {
      console.log('[create-user] validation failed — missing fields:', { email: !!email, password: !!password, full_name: !!full_name, role: !!role })
      return new Response(
        JSON.stringify({ error: 'email, password, full_name, and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authErr) throw authErr

    const { error: profileErr } = await supabaseAdmin.from('user_profiles').insert({
      id:         authData.user.id,
      full_name,
      email,
      role,
      department: department || null,
      is_active:  true,
    })
    if (profileErr) {
      // Roll back the auth user if profile insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw profileErr
    }

    return new Response(
      JSON.stringify({ user: authData.user }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
