// create-user — privileged user provisioning.
//
// Sprint A / Task 2. Closes WOODLANDS_AUDIT_2.md §4.4 (CRITICAL): this
// function previously performed ZERO authorization, so anyone who could reach
// the URL could mint an `owner` account. AddUserTab.jsx additionally sent the
// public anon key as the bearer token, so the platform's own `verify_jwt`
// gate was satisfied by a credential every visitor already holds.
//
// Authorization chain now enforced, in order:
//   1. Authorization: Bearer <token> must be present          -> 401
//   2. The token must verify server-side via auth.getUser()   -> 401
//   3. The caller's user_profiles.role must be 'owner'        -> 403
//      (and their profile must not be deactivated)            -> 403
//   4. The request body must validate, with `role` restricted
//      to the four roles in src/lib/roles.js                  -> 400
// Only then is auth.admin.createUser called.
//
// The service role key stays server-side (Deno.env), which was already
// correct here and is unchanged.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deployed origin only. Not '*' — this endpoint creates privileged accounts.
const ALLOWED_ORIGIN = 'https://woodlands-beta.vercel.app'

// Authoritative in src/lib/roles.js (APP_ROLES). Kept in sync MANUALLY — Deno
// cannot import a browser module, so this is a deliberate duplicate and both
// lists must change together (standards.md §9). A role that is not on this
// list cannot be assigned, whatever the request body says.
// Phase 2, 11 August 2026: manager -> admin; kitchen_manager and
// restaurant_manager removed; department_head and hr added.
const ALLOWED_ROLES = ['owner', 'admin', 'department_head', 'hr']

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function optional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ---- 1. Bearer token present -------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // ---- 2. Token verifies server-side -------------------------------------
  // Rejects the anon key: it carries no `sub` claim, so getUser fails.
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // ---- 3. Caller is an active owner --------------------------------------
  const { data: callerProfile, error: profileLookupErr } = await admin
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', caller.user.id)
    .maybeSingle()

  if (profileLookupErr) {
    return jsonResponse({ error: 'Could not verify caller' }, 500)
  }
  if (!callerProfile || callerProfile.role !== 'owner' || callerProfile.is_active === false) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  // ---- 4. Validate body ---------------------------------------------------
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const email     = nonEmpty(body.email)
  const password  = nonEmpty(body.password)
  const full_name = nonEmpty(body.full_name)
  const role      = nonEmpty(body.role)

  if (!email || !password || !full_name || !role) {
    return jsonResponse(
      { error: 'email, password, full_name, and role are required' }, 400
    )
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400
    )
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'password must be at least 6 characters' }, 400)
  }

  const department = optional(body.department)
  const shift_name = optional(body.shift_name)
  const bar_week   = optional(body.bar_week)

  // ---- 5. Provision -------------------------------------------------------
  try {
    const { data, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) throw authError

    const { error: profileErr } = await admin.from('user_profiles').insert({
      id: data.user.id,
      full_name,
      email,
      role,
      department,
      shift_name,
      bar_week,
      is_active: true,
    })
    if (profileErr) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw profileErr
    }

    return jsonResponse({ user: data.user }, 200)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 400)
  }
})
