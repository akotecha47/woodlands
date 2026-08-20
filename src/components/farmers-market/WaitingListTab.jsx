import { useState, useEffect } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast } from '../admin/AdminUI'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { fetchWaitingList, fetchTaxonomy, fetchForfeitures } from '../../lib/fm'
import { Badge, StatRow, StatTile, EmptyRow } from '../ui/kit'
import { fmtDate, AccessDenied } from './FarmersMarketUI'
import { fieldCls } from '../ui/kit.constants'
import { useFlash } from '../ui/useFlash'

// Kit tones, so a waiting-list status reads the same as every other status in
// the app. Waiting is `brand` (in the queue, no verdict); offered is `warn`
// (waiting on an answer); placed is `ok`; withdrawn is neutral.
const STATUS_CFG = {
  waiting:   { label: 'Waiting',   tone: 'brand'   },
  offered:   { label: 'Offered',   tone: 'warn'    },
  placed:    { label: 'Placed',    tone: 'ok'      },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

const BLANK = { full_name: '', business_name: '', phone: '', email: '', category_id: '', products_note: '', notes: '' }

export default function WaitingListTab() {
  const { profile, session } = useAuth()
  const canManage = FM_MANAGE_ROLES.includes(profile?.role)

  const [entries,     setEntries]     = useState([])
  const [forfeitures, setForfeitures] = useState([])
  const [categories,  setCategories]  = useState([])
  const [form,        setForm]        = useState(BLANK)
  const [showAdd,     setShowAdd]     = useState(false)
  const [busy,        setBusy]        = useState(false)
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    try {
      const [w, tx, ff] = await Promise.all([fetchWaitingList(), fetchTaxonomy(), fetchForfeitures()])
      setEntries(w)
      setCategories(tx.categories)
      setForfeitures(ff)
    } catch (err) { flash(err.message, false) }
  }

  useEffect(() => { load() }, [])

  if (!canManage) return <AccessDenied />

  const f = field => e => setForm(p => ({ ...p, [field]: e.target.value }))

  async function handleAdd(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.from('fm_waiting_list').insert({
        full_name:     form.full_name,
        business_name: form.business_name || null,
        phone:         form.phone,
        email:         form.email || null,
        category_id:   form.category_id || null,
        products_note: form.products_note || null,
        notes:         form.notes || null,
        created_by:    session?.user?.id ?? null,
      })
      if (error) throw error
      flash('Added to the waiting list')
      setForm(BLANK)
      setShowAdd(false)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function setStatus(entry, status) {
    try {
      const patch = { status }
      if (status === 'placed') patch.placed_at = new Date().toISOString()
      const { error } = await supabase.from('fm_waiting_list').update(patch).eq('id', entry.id)
      if (error) throw error
      flash(`${entry.full_name} marked ${status}`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  const waiting = entries.filter(e => e.status === 'waiting')
  const next    = waiting[0] ?? null

  return (
    <div className="p-6">
      <Toast toast={toast} />

      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-navy">Waiting List</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Position is by application date — no manual reordering, so it cannot drift.
            A forfeited stall is offered to whoever is at the top.
          </p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="text-sm px-4 py-2 bg-teal hover:bg-teal-deep text-white rounded-lg wl-transition">
          {showAdd ? 'Cancel' : 'Add to List'}
        </button>
      </div>

      <StatRow cols={3} className="mb-5">
        <StatTile label="Waiting" value={waiting.length} foot="Queue position is derived, never stored" />
        <StatTile
          label="Next to be offered"
          value={next ? next.full_name : '—'}
          foot={next ? 'Head of the queue' : 'Nobody waiting'}
          className="[&>p:nth-child(2)]:text-[18px] [&>p:nth-child(2)]:leading-snug"
        />
        <StatTile label="Stalls forfeited" value={forfeitures.length} />
      </StatRow>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-gray-50 border border-line rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Full Name *"><Inp required value={form.full_name} onChange={f('full_name')} /></Field>
            <Field label="Business Name"><Inp value={form.business_name} onChange={f('business_name')} /></Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Phone *">
              <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-teal/25 focus-within:border-teal">
                <PhoneInput international defaultCountry="MW" value={form.phone}
                  onChange={val => setForm(p => ({ ...p, phone: val ?? '' }))}
                  inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0" />
              </div>
            </Field>
            <Field label="Email"><Inp type="email" value={form.email} onChange={f('email')} /></Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Intended Category">
              <Sel value={form.category_id} onChange={f('category_id')}>
                <option value="">— not stated —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel>
            </Field>
            <Field label="Products"><Inp value={form.products_note} onChange={f('products_note')} placeholder="What they intend to sell" /></Field>
          </div>
          <Field label="Notes">
            <textarea rows={2} className={`${fieldCls} resize-none`} value={form.notes} onChange={f('notes')} />
          </Field>
          <button type="submit" disabled={busy}
            className="inline-flex items-center justify-center bg-teal hover:bg-teal-deep text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm hover:shadow-md wl-transition disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Adding…' : 'Add to Waiting List'}
          </button>
        </form>
      )}

      <div className="wl-scroll-x border border-line rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-line">
            <tr>
              <Th>#</Th><Th>Name</Th><Th>Business</Th><Th>Phone</Th>
              <Th>Products</Th><Th>Applied</Th><Th>Status</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map(e => (
              <tr key={e.id} className={e.status === 'offered' ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                <Td>{e.position ?? '—'}</Td>
                <Td>{e.full_name}</Td>
                <Td>{e.business_name ?? '—'}</Td>
                <Td>{e.phone}</Td>
                <Td>{e.products_note ?? '—'}</Td>
                <Td>{fmtDate(e.applied_at)}</Td>
                <Td>
                  <Badge tone={STATUS_CFG[e.status]?.tone ?? 'neutral'}>
                    {STATUS_CFG[e.status]?.label ?? e.status}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    {e.status === 'offered' && (
                      <button onClick={() => setStatus(e, 'placed')}
                        className="text-xs px-2 py-0.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded wl-transition">
                        Mark Placed
                      </button>
                    )}
                    {(e.status === 'waiting' || e.status === 'offered') && (
                      <button onClick={() => setStatus(e, 'withdrawn')}
                        className="text-xs px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded wl-transition">
                        Withdraw
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {entries.length === 0 && (
              <EmptyRow
                cols={8}
                msg="Nobody on the waiting list. Add an applicant above — queue position is derived from when they applied."
              />
            )}
          </tbody>
        </table>
      </div>

      {forfeitures.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-navy mb-2">Forfeiture record</h3>
          <div className="wl-scroll-x border border-line rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-line">
                <tr><Th>Stall</Th><Th>Last visit</Th><Th>Missed</Th><Th>Window</Th><Th>Reason</Th><Th>When</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {forfeitures.map(fr => (
                  <tr key={fr.id} className="hover:bg-gray-50">
                    <Td>{fr.stall_number}</Td>
                    <Td>{fr.last_visit_date ? fmtDate(fr.last_visit_date) : 'never'}</Td>
                    <Td>{fr.market_days_missed}</Td>
                    <Td>{fmtDate(fr.window_start)} – {fmtDate(fr.window_end)}</Td>
                    <Td>{fr.reason ?? '—'}</Td>
                    <Td>{fmtDate(fr.decided_at)}</Td>
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
