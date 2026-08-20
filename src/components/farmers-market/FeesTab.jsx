import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, EmptyRow } from '../admin/AdminUI'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { fetchFeeSchedule } from '../../lib/fm'
import { fmtDate, fmtMWK, AccessDenied } from './FarmersMarketUI'
import { useFlash } from '../ui/useFlash'

// Reading the schedule is owner + admin; CHANGING it is owner only, enforced by
// RLS in migration 061 (fm_fee_schedule_owner_insert / _owner_update). A fee
// change is a money action, not front-desk work. The UI mirrors that rather
// than offering an admin a button the database will silently no-op.
export default function FeesTab() {
  const { profile, session } = useAuth()
  const canView = FM_MANAGE_ROLES.includes(profile?.role)
  const canEdit = profile?.role === 'owner'

  const [fees,    setFees]    = useState([])
  const [editing, setEditing] = useState(null) // { fee_code, amount }
  const [busy,    setBusy]    = useState(false)
  const [toast,   setToast]   = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    try { setFees((await fetchFeeSchedule()).fees) }
    catch (err) { flash(err.message, false) }
  }

  useEffect(() => { load() }, [])

  if (!canView) return <AccessDenied />

  async function save() {
    const amount = Number(editing.amount)
    if (!Number.isFinite(amount) || amount <= 0) { flash('Amount must be greater than zero', false); return }
    setBusy(true)
    try {
      const { error } = await supabase.from('fm_fee_schedule')
        .update({ amount, updated_by: session?.user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('fee_code', editing.fee_code)
      if (error) throw error
      flash('Fee updated')
      setEditing(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function toggleActive(fee) {
    try {
      const { error } = await supabase.from('fm_fee_schedule')
        .update({ is_active: !fee.is_active, updated_by: session?.user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('fee_code', fee.fee_code)
      if (error) throw error
      load()
    } catch (err) { flash(err.message, false) }
  }

  return (
    <div className="p-6">
      <Toast toast={toast} />

      <h2 className="text-[15px] font-bold text-navy">Fee Schedule</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-5">
        {/* BLOCK 3 / G — was "All six confirmed by Dhiren, 18 August 2026", an
            internal provenance note on a client-facing screen. The provenance
            belongs in the repo, not in the product. */}
        The amounts the Farmers Market charges.
        {canEdit
          ? ' Changing an amount here takes effect immediately — no deploy needed.'
          : ' Only the owner can change an amount.'}
      </p>

      <div className="wl-scroll-x border border-line rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-line">
            <tr><Th>Fee</Th><Th>Code</Th><Th>Amount</Th><Th>Status</Th><Th>Updated</Th>{canEdit && <Th>Actions</Th>}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fees.map(fee => (
              <tr key={fee.fee_code} className={fee.is_active ? 'hover:bg-gray-50' : 'bg-gray-50 text-gray-400'}>
                <Td>
                  {fee.label}
                  {fee.fee_code === 'product_change' && (
                    <span className="block text-xs text-gray-400">
                      Raised automatically when a business changes its products
                    </span>
                  )}
                  {fee.fee_code === 'id_card_initial' && (
                    <span className="block text-xs text-gray-400">Covers the first two cards</span>
                  )}
                </Td>
                <Td><code className="text-xs text-gray-500">{fee.fee_code}</code></Td>
                <Td>
                  {editing?.fee_code === fee.fee_code ? (
                    <input type="number" value={editing.amount} autoFocus
                      onChange={e => setEditing(p => ({ ...p, amount: e.target.value }))}
                      className="w-32 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm wl-transition focus:border-teal focus:ring-2 focus:ring-teal/25" />
                  ) : (
                    <span className="font-semibold text-gray-900">{fmtMWK(fee.amount)}</span>
                  )}
                </Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                    fee.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {fee.is_active ? 'Active' : 'Retired'}
                  </span>
                </Td>
                <Td>{fee.updated_at ? fmtDate(fee.updated_at) : '—'}</Td>
                {canEdit && (
                  <Td>
                    <div className="flex gap-1.5">
                      {editing?.fee_code === fee.fee_code ? (
                        <>
                          <button onClick={save} disabled={busy}
                            className="text-xs px-2 py-0.5 bg-teal text-white rounded wl-transition disabled:opacity-50">Save</button>
                          <button onClick={() => setEditing(null)}
                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded wl-transition">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditing({ fee_code: fee.fee_code, amount: String(fee.amount) })}
                            className="text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded wl-transition">Edit</button>
                          <button onClick={() => toggleActive(fee)}
                            className="text-xs px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded wl-transition">
                            {fee.is_active ? 'Retire' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
            {fees.length === 0 && (
              <EmptyRow
                cols={6}
                msg="No fees configured. This schedule is what the market charges for stalls, ID cards and product changes — until it has rows there is nothing to quote from."
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
