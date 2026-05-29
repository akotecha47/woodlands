/**
 * Attendance seed — realistic 7-day records
 * Run after seed.sql has been applied in Supabase Studio:
 *   node scripts/seed-attendance.mjs
 *
 * Per standards rule 12: no ON CONFLICT (check before insert), explicit date casts.
 * Per standards rule 1: uses supabaseAdmin (service role) to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gttsjmxltrxxfplqjans.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dHNqbXhsdHJ4eGZwbHFqYW5zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk3NjAyMSwiZXhwIjoyMDkzNTUyMDIxfQ.z4-L1LSe6GElhrVAHfZOeSWa1PVQrH7tpr8spSw417I'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Parse "HH:MM" or "HH:MM:SS" → { h, m }
function parseTime(str) {
  const [h, m] = (str ?? '').split(':').map(Number)
  return { h: h || 0, m: m || 0 }
}

// Build a timestamptz string for a given ISO date + hour/minute offset in Malawi time (UTC+2)
function toISO(dateStr, h, m) {
  const mm = String(m).padStart(2, '0')
  const hh = String(h).padStart(2, '0')
  return new Date(`${dateStr}T${hh}:${mm}:00+02:00`).toISOString()
}

// Add minutes to {h, m}
function addMins({ h, m }, mins) {
  const total = h * 60 + m + mins
  return { h: Math.floor(total / 60) % 24, m: total % 60 }
}

// ── shift lookup (mirrors AttendanceUI.getShiftForUser) ──────────────────────

function resolveShift(user, allShifts) {
  if (!user.department) return null
  const deptShifts = allShifts.filter(s => s.department === user.department)
  if (deptShifts.length === 0) return null

  const rotating = deptShifts.filter(s => s.shift_type === 'rotating')
  if (rotating.length > 0) {
    const week = user.bar_week ?? 'A'
    return rotating.find(s => s.shift_name === `Week ${week}`) ?? rotating[0]
  }

  if (user.shift_name) {
    const named = deptShifts.find(s => s.shift_name === user.shift_name)
    if (named) return named
  }
  return deptShifts[0]
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Guard: confirm user_id column exists
  const { error: probe } = await db.from('attendance_records').select('user_id').limit(0)
  if (probe) {
    console.error('Column user_id missing — run supabase/seed.sql in Supabase Studio first.')
    process.exit(1)
  }

  // Fetch users + shifts in parallel
  const [usersR, shiftsR] = await Promise.all([
    db.from('user_profiles')
      .select('id, full_name, department, role, shift_name, bar_week')
      .not('role', 'in', '("owner","manager")')
      .order('full_name'),
    db.from('shift_settings').select('*'),
  ])

  const users  = usersR.data ?? []
  const shifts = shiftsR.data ?? []

  if (!users.length) { console.log('No eligible users found.'); return }
  console.log(`Found ${users.length} staff, ${shifts.length} shift rules`)

  // Build the 7-day window (skip Sundays)
  const days = []
  for (let off = 6; off >= 0; off--) {
    const dateStr = isoDate(-off)
    const dow = new Date(dateStr + 'T12:00:00').getDay() // 0 = Sunday
    if (dow !== 0) days.push(dateStr)
  }
  console.log(`Seeding ${days.length} working days: ${days.join(', ')}`)

  // Fetch existing records so we can skip already-seeded slots (no ON CONFLICT per rule 12)
  const oldest = days[0]
  const newest = days[days.length - 1]
  const { data: existing } = await db
    .from('attendance_records')
    .select('user_id, shift_date')
    .gte('shift_date', oldest)
    .lte('shift_date', newest)

  const existingKeys = new Set(
    (existing ?? []).map(r => `${r.user_id}::${r.shift_date}`)
  )

  // Build inserts
  const DEFAULT_START = { h: 8, m: 30 }
  const DEFAULT_END   = { h: 16, m: 30 }
  const DEFAULT_THRESHOLD = 15

  const toInsert = []

  for (const user of users) {
    const shift = resolveShift(user, shifts)
    const startT = shift ? parseTime(shift.shift_start) : DEFAULT_START
    const endT   = shift ? parseTime(shift.shift_end)   : DEFAULT_END
    const lateThreshold = shift?.late_threshold ?? DEFAULT_THRESHOLD

    for (const day of days) {
      const key = `${user.id}::${day}`
      if (existingKeys.has(key)) continue

      // 5% chance: absent — no record
      if (Math.random() < 0.05) continue

      // 10% chance: late arrival (shift_start + 15..30 mins)
      // 90% chance: on time (shift_start - 0..10 mins)
      let clockInT
      let isLate
      if (Math.random() < 0.10) {
        const lateMins = rand(15, 30)
        clockInT = addMins(startT, lateMins)
        isLate = lateMins > lateThreshold
      } else {
        const earlyMins = rand(0, 10)
        clockInT = addMins(startT, -earlyMins)
        isLate = false
      }

      // Clock out: shift_end - 0..5 mins
      const earlyOutMins = rand(0, 5)
      const clockOutT = addMins(endT, -earlyOutMins)

      toInsert.push({
        user_id:       user.id,
        shift_date:    day,
        date:          day,   // satisfy legacy NOT NULL until migration drops it
        clock_in:      toISO(day, clockInT.h, clockInT.m),
        clock_out:     toISO(day, clockOutT.h, clockOutT.m),
        status:        isLate ? 'late' : 'present',
        within_radius: true,
      })
    }
  }

  if (!toInsert.length) {
    console.log('All slots already seeded — nothing to insert.')
    return
  }

  console.log(`Inserting ${toInsert.length} records…`)

  // Insert in batches of 50
  const BATCH = 50
  let done = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await db.from('attendance_records').insert(batch)
    if (error) {
      console.error(`Batch ${i}–${i + BATCH - 1} failed:`, error.message)
      process.exit(1)
    }
    done += batch.length
    process.stdout.write(`\r${done}/${toInsert.length} inserted…`)
  }

  const tally = toInsert.reduce((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1
    return a
  }, {})
  console.log(`\nDone. ${done} records: ${JSON.stringify(tally)}`)
  console.log(`Absent (skipped): ${users.length * days.length - toInsert.length - existingKeys.size} slots`)
}

main().catch(e => { console.error(e); process.exit(1) })
