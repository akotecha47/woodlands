// Attendance seed — run AFTER migration 010 has been applied in Supabase Studio
// Usage: node scripts/seed-attendance.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gttsjmxltrxxfplqjans.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dHNqbXhsdHJ4eGZwbHFqYW5zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk3NjAyMSwiZXhwIjoyMDkzNTUyMDIxfQ.z4-L1LSe6GElhrVAHfZOeSWa1PVQrH7tpr8spSw417I'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function dateStr(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function pickStatus(userIdx, dayOffset) {
  const mod = (dayOffset + userIdx) % 7
  if (mod === 5) return 'absent'
  if (mod === 6) return 'late'
  return 'present'
}

function clockTimes(day, status) {
  if (status === 'absent') return { clock_in: null, clock_out: null }
  const inT  = status === 'late' ? '08:45:00' : '08:00:00'
  const outT = status === 'late' ? '17:30:00' : '17:00:00'
  return {
    clock_in:  new Date(`${day}T${inT}+02:00`).toISOString(),
    clock_out: new Date(`${day}T${outT}+02:00`).toISOString(),
  }
}

async function main() {
  // Guard: confirm user_id column exists
  const { error: probe } = await db.from('attendance_records').select('user_id').limit(0)
  if (probe) {
    console.error('user_id column missing. Run supabase/seed.sql in Supabase Studio SQL Editor first.')
    process.exit(1)
  }

  const { data: users, error: usersErr } = await db
    .from('user_profiles')
    .select('id, full_name, department, role')
    .not('role', 'in', '("owner","manager")')
    .order('full_name')

  if (usersErr) { console.error('Fetch users:', usersErr.message); process.exit(1) }
  if (!users?.length) { console.log('No eligible users found.'); return }

  console.log(`Seeding 7 days for ${users.length} user(s)…`)

  const today  = dateStr(0)
  const oldest = dateStr(-6)
  await db.from('attendance_records').delete().gte('shift_date', oldest).lte('shift_date', today)

  const rows = []
  users.forEach((u, idx) => {
    for (let off = 0; off <= 6; off++) {
      const day    = dateStr(-off)
      const status = pickStatus(idx, off)
      rows.push({ user_id: u.id, shift_date: day, status, ...clockTimes(day, status) })
    }
  })

  const BATCH = 50
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from('attendance_records').insert(rows.slice(i, i + BATCH))
    if (error) { console.error('Insert error:', error.message); process.exit(1) }
    done += Math.min(BATCH, rows.length - i)
    process.stdout.write(`\r${done}/${rows.length} rows`)
  }

  const tally = rows.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a }, {})
  console.log(`\nDone. ${done} records: ${JSON.stringify(tally)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
