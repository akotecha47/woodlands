import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast } from '../admin/AdminUI'
import {
  Badge, Button, EmptyState, EmptyRow, StatRow, StatTile, TableWrap, Thead,
} from '../ui/kit'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { fmtDate, fmtMWK, defaultMarketDate, FM_PAY_METHODS, todayStr, isMarketDay, getMarketDayForMonth } from './FarmersMarketUI'
import { useFeeSchedule } from '../../lib/fm'
import { useFlash } from '../ui/useFlash'

// The market-day visit fee is fm_fee_schedule's `visit` row (C-08). It was a
// module constant here, which is why editing the fee in FeesTab changed nothing
// on this screen.

function fmtTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function MarketDayTab() {
  const { profile, session } = useAuth()
  const canCheckIn = FM_MANAGE_ROLES.includes(profile?.role)
  const canManage  = FM_MANAGE_ROLES.includes(profile?.role)

  const { fee } = useFeeSchedule()
  const visitFee = fee('visit')

  const [marketDate,      setMarketDate]      = useState(defaultMarketDate)
  const [holders,         setHolders]         = useState([])
  const [visitMap,        setVisitMap]        = useState({}) // holder_id → visit row
  const [notesPrompt,     setNotesPrompt]     = useState(null) // { visitId, holderName }
  const [visitNote,       setVisitNote]       = useState('')
  const [feeModal,        setFeeModal]        = useState(null) // { holder, visitId }
  const [feeMethod,       setFeeMethod]       = useState('cash')
  const [feeAmount,       setFeeAmount]       = useState('')
  const [feeBusy,         setFeeBusy]         = useState(false)
  const [removeConfirm,   setRemoveConfirm]   = useState(null) // { holder, visitId }
  const [addModal,        setAddModal]        = useState(false)
  const [conditions,      setConditions]      = useState('')
  const [conditionsId,    setConditionsId]    = useState(null)
  const [conditionsDirty, setConditionsDirty] = useState(false)
  const [live,            setLive]            = useState(false)
  const [toast,           setToast]           = useState(null)
  const flash           = useFlash(setToast)
  const conditionsTimer = useRef(null)

  // ── data ──────────────────────────────────────────────────────────────────

  async function load() {
    const [holdersR, visitsR, mdR] = await Promise.all([
      supabase.from('fm_holders').select('*').eq('status', 'active').order('stall_number'),
      supabase.from('fm_visits').select('*').eq('visit_date', marketDate),
      supabase.from('fm_market_days').select('id, notes').eq('market_date', marketDate).maybeSingle(),
    ])
    setHolders(holdersR.data ?? [])
    const map = {}
    for (const v of (visitsR.data ?? [])) map[v.holder_id] = v
    setVisitMap(map)
    setConditions(mdR.data?.notes ?? '')
    setConditionsId(mdR.data?.id ?? null)
    setConditionsDirty(false)
  }

  async function reloadVisits() {
    const { data } = await supabase
      .from('fm_visits').select('*').eq('visit_date', marketDate)
    const map = {}
    for (const v of (data ?? [])) map[v.holder_id] = v
    setVisitMap(map)
  }

  useEffect(() => {
    load()

    async function refetchVisit(holderId) {
      if (!holderId) return
      const { data: visit } = await supabase
        .from('fm_visits')
        .select('*')
        .eq('holder_id', holderId)
        .eq('visit_date', marketDate)
        .maybeSingle()
      setVisitMap(prev => {
        if (visit) return { ...prev, [holderId]: visit }
        const next = { ...prev }
        delete next[holderId]
        return next
      })
    }

    const channel = supabase
      .channel(`market-day-${marketDate}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fm_visits',
        filter: `visit_date=eq.${marketDate}`,
      }, payload => {
        refetchVisit(payload.new?.holder_id ?? payload.old?.holder_id)
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fm_payments',
        filter: `payment_date=eq.${marketDate}`,
      }, payload => {
        refetchVisit(payload.new?.holder_id ?? payload.old?.holder_id)
      })
      .subscribe(status => setLive(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [marketDate])

  // ── check-in ──────────────────────────────────────────────────────────────

  async function handleCheckIn(holder) {
    if (!canCheckIn || visitMap[holder.id]) return
    try {
      const { data, error } = await supabase.from('fm_visits').insert({
        holder_id:     holder.id,
        visit_date:    marketDate,
        checked_in_by: session?.user?.id ?? null,
        fee_paid:      false,
      }).select().single()
      if (error) throw error
      setVisitMap(prev => ({ ...prev, [holder.id]: data }))
      setNotesPrompt({ visitId: data.id, holderName: holder.full_name })
      setVisitNote('')
    } catch (err) { flash(err.message, false) }
  }

  async function handleSaveNote() {
    const { visitId } = notesPrompt
    try {
      await supabase.from('fm_visits').update({ notes: visitNote || null }).eq('id', visitId)
      setVisitMap(prev => {
        const holderId = Object.keys(prev).find(id => prev[id].id === visitId)
        if (!holderId) return prev
        return { ...prev, [holderId]: { ...prev[holderId], notes: visitNote || null } }
      })
    } catch (err) { flash(err.message, false) }
    setNotesPrompt(null)
  }

  // ── fee logging ───────────────────────────────────────────────────────────

  async function handleLogFee() {
    const { holder, visitId } = feeModal
    setFeeBusy(true)
    try {
      await Promise.all([
        supabase.from('fm_payments').insert({
          holder_id:      holder.id,
          payment_type:   'visit',
          amount:         Number(feeAmount) || visitFee,
          payment_date:   marketDate,
          payment_method: feeMethod,
          recorded_by:    session?.user?.id ?? null,
        }),
        supabase.from('fm_visits').update({ fee_paid: true })
          .eq('holder_id', holder.id).eq('visit_date', marketDate),
      ])
      await reloadVisits()
      flash('Visit fee recorded')
      setFeeModal(null)
    } catch (err) { flash(err.message, false) }
    finally { setFeeBusy(false) }
  }

  // ── remove ────────────────────────────────────────────────────────────────

  async function handleRemove() {
    const { holder, visitId } = removeConfirm
    setRemoveConfirm(null)
    try {
      await Promise.all([
        supabase.from('fm_visits').delete().eq('id', visitId),
        supabase.from('fm_payments')
          .delete()
          .eq('holder_id', holder.id)
          .eq('payment_date', marketDate)
          .eq('payment_type', 'visit'),
      ])
      setVisitMap(prev => {
        const next = { ...prev }
        delete next[holder.id]
        return next
      })
      flash(`${holder.full_name} removed from this market day`)
    } catch (err) { flash(err.message, false) }
  }

  async function handleAddFromModal(holder) {
    try {
      const { data, error } = await supabase.from('fm_visits').insert({
        holder_id:     holder.id,
        visit_date:    marketDate,
        checked_in_by: session?.user?.id ?? null,
        fee_paid:      false,
      }).select().single()
      if (error) throw error
      setVisitMap(prev => ({ ...prev, [holder.id]: data }))
      setAddModal(false)
      flash(`${holder.full_name} added`)
    } catch (err) { flash(err.message, false) }
  }

  // ── market conditions ─────────────────────────────────────────────────────

  // Errors were previously swallowed here, and setConditionsDirty(false) ran
  // unconditionally, so a failed save cleared the "Saving…" hint exactly like a
  // successful one. That is how this went unnoticed while fm_market_days did not
  // even exist: every save silently vanished and the UI reported nothing.
  async function persistConditions(val) {
    try {
      if (conditionsId) {
        const { error } = await supabase.from('fm_market_days').update({
          notes:      val,
          updated_by: session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', conditionsId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('fm_market_days').insert({
          market_date: marketDate,
          notes:       val,
          updated_by:  session?.user?.id ?? null,
        }).select('id').single()
        if (error) throw error
        if (data) setConditionsId(data.id)
      }
      setConditionsDirty(false)
    } catch (err) {
      // Leave conditionsDirty set, so the hint stays and the failure is visible.
      flash(`Could not save market conditions: ${err.message}`, false)
    }
  }

  function handleConditionsChange(val) {
    setConditions(val)
    setConditionsDirty(true)
    clearTimeout(conditionsTimer.current)
    conditionsTimer.current = setTimeout(() => persistConditions(val), 1500)
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const today          = todayStr()
  const isDecemberDate = new Date(marketDate + 'T12:00:00').getMonth() === 11
  const validMarketDay = isMarketDay(marketDate)
  const isToday        = marketDate === today
  const nextMarketDay  = isDecemberDate
    ? getMarketDayForMonth(new Date(marketDate + 'T12:00:00').getFullYear() + 1, 0)
    : null
  const checkedInCount = Object.keys(visitMap).filter(id => holders.some(h => h.id === id)).length
  const collected      = Object.values(visitMap).filter(v => v.fee_paid).length * visitFee
  const expected       = checkedInCount * visitFee
  const outstanding    = expected - collected
  const unaddedHolders = holders.filter(h => !visitMap[h.id])
  const colSpan        = 5 + (canManage ? 1 : 0)

  const sortedHolders = checkedInCount > 0
    ? [...holders].sort((a, b) => {
        const aV = visitMap[a.id]
        const bV = visitMap[b.id]
        if (aV && bV) return new Date(aV.created_at) - new Date(bV.created_at)
        if (aV) return -1
        if (bV) return 1
        return a.stall_number.localeCompare(b.stall_number)
      })
    : holders

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Header row. The "Live" dot is a real realtime subscription, not
          decoration — it reports whether the channel is connected. */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Market date" className="w-48">
            <Inp type="date" value={marketDate} onChange={e => setMarketDate(e.target.value)} />
          </Field>
          {validMarketDay && isToday ? (
            <div className="flex items-center gap-1.5 pb-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${live ? 'bg-ok animate-pulse' : 'bg-gray-300'}`} />
              <span className={`text-xs font-semibold ${live ? 'text-green-700' : 'text-gray-400'}`}>
                {live ? 'Live' : 'Connecting…'}
              </span>
            </div>
          ) : validMarketDay ? (
            <div className="pb-2.5"><Badge tone="brand">Scheduled</Badge></div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 pb-0.5">
          <span className="text-sm font-semibold text-navy tnum">
            {checkedInCount} / {holders.length} checked in
          </span>
          {canManage && !isDecemberDate && (
            <Button onClick={() => setAddModal(true)}>Add business</Button>
          )}
        </div>
      </div>

      {/* Market conditions */}
      {(canManage || conditions) && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-medium text-gray-500">Market Conditions</label>
            {conditionsDirty && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
          {/* Editable for any market day the user can manage, past included.
              This was previously `disabled={!canManage || isPast}`, where
              isPast = marketDate < today. Because the tab opens on the CURRENT
              month's market day (defaultMarketDate), that locked the field from
              the day after market day until month end — 29 days in 30 — and it
              was the only thing isPast gated. Check-in and fee collection have
              always worked on past dates, so blocking the note about the day
              while allowing edits to the day's records was inconsistent: you
              could take a holder's fee for yesterday's market but not write down
              what the weather was. */}
          <input
            type="text"
            value={conditions}
            onChange={e => handleConditionsChange(e.target.value)}
            disabled={!canManage}
            placeholder={canManage ? 'Describe conditions for this market day…' : 'No conditions recorded'}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm wl-transition hover:border-gray-400 focus:border-teal focus:ring-2 focus:ring-teal/25 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
        </div>
      )}

      {/* Fee reconciliation — the consistent stat treatment. */}
      {checkedInCount > 0 && (
        <StatRow cols={3} className="mb-5">
          <StatTile label="Expected"    value={fmtMWK(expected)}  foot="Visit fee × businesses checked in" />
          <StatTile label="Collected"   value={fmtMWK(collected)} tone="ok" />
          <StatTile
            label="Outstanding"
            value={fmtMWK(outstanding)}
            tone={outstanding > 0 ? 'alert' : 'neutral'}
            foot={outstanding > 0 ? 'Fees still to log' : 'All fees logged'}
          />
        </StatRow>
      )}

      {/* Non-valid, non-December amber note */}
      {!isDecemberDate && !validMarketDay && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Not a scheduled market day (markets run on the last Saturday of each month).
        </div>
      )}

      {/* Holders table or December empty state */}
      {/* The "Type" column was `stall_type`, which is 'Other' on all 311 live
          rows (AUDIT_3 §7) — a column that said the same word on every line of a
          check-in sheet. The real classification is the 3-level taxonomy, shown
          on the Businesses tab where it belongs; on market day what matters is
          the stall, the name and whether they have paid. Dropped rather than
          re-pointed: this screen does not load the taxonomy and Block 2 adds no
          queries (U-10). */}
      {isDecemberDate ? (
        <div className="border border-line rounded-xl bg-white">
          <EmptyState
            title="No market in December"
            body={nextMarketDay
              ? `The market runs on the last Saturday of every month except December. Next market day: ${fmtDate(nextMarketDay)}.`
              : 'The market runs on the last Saturday of every month except December.'}
          />
        </div>
      ) : (
      <TableWrap>
        <table className="w-full">
          <Thead>
            <tr>
              <Th>Stall</Th>
              <Th>Name</Th>
              <Th>Business</Th>
              <Th>Check in</Th>
              <Th>Log fee</Th>
              {canManage && <Th>Remove</Th>}
            </tr>
          </Thead>
          <tbody>
            {sortedHolders.map(h => {
              const visit     = visitMap[h.id]
              const checkedIn = !!visit
              const feePaid   = visit?.fee_paid ?? false
              const arrTime   = fmtTime(visit?.created_at)
              return (
                <tr key={h.id} className={`border-b border-line wl-transition ${
                  checkedIn ? 'bg-green-50/40' : 'hover:bg-gray-50'
                }`}>
                  <Td><span className="font-semibold text-navy">{h.stall_number}</span></Td>
                  <td className="px-4 py-3 text-sm font-semibold text-navy">{h.full_name}</td>
                  <Td>{h.business_name}</Td>
                  <td className="px-4 py-3">
                    {canCheckIn ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCheckIn(h)}
                          disabled={checkedIn}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border wl-transition ${
                            checkedIn
                              ? 'bg-green-100 text-green-700 border-green-200 cursor-default'
                              : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          {checkedIn ? `✓ ${arrTime ?? ''}` : 'Check In'}
                        </button>
                        {visit?.notes && (
                          <span title={visit.notes} className="text-blue-400 cursor-help text-xs select-none">📝</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${checkedIn ? 'text-green-600' : 'text-gray-400'}`}>
                          {checkedIn ? `Yes${arrTime ? ` (${arrTime})` : ''}` : 'No'}
                        </span>
                        {visit?.notes && (
                          <span title={visit.notes} className="text-blue-400 cursor-help text-xs select-none">📝</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {feePaid ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-green-100 text-green-700">
                        ✓ Paid
                      </span>
                    ) : checkedIn && canManage ? (
                      <button
                        onClick={() => { setFeeModal({ holder: h, visitId: visit.id }); setFeeMethod('cash'); setFeeAmount(String(visitFee)) }}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 wl-transition"
                      >
                        Log Fee
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-400">—</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-3 text-center">
                      {checkedIn && (
                        <button
                          onClick={() => setRemoveConfirm({ holder: h, visitId: visit.id })}
                          className="text-gray-300 hover:text-red-500 wl-transition font-bold leading-none"
                          title={`Remove ${h.full_name} from this market day`}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {holders.length === 0 && (
              <EmptyRow
                cols={colSpan}
                msg="No active businesses to check in. Approve a business under Businesses and it will appear on the market-day sheet."
              />
            )}
          </tbody>
        </table>
      </TableWrap>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Add Holder */}
      {addModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Add Business to {fmtDate(marketDate)}</h4>
              <button onClick={() => setAddModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            {unaddedHolders.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">All active businesses are already on the list.</p>
            ) : (
              <ul className="divide-y divide-line max-h-72 overflow-y-auto">
                {unaddedHolders.map(h => (
                  <li key={h.id}>
                    <button
                      onClick={() => handleAddFromModal(h)}
                      className="w-full text-left px-3 py-3 hover:bg-green-50 wl-transition rounded-lg"
                    >
                      <span className="text-sm font-semibold text-navy">{h.full_name}</span>
                      {/* `stall_type` dropped here for the same reason the Type
                          column was (see above): it is 'Other' on all 311 live
                          rows, so it added a word that never varied. The stall
                          number is the identifier that actually distinguishes
                          one line from the next. */}
                      <span className="text-xs text-gray-400 ml-2">Stall {h.stall_number}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setAddModal(false)}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm wl-transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Log fee modal */}
      {feeModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-1">Log Visit Fee</h4>
            <p className="text-sm text-gray-600 mb-4">
              {feeModal.holder.full_name}
              {feeModal.holder.stall_number && ` — Stall ${feeModal.holder.stall_number}`}
            </p>
            <Field label="Amount (MWK)" className="mb-4">
              <Inp
                type="number"
                min="0.01"
                step="any"
                value={feeAmount}
                onChange={e => setFeeAmount(e.target.value)}
              />
            </Field>
            <Field label="Payment Method" className="mb-5">
              <Sel
                value={feeMethod}
                onChange={e => setFeeMethod(e.target.value)}
              >
                {FM_PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Sel>
            </Field>
            <div className="flex gap-3">
              <Button onClick={handleLogFee} disabled={feeBusy} className="flex-1">
                {feeBusy ? 'Saving…' : 'Confirm Payment'}
              </Button>
              <Button variant="secondary" onClick={() => setFeeModal(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Visit notes prompt */}
      {notesPrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-1">Any notes for this visit?</h4>
            <p className="text-xs text-gray-400 mb-3">{notesPrompt.holderName}</p>
            <textarea
              rows={3}
              value={visitNote}
              onChange={e => setVisitNote(e.target.value)}
              placeholder="e.g. late arrival, low stock, paid in advance…"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm wl-transition hover:border-gray-400 focus:border-teal focus:ring-2 focus:ring-teal/25 resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button onClick={handleSaveNote} className="flex-1">
                Save
              </Button>
              <Button variant="secondary" onClick={() => setNotesPrompt(null)} className="flex-1">
                Skip
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">Remove from market day?</h4>
            <p className="text-sm text-gray-600 mb-1">
              Remove <span className="font-medium">{removeConfirm.holder.full_name}</span> from {fmtDate(marketDate)}?
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Any visit fee payment logged for this visit will also be deleted.
            </p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleRemove} className="flex-1">
                Remove
              </Button>
              <Button variant="secondary" onClick={() => setRemoveConfirm(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
