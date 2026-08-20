import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Txt, Th, Td, Toast } from '../admin/AdminUI'
import {
  Badge, Button, FormGrid, FormActions, SectionHead, TableWrap, Thead,
} from '../ui/kit'
import { itemLabel, AccessDenied, EmptyRow, TdBold, fetchActiveItems, fetchDepartmentList } from './InventoryUI'
import { recordConsumption } from '../../lib/stock'
import { INVENTORY_VIEW_ROLES, MANAGE_ROLES } from '../../lib/roles'
import { SUB_LOCATIONS } from '../../lib/constants'
import { useFlash } from '../ui/useFlash'

/**
 * Consumption — the "which rooms used which stock" screen (FUNCTIONAL_SPEC §2.3).
 *
 * Two halves, because consumption is recorded two ways and both belong in one
 * view:
 *
 *   the DRAW FORM writes one attributed movement through record_consumption —
 *   what (item + qty), where (location, sub-location, room) and who (the staff
 *   roster member who took it).
 *
 *   the LEDGER reads v_stock_consumption, which unions that draw leg with the
 *   BAR leg — a posted end-of-day count's (system − counted) shortfall, which
 *   059 established IS the night's consumption because nothing deducts sales.
 *   Bar consumption therefore appears here without anyone typing it in, and
 *   carries no room or staff member. That is correct, not missing data.
 *
 * Access is decided by RLS, not here. The view is security_invoker, so a
 * department_head sees exactly their own department's consumption and their own
 * roster in the "who" picker; owner/admin see everything. The role checks below
 * only decide what the UI bothers to render.
 *
 * The Main Store is deliberately absent from the location list: the store
 * issues stock, it does not consume it, and record_consumption refuses it
 * server-side. Correcting a store balance is AdjustmentsTab's job.
 */

const ROW_LIMIT = 500

const balanceKey = (itemId, location, subLocation) =>
  `${itemId}|${location}|${subLocation ?? ''}`

// Source is a provenance label, not a health verdict: both tones are
// non-alarming. Bar count is `warn`-toned only because it is the derived one
// — nobody typed it in — and that is worth noticing.
function SourceBadge({ source }) {
  const bar = source === 'bar_count'
  return <Badge tone={bar ? 'warn' : 'brand'}>{bar ? 'Bar count' : 'Draw'}</Badge>
}

export default function ConsumptionTab() {
  const { profile } = useAuth()
  const role   = profile?.role
  const isHead = role === 'department_head'
  const canManage = MANAGE_ROLES.includes(role)

  const [items,     setItems]     = useState([])
  const [locations, setLocations] = useState([])
  const [rooms,     setRooms]     = useState([])
  const [staff,     setStaff]     = useState([])
  const [stockMap,  setStockMap]  = useState({})
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [toast,     setToast]     = useState(null)
  const flash = useFlash(setToast)

  const [form, setForm] = useState({
    stock_item_id: '', location: '', sub_location: '',
    room_id: '', consumed_by: '', quantity: '', reason: '',
  })

  // Ledger filters
  const [fLocation, setFLocation] = useState('')
  const [fRoom,     setFRoom]     = useState('')
  const [fItem,     setFItem]     = useState('')
  const [fStaff,    setFStaff]    = useState('')
  const [fFrom,     setFFrom]     = useState('')
  const [fTo,       setFTo]       = useState('')

  async function loadReference() {
    const [activeItems, departments, roomRes, staffRes, csRes] = await Promise.all([
      fetchActiveItems(),
      fetchDepartmentList(),
      supabase.from('rooms').select('id, room_number, name, room_type')
        .eq('is_active', true).order('room_number'),
      supabase.from('staff').select('id, full_name, department')
        .eq('is_active', true).order('full_name'),
      supabase.from('current_stock').select('stock_item_id, location, sub_location, quantity'),
    ])

    setItems(activeItems)
    setRooms(roomRes.data ?? [])
    setStaff(staffRes.data ?? [])

    // Departments only — the store never consumes. A head is narrowed to their
    // own department so the form cannot offer a location the RPC would refuse.
    const names = (departments ?? []).map(d => d.name)
    setLocations(isHead ? names.filter(n => n === profile?.department) : names)

    if (csRes.data) {
      setStockMap(Object.fromEntries(
        csRes.data.map(r => [balanceKey(r.stock_item_id, r.location, r.sub_location), r.quantity]),
      ))
    }
  }

  async function loadLedger() {
    let q = supabase
      .from('v_stock_consumption')
      .select(`source, source_id, consumed_on, recorded_at, stock_item_id,
               item_name, item_sku, item_unit, location, sub_location,
               room_id, room_number, room_name, consumed_by, consumed_by_name, quantity, reason`)
      .order('recorded_at', { ascending: false })
      .limit(ROW_LIMIT)

    if (fLocation) q = q.eq('location', fLocation)
    if (fRoom)     q = q.eq('room_id', fRoom)
    if (fItem)     q = q.eq('stock_item_id', fItem)
    if (fStaff)    q = q.eq('consumed_by', fStaff)
    if (fFrom)     q = q.gte('consumed_on', fFrom)
    if (fTo)       q = q.lte('consumed_on', fTo)

    const { data, error } = await q
    if (error) { flash(error.message, false); return }
    setRows(data ?? [])
  }

  useEffect(() => {
    if (!INVENTORY_VIEW_ROLES.includes(role)) return
    let cancelled = false
    ;(async () => {
      await loadReference()
      if (!cancelled) await loadLedger()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, profile?.department])

  useEffect(() => {
    if (!INVENTORY_VIEW_ROLES.includes(role)) return
    loadLedger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fLocation, fRoom, fItem, fStaff, fFrom, fTo])

  if (!INVENTORY_VIEW_ROLES.includes(role)) return <AccessDenied />

  const subOptions = SUB_LOCATIONS[form.location] ?? []

  // Only items that actually hold a balance at the chosen coordinates. Offering
  // the whole 566-item catalogue would mostly offer items that would fail the
  // insufficient-stock check.
  const itemsHere = useMemo(() => {
    if (!form.location) return []
    return items.filter(i =>
      stockMap[balanceKey(i.id, form.location, form.sub_location || null)] !== undefined)
  }, [items, stockMap, form.location, form.sub_location])

  // A head sees only their own roster (RLS), so no client filtering is needed
  // for them. owner/admin see all 62 and may attribute across departments —
  // real, e.g. a waiter sent to draw from the bar — so the list is sorted with
  // the selected location's own staff first rather than hidden.
  const staffOptions = useMemo(() => {
    if (!form.location) return staff
    return [...staff].sort((a, b) => {
      const am = a.department === form.location ? 0 : 1
      const bm = b.department === form.location ? 0 : 1
      return am - bm || (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })
  }, [staff, form.location])

  const available = form.stock_item_id && form.location
    ? stockMap[balanceKey(form.stock_item_id, form.location, form.sub_location || null)]
    : undefined

  const ready = form.stock_item_id !== '' && form.location !== '' && Number(form.quantity) > 0

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await recordConsumption(
        form.stock_item_id, form.location, Number(form.quantity),
        {
          subLocation: form.sub_location || null,
          roomId:      form.room_id     || null,
          consumedBy:  form.consumed_by || null,
          reason:      form.reason      || null,
        },
      )
      flash(`${res.item} — ${res.quantity} used${res.room ? ` in ${res.room}` : ''}. ${res.location} now holds ${res.new_quantity}.`)
      setForm(f => ({ ...f, stock_item_id: '', room_id: '', quantity: '', reason: '' }))
      await loadReference()
      await loadLedger()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  function clearFilters() {
    setFLocation(''); setFRoom(''); setFItem(''); setFStaff(''); setFFrom(''); setFTo('')
  }

  const totalUsed = rows.reduce((s, r) => s + Number(r.quantity ?? 0), 0)

  return (
    <div className="p-6 space-y-8">
      <Toast toast={toast} />

      {/* —— the draw form ———————————————— */}
      <section>
        <SectionHead
          title="Record consumption"
          subtitle="Stock drawn and used — what, where and who. Bar consumption is captured by the end-of-day count instead, and appears in the ledger below on its own."
          className="mb-6"
        />

        <form onSubmit={handleSubmit} className="max-w-4xl">
          <FormGrid>
            <Field label="Location *">
              <Sel required value={form.location}
                onChange={e => setForm(f => ({
                  ...f, location: e.target.value, sub_location: '', stock_item_id: '',
                }))}>
                <option value="">Select location…</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </Sel>
            </Field>

            {subOptions.length > 0 ? (
              <Field label="Sub-location">
                <Sel value={form.sub_location}
                  onChange={e => setForm(f => ({ ...f, sub_location: e.target.value, stock_item_id: '' }))}>
                  <option value="">{form.location} (main)</option>
                  {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </Sel>
              </Field>
            ) : <div className="hidden md:block" aria-hidden="true" />}

            <Field
              label="Item *"
              span="full"
              hint={
                form.location && itemsHere.length === 0
                  ? `${form.location}${form.sub_location ? ` / ${form.sub_location}` : ''} holds no stock yet — issue stock to it from the Main Store first.`
                  : available !== undefined
                    ? `${available} available at this location.`
                    : undefined
              }
            >
              <Sel required disabled={!form.location} value={form.stock_item_id}
                onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value }))}>
                <option value="">
                  {form.location ? 'Select item…' : 'Choose a location first'}
                </option>
                {itemsHere.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
              </Sel>
            </Field>

            <Field label="Quantity used *">
              <Inp type="number" required min="0" step="any" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </Field>

            <Field label="Room">
              <Sel value={form.room_id}
                onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}>
                <option value="">No specific room</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.room_number}{r.name ? ` — ${r.name}` : ''}
                  </option>
                ))}
              </Sel>
            </Field>

            <Field label="Used by">
              <Sel value={form.consumed_by}
                onChange={e => setForm(f => ({ ...f, consumed_by: e.target.value }))}>
                <option value="">Not recorded</option>
                {staffOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.department ? ` — ${s.department}` : ''}
                  </option>
                ))}
              </Sel>
            </Field>

            <Field label="Recorded by" hint="Taken from your sign-in; not editable.">
              <Inp disabled value={profile?.full_name ?? '—'} />
            </Field>

            <Field label="Reason / notes" span="full">
              <Txt rows={2} placeholder="e.g. Guest room restock"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </Field>
          </FormGrid>

          <FormActions>
            <Button type="submit" disabled={busy || !ready}>
              {busy ? 'Saving…' : 'Record consumption'}
            </Button>
          </FormActions>
        </form>
      </section>

      {/* —— the ledger —————————————————— */}
      <section className="space-y-4 pt-8 border-t border-line">
        <SectionHead
          title="Consumption ledger"
          subtitle={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${totalUsed} units used${rows.length === ROW_LIMIT ? ` (showing the most recent ${ROW_LIMIT})` : ''}`}
        />

        <div className="flex flex-wrap items-end gap-3">
          {canManage && (
            <Field label="Department" className="w-44">
              <Sel value={fLocation} onChange={e => setFLocation(e.target.value)}>
                <option value="">All departments</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </Sel>
            </Field>
          )}
          <Field label="Room" className="w-44">
            <Sel value={fRoom} onChange={e => setFRoom(e.target.value)}>
              <option value="">All rooms</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number}{r.name ? ` — ${r.name}` : ''}</option>)}
            </Sel>
          </Field>
          <Field label="Item" className="w-52">
            <Sel value={fItem} onChange={e => setFItem(e.target.value)}>
              <option value="">All items</option>
              {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
            </Sel>
          </Field>
          <Field label="Used by" className="w-44">
            <Sel value={fStaff} onChange={e => setFStaff(e.target.value)}>
              <option value="">All staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Sel>
          </Field>
          <Field label="From" className="w-40">
            <Inp type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} />
          </Field>
          <Field label="To" className="w-40">
            <Inp type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={clearFilters}>Clear</Button>
        </div>

        <TableWrap>
          <table className="w-full">
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Source</Th>
                <Th>Item</Th>
                <Th>Where</Th>
                <Th>Room</Th>
                <Th>Used by</Th>
                <Th>Qty</Th>
                <Th>Reason</Th>
              </tr>
            </Thead>
            <tbody className="divide-y divide-line">
              {loading && <EmptyRow cols={8} msg="Loading…" />}
              {!loading && rows.length === 0 && (
                <EmptyRow cols={8} msg="No consumption recorded for these filters. Clear them, or record a draw above." />
              )}
              {!loading && rows.map(r => (
                <tr key={`${r.source}-${r.source_id}`} className="hover:bg-gray-50 wl-transition">
                  <Td>{r.consumed_on}</Td>
                  <Td><SourceBadge source={r.source} /></Td>
                  <TdBold>{r.item_name}</TdBold>
                  <Td>{r.location}{r.sub_location ? ` / ${r.sub_location}` : ''}</Td>
                  <Td>{r.room_number ? `${r.room_number}${r.room_name ? ` — ${r.room_name}` : ''}` : '—'}</Td>
                  <Td>{r.consumed_by_name ?? '—'}</Td>
                  <Td>
                    <span className="text-sm font-semibold text-alert tnum">
                      {Number(r.quantity)} {r.item_unit}
                    </span>
                  </Td>
                  <Td>{r.reason ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  )
}
