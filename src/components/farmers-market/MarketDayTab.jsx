import { useState, useEffect, useRef } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { fmtDate, fmtMWK, defaultMarketDate, FM_MANAGE_ROLES, FM_PAY_METHODS, todayStr, isMarketDay, getMarketDayForMonth } from './FarmersMarketUI'

const VISIT_FEE = 10000

function fmtTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function MarketDayTab() {
  const { profile, session } = useAuth()
  const canCheckIn = FM_MANAGE_ROLES.includes(profile?.role)
  const canManage  = ['owner', 'manager'].includes(profile?.role)

  const [marketDate,      setMarketDate]      = useState(defaultMarketDate)
  const [holders,         setHolders]         = useState([])
  const [visitMap,        setVisitMap]        = useState({}) // holder_id → visit row
  const [notesPrompt,     setNotesPrompt]     = useState(null) // { visitId, holderName }
  const [visitNote,       setVisitNote]       = useState('')
  const [feeModal,        setFeeModal]        = useState(null) // { holder, visitId }
  const [feeMethod,       setFeeMethod]       = useState('cash')
  const [feeAmount,       setFeeAmount]       = useState(String(VISIT_FEE))
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
      supabaseAdmin.from('fm_holders').select('*').eq('status', 'active').order('stall_number'),
      supabaseAdmin.from('fm_visits').select('*').eq('visit_date', marketDate),
      supabaseAdmin.from('fm_market_days').select('id, notes').eq('market_date', marketDate).maybeSingle(),
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
    const { data } = await supabaseAdmin
      .from('fm_visits').select('*').eq('visit_date', marketDate)
    const map = {}
    for (const v of (data ?? [])) map[v.holder_id] = v
    setVisitMap(map)
  }

  useEffect(() => {
    load()

    async function refetchVisit(holderId) {
      if (!holderId) return
      const { data: visit } = await supabaseAdmin
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

    const channel = supabaseAdmin
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

    return () => { supabaseAdmin.removeChannel(channel) }
  }, [marketDate])

  // ── check-in ──────────────────────────────────────────────────────────────

  async function handleCheckIn(holder) {
    if (!canCheckIn || visitMap[holder.id]) return
    try {
      const { data, error } = await supabaseAdmin.from('fm_visits').insert({
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
      await supabaseAdmin.from('fm_visits').update({ notes: visitNote || null }).eq('id', visitId)
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
        supabaseAdmin.from('fm_payments').insert({
          holder_id:      holder.id,
          payment_type:   'visit',
          amount:         Number(feeAmount) || VISIT_FEE,
          payment_date:   marketDate,
          payment_method: feeMethod,
          recorded_by:    session?.user?.id ?? null,
        }),
        supabaseAdmin.from('fm_visits').update({ fee_paid: true })
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
        supabaseAdmin.from('fm_visits').delete().eq('id', visitId),
        supabaseAdmin.from('fm_payments')
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
      const { data, error } = await supabaseAdmin.from('fm_visits').insert({
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

  async function persistConditions(val) {
    if (conditionsId) {
      await supabaseAdmin.from('fm_market_days').update({
        notes:      val,
        updated_by: session?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', conditionsId)
    } else {
      const { data } = await supabaseAdmin.from('fm_market_days').insert({
        market_date: marketDate,
        notes:       val,
        updated_by:  session?.user?.id ?? null,
      }).select('id').single()
      if (data) setConditionsId(data.id)
    }
    setConditionsDirty(false)
  }

  function handleConditionsChange(val) {
    setConditions(val)
    setConditionsDirty(true)
    clearTimeout(conditionsTimer.current)
    conditionsTimer.current = setTimeout(() => persistConditions(val), 1500)
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const today          = todayStr()
  const isPast         = marketDate < today
  const isDecemberDate = new Date(marketDate + 'T12:00:00').getMonth() === 11
  const validMarketDay = isMarketDay(marketDate)
  const isToday        = marketDate === today
  const nextMarketDay  = isDecemberDate
    ? getMarketDayForMonth(new Date(marketDate + 'T12:00:00').getFullYear() + 1, 0)
    : null
  const checkedInCount = Object.keys(visitMap).filter(id => holders.some(h => h.id === id)).length
  const collected      = Object.values(visitMap).filter(v => v.fee_paid).length * VISIT_FEE
  const expected       = checkedInCount * VISIT_FEE
  const outstanding    = expected - collected
  const unaddedHolders = holders.filter(h => !visitMap[h.id])
  const colSpan        = 6 + (canManage ? 1 : 0)

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

      {/* Header row */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Market Date</label>
          <input
            type="date"
            value={marketDate}
            onChange={e => setMarketDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          {validMarketDay && isToday ? (
            <div className="flex items-center gap-1.5 ml-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${live ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className={`text-xs font-medium ${live ? 'text-green-600' : 'text-gray-400'}`}>
                {live ? 'Live' : 'Connecting…'}
              </span>
            </div>
          ) : validMarketDay ? (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
              <span className="text-xs font-medium text-blue-600">Scheduled</span>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage && !isDecemberDate && (
            <button
              onClick={() => setAddModal(true)}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              + Add Holder
            </button>
          )}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <span className="text-sm font-semibold text-green-700">
              {checkedInCount} / {holders.length} checked in
            </span>
          </div>
        </div>
      </div>

      {/* Market conditions */}
      {(canManage || conditions) && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-medium text-gray-500">Market Conditions</label>
            {conditionsDirty && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
          <input
            type="text"
            value={conditions}
            onChange={e => handleConditionsChange(e.target.value)}
            disabled={!canManage || isPast}
            placeholder={canManage && !isPast ? 'Describe conditions for this market day…' : 'No conditions recorded'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
        </div>
      )}

      {/* Fee reconciliation strip */}
      {checkedInCount > 0 && (
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 flex-1 min-w-[120px]">
            <p className="text-xs text-gray-500 mb-0.5">Expected</p>
            <p className="text-sm font-semibold text-gray-900">{fmtMWK(expected)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex-1 min-w-[120px]">
            <p className="text-xs text-green-700 mb-0.5">Collected</p>
            <p className="text-sm font-semibold text-green-800">{fmtMWK(collected)}</p>
          </div>
          <div className={`border rounded-lg px-4 py-2.5 flex-1 min-w-[120px] ${
            outstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-xs mb-0.5 ${outstanding > 0 ? 'text-red-700' : 'text-gray-500'}`}>Outstanding</p>
            <p className={`text-sm font-semibold ${outstanding > 0 ? 'text-red-800' : 'text-gray-900'}`}>
              {fmtMWK(outstanding)}
            </p>
          </div>
        </div>
      )}

      {/* Non-valid, non-December amber note */}
      {!isDecemberDate && !validMarketDay && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Not a scheduled market day (markets run on the last Saturday of each month).
        </div>
      )}

      {/* Holders table or December empty state */}
      {isDecemberDate ? (
        <div className="rounded-xl border border-gray-200 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">No market in December.</p>
          {nextMarketDay && (
            <p className="mt-1 text-xs text-gray-500">
              Next market day: <span className="font-medium">{fmtDate(nextMarketDay)}</span>
            </p>
          )}
        </div>
      ) : (
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Stall No</Th>
              <Th>Name</Th>
              <Th>Business</Th>
              <Th>Type</Th>
              <Th>Check In</Th>
              <Th>Log Fee</Th>
              {canManage && <Th>Remove</Th>}
            </tr>
          </thead>
          <tbody>
            {sortedHolders.map(h => {
              const visit     = visitMap[h.id]
              const checkedIn = !!visit
              const feePaid   = visit?.fee_paid ?? false
              const arrTime   = fmtTime(visit?.created_at)
              return (
                <tr key={h.id} className={`border-b border-gray-100 transition-colors ${
                  checkedIn ? 'bg-green-50/40' : 'hover:bg-gray-50'
                }`}>
                  <Td>{h.stall_number}</Td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{h.full_name}</td>
                  <Td>{h.business_name}</Td>
                  <Td>{h.stall_type}</Td>
                  <td className="px-4 py-3">
                    {canCheckIn ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCheckIn(h)}
                          disabled={checkedIn}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
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
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ✓ Paid
                      </span>
                    ) : checkedIn && canManage ? (
                      <button
                        onClick={() => { setFeeModal({ holder: h, visitId: visit.id }); setFeeMethod('cash'); setFeeAmount(String(VISIT_FEE)) }}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Log Fee
                      </button>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">—</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-3 text-center">
                      {checkedIn && (
                        <button
                          onClick={() => setRemoveConfirm({ holder: h, visitId: visit.id })}
                          className="text-gray-300 hover:text-red-500 transition-colors font-bold leading-none"
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
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-400">No active holders</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Add Holder */}
      {addModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Add Holder to {fmtDate(marketDate)}</h4>
              <button onClick={() => setAddModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            {unaddedHolders.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">All active holders are already on the list.</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {unaddedHolders.map(h => (
                  <li key={h.id}>
                    <button
                      onClick={() => handleAddFromModal(h)}
                      className="w-full text-left px-3 py-3 hover:bg-green-50 transition-colors rounded-lg"
                    >
                      <span className="text-sm font-medium text-gray-900">{h.full_name}</span>
                      <span className="text-xs text-gray-400 ml-2">Stall {h.stall_number} · {h.stall_type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setAddModal(false)}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
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
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (MWK)</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={feeAmount}
                onChange={e => setFeeAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={feeMethod}
                onChange={e => setFeeMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                {FM_PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleLogFee}
                disabled={feeBusy}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {feeBusy ? 'Saving…' : 'Confirm Payment'}
              </button>
              <button
                onClick={() => setFeeModal(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleSaveNote}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setNotesPrompt(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Skip
              </button>
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
              <button
                onClick={handleRemove}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Remove
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
