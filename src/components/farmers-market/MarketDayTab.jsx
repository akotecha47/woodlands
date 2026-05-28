import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { fmtDate, fmtMWK, defaultMarketDate, FM_MANAGE_ROLES } from './FarmersMarketUI'

export default function MarketDayTab() {
  const { profile, session } = useAuth()
  const canCheckIn = FM_MANAGE_ROLES.includes(profile?.role)

  const [marketDate, setMarketDate] = useState(defaultMarketDate)
  const [holders,    setHolders]    = useState([])
  const [visitMap,   setVisitMap]   = useState({}) // holder_id → visit row
  const [feePrompt,  setFeePrompt]  = useState(null) // { holder, visitId }
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const [holdersR, visitsR] = await Promise.all([
      supabaseAdmin.from('fm_holders').select('*').eq('status', 'active').order('stall_number'),
      supabaseAdmin.from('fm_visits').select('*').eq('visit_date', marketDate),
    ])
    setHolders(holdersR.data ?? [])
    const map = {}
    for (const v of (visitsR.data ?? [])) map[v.holder_id] = v
    setVisitMap(map)
  }

  useEffect(() => { load() }, [marketDate])

  async function handleCheckIn(holder) {
    if (!canCheckIn) return
    const existing = visitMap[holder.id]
    if (existing) {
      try {
        await supabaseAdmin.from('fm_visits').delete().eq('id', existing.id)
        setVisitMap(prev => { const next = { ...prev }; delete next[holder.id]; return next })
      } catch (err) { flash(err.message, false) }
      return
    }
    try {
      const { data, error } = await supabaseAdmin.from('fm_visits').insert({
        holder_id:     holder.id,
        visit_date:    marketDate,
        checked_in_by: session?.user?.id ?? null,
        fee_paid:      false,
      }).select().single()
      if (error) throw error
      setVisitMap(prev => ({ ...prev, [holder.id]: data }))
      setFeePrompt({ holder, visitId: data.id })
    } catch (err) { flash(err.message, false) }
  }

  async function handleConfirmFee() {
    const { holder, visitId } = feePrompt
    try {
      await Promise.all([
        supabaseAdmin.from('fm_payments').insert({
          holder_id:      holder.id,
          payment_type:   'visit',
          amount:         10000,
          payment_date:   marketDate,
          payment_method: 'cash',
          recorded_by:    session?.user?.id ?? null,
        }),
        supabaseAdmin.from('fm_visits').update({ fee_paid: true }).eq('id', visitId),
      ])
      flash('Visit fee recorded')
      setFeePrompt(null)
      load()
    } catch (err) { flash(err.message, false) }
  }

  const checkedInCount = Object.keys(visitMap).filter(id => holders.some(h => h.id === id)).length

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Date picker + counter */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Market Date</label>
          <input
            type="date"
            value={marketDate}
            onChange={e => setMarketDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div className="ml-auto bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <span className="text-sm font-semibold text-green-700">
            {checkedInCount} / {holders.length} checked in
          </span>
        </div>
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
              <Th>Checked In</Th>
              <Th>Fee Paid</Th>
            </tr>
          </thead>
          <tbody>
            {holders.map(h => {
              const visit      = visitMap[h.id]
              const checkedIn  = !!visit
              const feePaid    = visit?.fee_paid ?? false
              return (
                <tr key={h.id} className={`border-b border-gray-100 transition-colors ${checkedIn ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
                  <Td>{h.stall_number}</Td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{h.full_name}</td>
                  <Td>{h.business_name}</Td>
                  <Td>{h.stall_type}</Td>
                  <td className="px-4 py-3">
                    {canCheckIn ? (
                      <button
                        onClick={() => handleCheckIn(h)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                          checkedIn
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {checkedIn ? 'Checked In ✓' : 'Check In'}
                      </button>
                    ) : (
                      <span className={`text-xs font-medium ${checkedIn ? 'text-green-600' : 'text-gray-400'}`}>
                        {checkedIn ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      feePaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {feePaid ? 'Paid' : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {holders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No active holders</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Visit fee prompt modal */}
      {feePrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">Log Visit Fee Payment?</h4>
            <p className="text-sm text-gray-700 mb-1">
              <span className="font-medium">{feePrompt.holder.full_name}</span>
              {feePrompt.holder.stall_number && ` — Stall ${feePrompt.holder.stall_number}`}
            </p>
            <p className="text-sm text-gray-500 mb-5">Amount: {fmtMWK(10000)}</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmFee}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setFeePrompt(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
