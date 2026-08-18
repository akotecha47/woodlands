import { useState, useEffect, Fragment, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '../../lib/supabase'
import { FM_FEES, FM_ID_CARD_EXTRA_FEE } from '../../lib/constants'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { fetchAttendance, fetchTaxonomy, itemPath, changeHolderProducts, forfeitStall } from '../../lib/fm'
import {
  STALL_TYPES, FM_PAY_TYPES, FM_PAY_METHODS, HOLDER_STATUS_CFG,
  fmtDate, fmtMWK, validateStall,
  getLastNMarketDays, getMarketDaysSince,
  HolderStatusBadge, PaidIcon,
} from './FarmersMarketUI'

const FILTER_TABS = [
  { id: 'all',            label: 'All'           },
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'active',         label: 'Active'        },
  { id: 'at_risk',        label: 'At Risk'       },
  { id: 'inactive',       label: 'Inactive'      },
  { id: 'forfeited',      label: 'Forfeited'     },
]

const BLANK_EDIT = {
  full_name: '', business_name: '', stall_number: '',
  stall_type: 'Produce', phone: '', email: '', notes: '', status: 'active',
}

export default function HoldersTab() {
  const { profile, session } = useAuth()
  const canManage = FM_MANAGE_ROLES.includes(profile?.role)

  const [holders,          setHolders]          = useState([])
  const [yearVisits,       setYearVisits]        = useState([])
  const [filter,           setFilter]            = useState('all')
  const [expandedId,       setExpandedId]        = useState(null)
  const [expandedPayments, setExpandedPayments]  = useState([])
  const [expandedVisits,   setExpandedVisits]    = useState([])
  const [expandedIdCards,  setExpandedIdCards]   = useState([])
  const [expandedItems,    setExpandedItems]     = useState([])
  const [editHolder,       setEditHolder]        = useState(null)
  const [editForm,         setEditForm]          = useState(BLANK_EDIT)
  const [editStallError,   setEditStallError]    = useState('')
  const [confirmAction,    setConfirmAction]     = useState(null) // { type: 'approve'|'deactivate', holder }
  const [cardConfirm,      setCardConfirm]       = useState(null) // { type: 'issue'|'reprint', holder, cardNum, fee, cardId? }
  const [cardPayMethod,    setCardPayMethod]     = useState('cash')
  const [cardPayRef,       setCardPayRef]        = useState('')
  const [qrHolder,         setQrHolder]          = useState(null)
  const [lastMarketDay,    setLastMarketDay]      = useState(null) // { date, attended, collected, noShows }
  const [attendance,       setAttendance]         = useState({ byHolder: {}, marketDates: [] })
  const [taxonomy,         setTaxonomy]           = useState(null)
  const [productEdit,      setProductEdit]        = useState(null) // { holder, selected:Set, categoryId }
  const [forfeitTarget,    setForfeitTarget]      = useState(null) // holder pending forfeit confirm
  const [busy,             setBusy]              = useState(false)
  const [itemBusy,         setItemBusy]          = useState(false)
  const [toast,            setToast]             = useState(null)
  const flash     = useFlash(setToast)
  const qrWrapRef = useRef(null)

  function handlePrintQr() {
    const style = document.createElement('style')
    style.textContent = `
      @media print {
        @page { size: 85mm 54mm; margin: 4mm; }
        body > * { display: none !important; }
        body { margin: 0; background: white; }
        #qr-print-target {
          display: flex !important; flex-direction: column; align-items: center;
          justify-content: center; gap: 3px; height: 46mm;
          font-family: sans-serif; text-align: center;
        }
        #qr-print-target * { display: block; }
        #qr-print-target canvas { width: 28mm !important; height: 28mm !important; }
        #qr-print-target p { font-size: 10pt; margin: 0; }
      }
    `
    document.head.appendChild(style)
    window.print()
    document.head.removeChild(style)
  }

  function handleDownloadQr() {
    const canvas = qrWrapRef.current?.querySelector('canvas')
    if (!canvas || !qrHolder) return
    const safe = qrHolder.full_name.replace(/[^a-zA-Z0-9]/g, '_')
    const a = document.createElement('a')
    a.download = `${qrHolder.stall_number}-${safe}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  async function load() {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const lastDay   = getLastNMarketDays(1)[0] ?? null

    // NO AUTO-FLAG WRITE. Until 061 this function UPDATEd fm_holders.status to
    // 'at_risk' for every matching holder, from the browser, on every page
    // load — a mutation performed by a read, running as whoever happened to
    // open the tab, silently overwriting a status a manager may have set by
    // hand. v_fm_attendance now computes the same judgement and writes nothing.
    const [holdersR, yearVisitsR, lastVisitsR, attendanceR, taxonomyR] = await Promise.all([
      supabase.from('fm_holders').select('*').order('stall_number'),
      supabase.from('fm_visits').select('holder_id').gte('visit_date', yearStart),
      lastDay
        ? supabase.from('fm_visits').select('holder_id, fee_paid').eq('visit_date', lastDay)
        : Promise.resolve({ data: [] }),
      fetchAttendance().catch(() => ({ byHolder: {}, marketDates: [] })),
      fetchTaxonomy().catch(() => null),
    ])

    setYearVisits(yearVisitsR.data ?? [])
    setAttendance(attendanceR)
    setTaxonomy(taxonomyR)

    const allHolders = holdersR.data ?? []
    setHolders(allHolders)

    // Last market day summary
    if (lastDay) {
      const activeIds   = new Set(allHolders.filter(h => h.status === 'active').map(h => h.id))
      const lastVisits  = lastVisitsR.data ?? []
      const attended    = lastVisits.filter(v => activeIds.has(v.holder_id))
      const attendedIds = new Set(attended.map(v => v.holder_id))
      setLastMarketDay({
        date:      lastDay,
        attended:  attended.length,
        collected: attended.filter(v => v.fee_paid).length * 10000,
        noShows:   [...activeIds].filter(id => !attendedIds.has(id)).length,
      })
    }
  }

  useEffect(() => { load() }, [])

  // ── derived ────────────────────────────────────────────────────────────────

  const yearVisitCountMap = {}
  for (const v of yearVisits) {
    yearVisitCountMap[v.holder_id] = (yearVisitCountMap[v.holder_id] ?? 0) + 1
  }

  const activeHolders = holders.filter(h => h.status === 'active')

  // At risk is now READ, not written. A holder is at risk when the attendance
  // view says they missed the whole three-month window; they are FORFEIT
  // ELIGIBLE when they also registered before the window began. The status
  // column is still honoured if a manager set it by hand.
  const att = attendance.byHolder ?? {}
  const atRiskHolders = holders.filter(h =>
    h.status === 'at_risk' ||
    (h.status === 'active' && att[h.id] && att[h.id].attended_count === 0)
  )
  const forfeitEligible = holders.filter(h => att[h.id]?.forfeit_eligible)

  // Outstanding fees = 0 until an explicit invoicing system is added.
  // Do not infer debt from application_paid / acceptance_paid flags alone.
  const outstandingTotal = 0

  const stallTypeBreakdown = STALL_TYPES.map(type => ({
    type,
    count: activeHolders.filter(h => h.stall_type === type).length,
  }))

  const filtered = filter === 'all' ? holders : holders.filter(h => h.status === filter)

  // ── expand panel ───────────────────────────────────────────────────────────

  async function handleExpand(holder) {
    if (expandedId === holder.id) {
      setExpandedId(null)
      setExpandedPayments([])
      setExpandedVisits([])
      setExpandedIdCards([])
      setExpandedItems([])
      return
    }
    setExpandedId(holder.id)
    const [pR, vR, idR, itR] = await Promise.all([
      supabase.from('fm_payments').select('*').eq('holder_id', holder.id).order('payment_date', { ascending: false }),
      supabase.from('fm_visits').select('*').eq('holder_id', holder.id),
      supabase.from('fm_id_cards').select('*').eq('holder_id', holder.id).order('card_number'),
      supabase.from('fm_approved_items').select('*').eq('holder_id', holder.id).order('created_at'),
    ])
    setExpandedPayments(pR.data ?? [])
    setExpandedVisits(vR.data ?? [])
    setExpandedIdCards(idR.data ?? [])
    setExpandedItems(itR.data ?? [])
  }

  function buildVisitHistory(holder) {
    const allDays      = getMarketDaysSince(holder.created_at)
    const visitDateSet = new Set(expandedVisits.map(v => v.visit_date))
    const feeMap       = Object.fromEntries(expandedVisits.map(v => [v.visit_date, v.fee_paid]))
    const notesMap     = Object.fromEntries(expandedVisits.filter(v => v.notes).map(v => [v.visit_date, v.notes]))
    return allDays.map(date => ({
      date,
      checkedIn: visitDateSet.has(date),
      feePaid:   feeMap[date] ?? false,
      notes:     notesMap[date] ?? null,
    }))
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function handleMarkContacted(holder) {
    const now = new Date().toISOString()
    try {
      await supabase.from('fm_holders').update({ last_contacted: now }).eq('id', holder.id)
      // Optimistic update — reflect in banner immediately without full reload
      setHolders(prev => prev.map(h => h.id === holder.id ? { ...h, last_contacted: now } : h))
      flash('Marked as contacted')
    } catch (err) { flash(err.message, false) }
  }

  async function doApprove(holder) {
    try {
      await supabase.from('fm_holders').update({ status: 'active' }).eq('id', holder.id)
      flash(`${holder.full_name} approved`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function doDeactivate(holder) {
    try {
      await supabase.from('fm_holders').update({ status: 'inactive' }).eq('id', holder.id)
      flash(`${holder.full_name} deactivated`)
      if (expandedId === holder.id) setExpandedId(null)
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function executeConfirm() {
    const { type, holder } = confirmAction
    setConfirmAction(null)
    if (type === 'approve') await doApprove(holder)
    else await doDeactivate(holder)
  }

  function openEdit(holder) {
    setEditHolder(holder)
    setEditStallError('')
    setEditForm({
      full_name:     holder.full_name,
      business_name: holder.business_name ?? '',
      stall_number:  holder.stall_number,
      stall_type:    holder.stall_type,
      phone:         holder.phone ?? '',
      email:         holder.email ?? '',
      notes:         holder.notes ?? '',
      status:        holder.status,
    })
  }

  async function handleEditSave(e) {
    e.preventDefault()
    // Edit enforced no stall format at all, while Add enforced a two-digit one
    // that no live stall could satisfy. Both now share validateStall().
    const stall = editForm.stall_number.trim().toUpperCase()
    const stallMsg = validateStall(stall)
    if (stallMsg) { setEditStallError(stallMsg); return }
    setEditStallError('')
    setBusy(true)
    try {
      const { error } = await supabase.from('fm_holders').update({
        full_name:     editForm.full_name,
        business_name: editForm.business_name || null,
        stall_number:  stall,
        stall_type:    editForm.stall_type,
        phone:         editForm.phone,
        email:         editForm.email || null,
        notes:         editForm.notes || null,
        status:        editForm.status,
      }).eq('id', editHolder.id)
      if (error) {
        throw error.message?.includes('stall_number')
          ? new Error('Stall number is already in use')
          : error
      }
      flash('Business updated')
      setEditHolder(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  const ef = field => e => setEditForm(p => ({ ...p, [field]: e.target.value }))

  // ── forfeiture ─────────────────────────────────────────────────────────────
  // The confirm step is the whole point: the system flags, a person decides.
  // Eligibility is re-checked server-side by forfeit_stall(), so a stale screen
  // cannot force one through.

  async function doForfeit(holder) {
    setForfeitTarget(null)
    setBusy(true)
    try {
      const res = await forfeitStall({
        holderId: holder.id,
        reason:   `No attendance across the last 3 market days. Confirmed by ${profile?.role} in the Businesses tab.`,
      })
      flash(
        res.offered_to_name
          ? `Stall ${res.stall_number} forfeited and offered to ${res.offered_to_name}`
          : `Stall ${res.stall_number} forfeited. Waiting list is empty — nobody to offer it to.`
      )
      if (expandedId === holder.id) setExpandedId(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── approved products, from the controlled taxonomy ────────────────────────
  // Goes through change_holder_products(), never a direct write: the RPC raises
  // the MWK 10,000 product-change fee in the same transaction. A direct insert
  // would change the products and skip the charge.

  function openProductEdit(holder) {
    setProductEdit({
      holder,
      selected:   new Set(expandedItems.map(i => i.item_id)),
      categoryId: holder.category_id ?? '',
    })
  }

  function toggleProduct(itemId) {
    setProductEdit(p => {
      const next = new Set(p.selected)
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
      return { ...p, selected: next }
    })
  }

  async function saveProducts() {
    const { holder, selected, categoryId } = productEdit
    if (selected.size === 0) { flash('Select at least one product', false); return }
    setItemBusy(true)
    try {
      const res = await changeHolderProducts({
        holderId:   holder.id,
        itemIds:    [...selected],
        categoryId: categoryId || null,
      })
      flash(
        res.fee_raised
          ? `Products updated — ${fmtMWK(res.fee_amount)} product change fee raised`
          : 'No change to the product list — no fee raised'
      )
      setProductEdit(null)
      const { data } = await supabase.from('fm_approved_items').select('*').eq('holder_id', holder.id).order('created_at')
      setExpandedItems(data ?? [])
      load()
    } catch (err) { flash(err.message, false) }
    finally { setItemBusy(false) }
  }

  // ── ID card actions ────────────────────────────────────────────────────────

  function openCardConfirm(config) {
    setCardConfirm(config)
    setCardPayMethod('cash')
    setCardPayRef('')
  }

  async function executeCardConfirm() {
    const { type, holder, cardNum, fee, cardId } = cardConfirm
    const method    = cardPayMethod
    const reference = cardPayRef.trim() || null
    setCardConfirm(null)
    setBusy(true)
    const today = new Date().toISOString().slice(0, 10)
    try {
      if (type === 'issue') {
        const { error: cardErr } = await supabase.from('fm_id_cards').insert({
          holder_id:   holder.id,
          card_number: cardNum,
          card_fee:    fee,
          status:      'active',
          issued_by:   session?.user?.id ?? null,
        })
        if (cardErr) throw cardErr
        // Card #2 is already covered by the 30,000 charged on card #1, so it
        // raises no payment. fm_payments has a CHECK (amount > 0), so a zero
        // row would be rejected by the database rather than stored as "free".
        if (fee > 0) {
          const { error: payErr } = await supabase.from('fm_payments').insert({
            holder_id:      holder.id,
            payment_type:   'id_card',
            amount:         fee,
            payment_date:   today,
            payment_method: method,
            reference,
            recorded_by:    session?.user?.id ?? null,
          })
          if (payErr) throw payErr
        }
        flash(fee > 0 ? `Card #${cardNum} issued` : `Card #${cardNum} issued — covered by the initial fee`)
      } else {
        const { error: repErr } = await supabase.from('fm_id_cards').update({ status: 'reprinted' }).eq('id', cardId)
        if (repErr) throw repErr
        const { error: payErr } = await supabase.from('fm_payments').insert({
          holder_id:      holder.id,
          payment_type:   'reprint',
          amount:         FM_FEES.id_card_replace,
          payment_date:   today,
          payment_method: method,
          reference,
          recorded_by:    session?.user?.id ?? null,
        })
        if (payErr) throw payErr
        flash(`Card #${cardNum} marked as reprinted`)
      }
      const [pR, idR, itR] = await Promise.all([
        supabase.from('fm_payments').select('*').eq('holder_id', holder.id).order('payment_date', { ascending: false }),
        supabase.from('fm_id_cards').select('*').eq('holder_id', holder.id).order('card_number'),
        supabase.from('fm_approved_items').select('*').eq('holder_id', holder.id).order('created_at'),
      ])
      setExpandedPayments(pR.data ?? [])
      setExpandedIdCards(idR.data ?? [])
      setExpandedItems(itR.data ?? [])
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── approved item actions ──────────────────────────────────────────────────

  // REMOVED at 061: the free-text add/remove pair that wrote fm_approved_items
  // directly. Two reasons it could not stay. It inserted only item_name, which
  // is no longer the classification and no longer sufficient — item_id is NOT
  // NULL — so it would fail outright. And it changed a holder's products
  // without raising the MWK 10,000 fee, which is the precise failure
  // FUNCTIONAL_SPEC §7 exists to prevent. Both paths now go through
  // change_holder_products(); see saveProducts above.

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-gray-50 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Active Businesses</p>
          <p className="text-2xl font-bold text-gray-900">{activeHolders.length}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {stallTypeBreakdown.map(s => (
              <span key={s.type} className="text-xs text-gray-500">{s.type}: {s.count}</span>
            ))}
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 mb-1">Outstanding Fees</p>
          <p className="text-lg font-bold text-amber-800">{fmtMWK(outstandingTotal)}</p>
        </div>
        <div className={`rounded-xl p-4 border ${atRiskHolders.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-transparent'}`}>
          <p className={`text-xs mb-1 ${atRiskHolders.length > 0 ? 'text-red-700' : 'text-gray-500'}`}>At Risk</p>
          <p className={`text-2xl font-bold ${atRiskHolders.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>{atRiskHolders.length}</p>
          {atRiskHolders.length > 0 && <p className="text-xs text-red-600 mt-0.5">requires follow-up</p>}
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Businesses</p>
          <p className="text-2xl font-bold text-gray-900">{holders.length}</p>
        </div>
      </div>

      {/* Last market day summary */}
      {lastMarketDay && (
        <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">
            Last Market Day — {fmtDate(lastMarketDay.date)}
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{lastMarketDay.attended}</p>
              <p className="text-xs text-gray-500 mt-0.5">Businesses attended</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{fmtMWK(lastMarketDay.collected)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Collected</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${lastMarketDay.noShows > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                {lastMarketDay.noShows}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">No-shows</p>
            </div>
          </div>
        </div>
      )}

      {/* Forfeit-eligible banner — three months absent, awaiting a decision */}
      {forfeitEligible.length > 0 && canManage && (
        <div className="bg-stone-100 border border-stone-300 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-stone-800 mb-1">
            {forfeitEligible.length} stall{forfeitEligible.length !== 1 ? 's' : ''} eligible for forfeiture
          </p>
          <p className="text-xs text-stone-600 mb-3">
            No attendance across the last three market days, and registered before that window began.
            Nothing happens automatically — each one needs a decision.
          </p>
          <div className="flex flex-wrap gap-2">
            {forfeitEligible.map(h => (
              <div key={h.id} className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-3 py-1.5">
                <span className="text-sm text-gray-800">{h.full_name} ({h.stall_number})</span>
                <button
                  onClick={() => setForfeitTarget(h)}
                  className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors"
                >
                  Forfeit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* At-risk banner */}
      {atRiskHolders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-red-800 mb-3">
            {atRiskHolders.length} business{atRiskHolders.length !== 1 ? 'es' : ''} flagged as at risk — follow up required
          </p>
          <div className="flex flex-wrap gap-2">
            {atRiskHolders.map(h => (
              <div key={h.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-sm text-gray-800">{h.full_name} ({h.stall_number})</span>
                {h.last_contacted && (
                  <span className="text-xs text-gray-400">Last contacted: {fmtDate(h.last_contacted)}</span>
                )}
                <button
                  onClick={() => handleMarkContacted(h)}
                  className="text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-300 px-2 py-0.5 rounded transition-colors"
                >
                  Mark Contacted
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-4 overflow-x-auto max-w-full">
        {FILTER_TABS.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Holders table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Stall No</Th>
              <Th>Name</Th>
              <Th>Business</Th>
              <Th>Type</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>App Paid</Th>
              <Th>Reg Fee Paid</Th>
              <Th>Visits (YTD)</Th>
              <Th>Outstanding</Th>
              <Th>Actions</Th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(h => (
              <Fragment key={h.id}>
                <tr className={`border-b border-gray-100 transition-colors ${
                  h.status === 'at_risk' ? 'bg-amber-50' : 'hover:bg-gray-50'
                }`}>
                  <Td>{h.stall_number}</Td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleExpand(h)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 text-left">
                      {h.full_name}
                    </button>
                  </td>
                  <Td>{h.business_name}</Td>
                  <Td>{h.stall_type}</Td>
                  <Td>{h.phone}</Td>
                  <td className="px-4 py-3"><HolderStatusBadge status={h.status} /></td>
                  <td className="px-4 py-3"><PaidIcon paid={h.application_paid} /></td>
                  <td className="px-4 py-3"><PaidIcon paid={h.acceptance_paid} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700">{yearVisitCountMap[h.id] ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">—</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => handleExpand(h)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
                        View
                      </button>
                      {canManage && (
                        <button onClick={() => openEdit(h)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
                          Edit
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => setQrHolder(h)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
                          QR Code
                        </button>
                      )}
                      {canManage && h.status === 'pending_review' && (
                        <button onClick={() => setConfirmAction({ type: 'approve', holder: h })}
                          className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 transition-colors">
                          Approve
                        </button>
                      )}
                      {canManage && ['active', 'at_risk', 'accepted'].includes(h.status) && (
                        <button onClick={() => setConfirmAction({ type: 'deactivate', holder: h })}
                          className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700 transition-colors">
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-400 cursor-pointer" onClick={() => handleExpand(h)}>
                    {expandedId === h.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                </tr>

                {expandedId === h.id && (
                  <tr>
                    <td colSpan={12} className="bg-gray-50 border-b border-gray-200 px-6 py-5">

                      {/* Contact details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm mb-5">
                        {[
                          ['Email',          h.email],
                          ['Phone',          h.phone],
                          ['Last Contacted', fmtDate(h.last_contacted)],
                          ['Registered',     fmtDate(h.created_at)],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className="text-gray-900 font-medium">{val || '—'}</p>
                          </div>
                        ))}
                        {h.notes && (
                          <div className="col-span-full mt-1">
                            <p className="text-xs text-gray-500">Notes</p>
                            <p className="text-gray-700">{h.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payment history */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment History</p>
                          {expandedPayments.length === 0 ? (
                            <p className="text-sm text-gray-400">No payments recorded</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {['Date', 'Type', 'Amount', 'Method', 'Reference'].map(c => (
                                    <th key={c} className="text-left pb-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase">{c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {expandedPayments.map(p => (
                                  <tr key={p.id} className="border-t border-gray-100">
                                    <td className="py-1.5 pr-4 text-gray-700">{fmtDate(p.payment_date)}</td>
                                    <td className="py-1.5 pr-4 text-gray-700">{FM_PAY_TYPES.find(t => t.value === p.payment_type)?.label ?? p.payment_type}</td>
                                    <td className="py-1.5 pr-4 font-semibold text-gray-900">{fmtMWK(p.amount)}</td>
                                    <td className="py-1.5 pr-4 text-gray-600 capitalize">{p.payment_method?.replace(/_/g, ' ')}</td>
                                    <td className="py-1.5 text-gray-500">{p.reference ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Visit history */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Visit History</p>
                          {(() => {
                            const history = buildVisitHistory(h)
                            if (history.length === 0) {
                              return <p className="text-sm text-gray-400">No market days since registration</p>
                            }
                            return (
                              <div className="max-h-52 overflow-y-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200">
                                      {['Date', 'Checked In', 'Fee Paid', 'Notes'].map(c => (
                                        <th key={c} className="text-left pb-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase">{c}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {history.map(({ date, checkedIn, feePaid, notes }) => (
                                      <tr key={date} className="border-t border-gray-100">
                                        <td className="py-1.5 pr-4 text-gray-700">{fmtDate(date)}</td>
                                        <td className="py-1.5 pr-4">
                                          <span className={`text-xs font-medium ${checkedIn ? 'text-green-600' : 'text-gray-400'}`}>
                                            {checkedIn ? 'Yes' : 'No'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          <span className={`text-xs font-medium ${feePaid ? 'text-green-600' : 'text-gray-400'}`}>
                                            {feePaid ? 'Yes' : '—'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-xs text-gray-500 max-w-[160px] truncate" title={notes ?? ''}>
                                          {notes ?? '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      {/* ID Cards + Approved Items */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

                        {/* ID Cards */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ID Cards</p>
                          {expandedIdCards.length === 0 ? (
                            <p className="text-sm text-gray-400 mb-3">No ID cards issued</p>
                          ) : (
                            <table className="w-full text-sm mb-3">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {['Card #', 'Fee', 'Status', 'Issued'].map(c => (
                                    <th key={c} className="text-left pb-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase">{c}</th>
                                  ))}
                                  {canManage && <th />}
                                </tr>
                              </thead>
                              <tbody>
                                {expandedIdCards.map(c => (
                                  <tr key={c.id} className="border-t border-gray-100">
                                    <td className="py-1.5 pr-3 text-gray-700 font-medium">Card {c.card_number}</td>
                                    <td className="py-1.5 pr-3 text-gray-700">{fmtMWK(c.card_fee)}</td>
                                    <td className="py-1.5 pr-3">
                                      <span className={`text-xs font-medium ${
                                        c.status === 'active'    ? 'text-green-600' :
                                        c.status === 'reprinted' ? 'text-amber-600' : 'text-gray-400'
                                      }`}>
                                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-600">{fmtDate(c.issued_at)}</td>
                                    {canManage && (
                                      <td className="py-1.5">
                                        {c.status === 'active' && (
                                          <button
                                            onClick={() => openCardConfirm({ type: 'reprint', holder: h, cardNum: c.card_number, fee: FM_FEES.id_card_replace, cardId: c.id })}
                                            className="text-xs px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded transition-colors"
                                          >
                                            Reprint
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {canManage && (() => {
                            const nextNum = expandedIdCards.filter(c => c.status !== 'cancelled').length + 1
                            // 30,000 covers the first TWO cards, so card #2 adds nothing. Card 3+ has no
                            // confirmed price and is charged at the replacement rate - see constants.js.
                            const issueFee = nextNum === 1 ? FM_FEES.id_card_initial
                                           : nextNum === 2 ? 0
                                           : FM_ID_CARD_EXTRA_FEE
                            return (
                              <button
                                onClick={() => openCardConfirm({ type: 'issue', holder: h, cardNum: nextNum, fee: issueFee })}
                                className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors"
                              >
                                Issue New Card
                              </button>
                            )
                          })()}
                        </div>

                        {/* Approved products, from the controlled taxonomy */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approved Products</p>
                          {expandedItems.length === 0 ? (
                            <p className="text-sm text-gray-400 mb-3">
                              Not yet classified. {canManage && 'Set the products this business is approved to sell.'}
                            </p>
                          ) : (
                            <ul className="space-y-1.5 mb-3">
                              {expandedItems.map(item => (
                                <li key={item.id} className="text-sm text-gray-700">
                                  {itemPath(taxonomy, item.item_id)}
                                  {item.item_name && <span className="text-gray-400"> · {item.item_name}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {h.products && (
                            <p className="text-xs text-gray-400 mb-3 italic">
                              From the Feb 2026 register: {h.products}
                            </p>
                          )}
                          {canManage && (
                            <button
                              onClick={() => openProductEdit(h)}
                              className="text-xs px-3 py-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg transition-colors"
                            >
                              Change Products
                            </button>
                          )}
                        </div>

                        {/* 3-month attendance */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attendance — last 3 market days</p>
                          {(() => {
                            const a = att[h.id]
                            if (!a) return <p className="text-sm text-gray-400">No attendance window available.</p>
                            return (
                              <>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {a.days.map(d => (
                                    <span key={d.market_date}
                                      className={`inline-flex flex-col items-center px-2.5 py-1 rounded-lg border text-xs ${
                                        d.attended
                                          ? 'bg-green-50 border-green-200 text-green-800'
                                          : 'bg-red-50 border-red-200 text-red-700'
                                      }`}>
                                      <span className="font-medium">{fmtDate(d.market_date)}</span>
                                      <span>{d.attended ? (d.fee_paid ? 'Attended · paid' : 'Attended') : 'Absent'}</span>
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500">
                                  {a.attended_count} of {a.days.length} attended · last visit {a.last_visit_date ? fmtDate(a.last_visit_date) : 'never'}
                                </p>
                                {a.forfeit_eligible && canManage && (
                                  <button
                                    onClick={() => setForfeitTarget(h)}
                                    className="mt-2 text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                  >
                                    Forfeit Stall
                                  </button>
                                )}
                              </>
                            )
                          })()}
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-gray-400">No businesses found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Approve / Deactivate confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">
              {confirmAction.type === 'approve' ? 'Approve Business' : 'Deactivate Business'}
            </h4>
            <p className="text-sm text-gray-600 mb-5">
              {confirmAction.type === 'approve'
                ? `Approve ${confirmAction.holder.full_name} as an active market business?`
                : `Deactivate ${confirmAction.holder.full_name}? They will no longer appear on market day check-in.`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={executeConfirm}
                className={`flex-1 font-medium py-2 rounded-lg text-sm transition-colors text-white ${
                  confirmAction.type === 'approve'
                    ? 'bg-brand-teal hover:bg-brand-teal-dark'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmAction.type === 'approve' ? 'Approve' : 'Deactivate'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editHolder && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-gray-900 mb-4">Edit Business</h4>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name *">
                  <Inp required value={editForm.full_name} onChange={ef('full_name')} />
                </Field>
                <Field label="Business Name">
                  <Inp value={editForm.business_name} onChange={ef('business_name')} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Stall Number *">
                  <Inp required placeholder="e.g. A001" value={editForm.stall_number}
                    onChange={e => { setEditStallError(''); setEditForm(p => ({ ...p, stall_number: e.target.value })) }}
                    onBlur={() => setEditForm(p => ({ ...p, stall_number: p.stall_number.trim().toUpperCase() }))} />
                  {editStallError && <p className="text-xs text-red-600 mt-1">{editStallError}</p>}
                </Field>
                <Field label="Stall Type *">
                  <Sel required value={editForm.stall_type} onChange={ef('stall_type')}>
                    {STALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Sel>
                </Field>
              </div>
              <Field label="Phone *">
                <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-brand-teal">
                  <PhoneInput
                    international
                    defaultCountry="MW"
                    value={editForm.phone}
                    onChange={val => setEditForm(p => ({ ...p, phone: val ?? '' }))}
                    inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email">
                  <Inp type="email" value={editForm.email} onChange={ef('email')} />
                </Field>
                <Field label="Status">
                  <Sel value={editForm.status} onChange={ef('status')}>
                    {Object.entries(HOLDER_STATUS_CFG).map(([val, cfg]) => (
                      <option key={val} value={val}>{cfg.label}</option>
                    ))}
                  </Sel>
                </Field>
              </div>
              <Field label="Notes">
                <textarea rows={2} className={`${fieldCls} resize-none`}
                  value={editForm.notes} onChange={ef('notes')} />
              </Field>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={busy}
                  className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                  {busy ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditHolder(null)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ID Card confirmation modal */}
      {cardConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">
              {cardConfirm.type === 'issue' ? 'Issue ID Card' : 'Reprint ID Card'}
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              {cardConfirm.type === 'issue'
                ? `Issue Card #${cardConfirm.cardNum} for ${cardConfirm.holder.full_name}? Fee: ${fmtMWK(cardConfirm.fee)}`
                : `Reprint Card #${cardConfirm.cardNum}? A fee of ${fmtMWK(FM_FEES.id_card_replace)} applies.`
              }
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                <select
                  value={cardPayMethod}
                  onChange={e => setCardPayMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  {FM_PAY_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reference <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={cardPayRef}
                  onChange={e => setCardPayRef(e.target.value)}
                  placeholder="Receipt / transaction ref"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={executeCardConfirm}
                disabled={busy}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                Confirm
              </button>
              <button
                onClick={() => setCardConfirm(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code modal */}
      {qrHolder && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-xs w-full mx-4 text-center">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Business QR Code</h4>
              <button onClick={() => setQrHolder(null)} className="text-gray-400 hover:text-gray-600 leading-none">✕</button>
            </div>
            <div id="qr-print-target" className="flex flex-col items-center gap-2 py-2">
              <p className="text-base font-semibold text-gray-900">{qrHolder.full_name}</p>
              {qrHolder.business_name && <p className="text-sm text-gray-500">{qrHolder.business_name}</p>}
              <p className="text-sm text-gray-600">Stall {qrHolder.stall_number}</p>
              <div ref={qrWrapRef}>
                <QRCodeCanvas
                  value={`https://woodlands-beta.vercel.app/checkin?holder=${qrHolder.id}`}
                  size={200}
                  level="M"
                  includeMargin
                />
              </div>
              <p className="text-xs text-gray-400">Woodlands Lodge Farmers Market</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDownloadQr}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Download QR
              </button>
              <button
                onClick={handlePrintQr}
                className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forfeit confirm — the manual step the whole rule turns on */}
      {forfeitTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-md w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">Forfeit stall {forfeitTarget.stall_number}?</h4>
            <p className="text-sm text-gray-600 mb-3">
              <strong>{forfeitTarget.full_name}</strong> has not attended any of the last three market days.
              Forfeiting will end their tenancy, free stall {forfeitTarget.stall_number}, and offer it to the
              next business on the waiting list.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              This is recorded permanently and cannot be undone from this screen.
            </p>
            <div className="flex gap-2">
              <button onClick={() => doForfeit(forfeitTarget)} disabled={busy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {busy ? 'Forfeiting…' : 'Forfeit Stall'}
              </button>
              <button onClick={() => setForfeitTarget(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product change — controlled list, and the fee is raised by the save */}
      {productEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-gray-900 mb-1">
              Change products — {productEdit.holder.full_name} ({productEdit.holder.stall_number})
            </h4>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Saving a changed product list raises the <strong>{fmtMWK(FM_FEES.product_change)}</strong> product
              change fee automatically. Saving an unchanged list raises nothing.
            </p>

            <Field label="Primary Category">
              <Sel value={productEdit.categoryId}
                onChange={e => setProductEdit(p => ({ ...p, categoryId: e.target.value }))}>
                <option value="">— none —</option>
                {(taxonomy?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel>
            </Field>

            <div className="mt-4 space-y-4">
              {(taxonomy?.byCategory ?? []).map(cat => (
                <div key={cat.id}>
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">{cat.name}</p>
                  {cat.types.map(t => (
                    <div key={t.id} className="mb-2 pl-3 border-l-2 border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">{t.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.items.map(i => {
                          const on = productEdit.selected.has(i.id)
                          return (
                            <button key={i.id} type="button" onClick={() => toggleProduct(i.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                on ? 'bg-brand-teal text-white border-brand-teal'
                                   : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                              }`}>
                              {i.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={saveProducts} disabled={itemBusy || productEdit.selected.size === 0}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
                {itemBusy ? 'Saving…' : `Save (${productEdit.selected.size} selected)`}
              </button>
              <button onClick={() => setProductEdit(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
