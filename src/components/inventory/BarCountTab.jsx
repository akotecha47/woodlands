import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { EmptyRow, TdBold, todayStr } from './InventoryUI'
import { postBarCount } from '../../lib/stock'
import { MANAGE_ROLES } from '../../lib/roles'

/**
 * End-of-day bar count (FUNCTIONAL_SPEC §3, migration 059).
 *
 * The bartender counts the shelf at close. Posting the count reconciles the
 * bar's balance to what was physically counted AND raises a pre-filled refill
 * requisition for everything below par — one transaction, server-side.
 *
 * The count input is PRE-FILLED with the system balance, so the common case is
 * confirming a number rather than composing one. That matters: the whole point
 * of the feature is "confirm a pre-filled request, don't compose one".
 *
 * Only par-managed locations appear. A location with no par_level rows is not
 * on the par cycle, which today means everything except Main Bar and Sports
 * Bar. A department_head is pinned to their own bar; owner/admin pick one.
 */
export default function BarCountTab() {
  const { profile, session } = useAuth()
  const isManager = MANAGE_ROLES.includes(profile?.role)

  const [locations, setLocations] = useState([])
  const [location,  setLocation]  = useState('')
  const [date,      setDate]      = useState(todayStr())
  const [rows,      setRows]      = useState([])
  const [counts,    setCounts]    = useState({})   // stock_item_id -> string
  const [recent,    setRecent]    = useState([])
  const [busy,      setBusy]      = useState(false)
  const [result,    setResult]    = useState(null)
  const [toast,     setToast]     = useState(null)
  const flash = useFlash(setToast)

  // Par-managed locations, derived from the data rather than hard-coded: a
  // location is on the cycle exactly when it has par levels set. When the bar
  // heads supply real par values for another department, it appears here with
  // no code change.
  async function fetchLocations() {
    const { data, error } = await supabase
      .from('current_stock')
      .select('location')
      .not('par_level', 'is', null)
    if (error) { flash(error.message, false); return }
    const names = [...new Set((data ?? []).map(r => r.location))].sort()
    setLocations(names)
    // A head has exactly one; pin it rather than make them choose.
    if (!isManager && profile?.department && names.includes(profile.department)) {
      setLocation(profile.department)
    } else if (names.length === 1) {
      setLocation(names[0])
    }
  }

  async function fetchRows(loc) {
    if (!loc) { setRows([]); return }
    const { data, error } = await supabase
      .from('current_stock')
      .select('stock_item_id, quantity, par_level, sub_location, stock_items(name, sku, unit)')
      .eq('location', loc)
      .not('par_level', 'is', null)
    if (error) { flash(error.message, false); return }
    const flat = (data ?? [])
      .map(r => ({
        stock_item_id: r.stock_item_id,
        name:          r.stock_items?.name ?? '—',
        sku:           r.stock_items?.sku ?? '—',
        unit:          r.stock_items?.unit ?? '',
        quantity:      Number(r.quantity),
        par_level:     Number(r.par_level),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    setRows(flat)
    // Pre-fill every input with the system balance.
    setCounts(Object.fromEntries(flat.map(r => [r.stock_item_id, String(r.quantity)])))
  }

  async function fetchRecent() {
    const { data } = await supabase
      .from('bar_count_sessions')
      .select('id, location, business_date, status, posted_at')
      .order('business_date', { ascending: false })
      .limit(8)
    setRecent(data ?? [])
  }

  useEffect(() => { fetchLocations(); fetchRecent() }, [profile?.role, profile?.department])
  useEffect(() => { fetchRows(location); setResult(null) }, [location])

  // Live preview of what posting will raise, computed the same way the server
  // does it: shortfall = max(par - counted, 0).
  const preview = useMemo(() => {
    let short = 0, units = 0
    for (const r of rows) {
      const c = counts[r.stock_item_id]
      const counted = c === '' || c == null ? null : Number(c)
      if (counted == null || Number.isNaN(counted)) continue
      const s = Math.max(r.par_level - counted, 0)
      if (s > 0) { short += 1; units += s }
    }
    return { short, units }
  }, [rows, counts])

  async function handlePost() {
    if (!location) { flash('Pick a location first', false); return }
    const lines = rows
      .map(r => ({ stock_item_id: r.stock_item_id, counted_qty: counts[r.stock_item_id] }))
      .filter(l => l.counted_qty !== '' && l.counted_qty != null && !Number.isNaN(Number(l.counted_qty)))
      .map(l => ({ ...l, counted_qty: Number(l.counted_qty) }))

    if (lines.length === 0) { flash('Nothing counted', false); return }
    if (lines.some(l => l.counted_qty < 0)) { flash('A count cannot be negative', false); return }

    setBusy(true)
    try {
      // One draft session per (location, date) — the table enforces it, so a
      // re-count on the same night reuses the existing draft rather than
      // silently creating a second one.
      let sessionId
      const { data: existing } = await supabase
        .from('bar_count_sessions')
        .select('id, status')
        .eq('location', location)
        .eq('business_date', date)
        .maybeSingle()

      if (existing?.status === 'posted') {
        throw new Error(`${location} has already been counted for ${date}. A posted count cannot be re-posted.`)
      }

      if (existing) {
        sessionId = existing.id
        const { error } = await supabase.from('bar_count_lines').delete().eq('session_id', sessionId)
        if (error) throw error
      } else {
        const { data: created, error } = await supabase
          .from('bar_count_sessions')
          .insert({
            location,
            business_date: date,
            counted_by:    session.user.id,
            status:        'draft',
          })
          .select('id')
          .single()
        if (error) throw error
        sessionId = created.id
      }

      const { error: lineErr } = await supabase
        .from('bar_count_lines')
        .insert(lines.map(l => ({ ...l, session_id: sessionId })))
      if (lineErr) throw lineErr

      // Everything that touches stock happens inside this one call.
      const res = await postBarCount(sessionId)
      setResult(res)
      flash(`Count posted — ${res.requisitions_raised} refill requisition(s) raised`)
      fetchRows(location)
      fetchRecent()
    } catch (err) {
      flash(err.message, false)
    } finally {
      setBusy(false)
    }
  }

  const belowPar = r => {
    const c = counts[r.stock_item_id]
    if (c === '' || c == null || Number.isNaN(Number(c))) return false
    return Number(c) < r.par_level
  }

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />

      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">End-of-Day Bar Count</h2>
        <p className="text-sm text-gray-500 mb-4">
          Count the shelf, then post. Posting sets the bar's stock to what you counted
          and raises a refill requisition for everything below par.
        </p>

        <div className="flex flex-wrap gap-4 items-end">
          <Field label="Bar">
            {isManager ? (
              <Sel value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Select bar…</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </Sel>
            ) : (
              <input disabled value={location || '—'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
            )}
          </Field>
          <Field label="Business date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          </Field>
          <button
            onClick={handlePost}
            disabled={busy || !location || rows.length === 0}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {busy ? 'Posting…' : 'Post Count'}
          </button>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            <span className="font-medium text-gray-800">{preview.short}</span> item(s) below par
            {preview.short > 0 && <> — <span className="font-medium text-gray-800">{preview.units}</span> unit(s) will be requisitioned</>}
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            Posted {result.location} for {result.business_date}: {result.lines_counted} item(s) counted,{' '}
            {result.requisitions_raised} refill requisition(s) raised for {result.units_requested} unit(s).
            {result.requisitions_raised > 0 && <> Approve and fulfil them on the <span className="font-medium">Requisitions</span> tab.</>}
          </div>
        )}
      </div>

      {/* ── the count sheet ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Item</Th><Th>SKU</Th><Th>Unit</Th>
                <Th>System</Th><Th>Par</Th><Th>Counted</Th><Th>Shortfall</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const c = counts[r.stock_item_id]
                const counted = c === '' || c == null || Number.isNaN(Number(c)) ? null : Number(c)
                const shortfall = counted == null ? null : Math.max(r.par_level - counted, 0)
                return (
                  <tr key={r.stock_item_id} className={`border-b border-gray-100 last:border-0 ${belowPar(r) ? 'bg-amber-50/60' : 'hover:bg-gray-50'}`}>
                    <TdBold>{r.name}</TdBold>
                    <Td>{r.sku}</Td>
                    <Td>{r.unit}</Td>
                    <Td>{r.quantity}</Td>
                    <Td>{r.par_level}</Td>
                    <td className="px-4 py-2">
                      <input
                        type="number" min="0" step="any"
                        value={c ?? ''}
                        onChange={e => setCounts(s => ({ ...s, [r.stock_item_id]: e.target.value }))}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {shortfall == null ? '—'
                        : shortfall > 0
                          ? <span className="font-medium text-amber-700">{shortfall}</span>
                          : <span className="text-gray-400">0</span>}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <EmptyRow cols={7} msg={
                  location
                    ? 'No par levels set for this location.'
                    : 'Select a bar to start a count.'
                } />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── recent counts ───────────────────────────────────────── */}
      {recent.length > 0 && (
        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent counts</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <Th>Date</Th><Th>Bar</Th><Th>Status</Th><Th>Posted</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <TdBold>{s.business_date}</TdBold>
                    <Td>{s.location}</Td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        s.status === 'posted' ? 'bg-green-100 text-green-700'
                        : s.status === 'draft' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{s.status}</span>
                    </td>
                    <Td>{s.posted_at ? new Date(s.posted_at).toLocaleString('en-GB') : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
