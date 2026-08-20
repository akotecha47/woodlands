import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Txt, Th, Td, Toast } from '../admin/AdminUI'
import { Button, FormGrid, FormActions, SectionHead, TableWrap, Thead } from '../ui/kit'
import { itemLabel, EmptyRow, TdBold, ReqStatusBadge, fetchActiveItems, fetchDepartmentList, fetchUserMap } from './InventoryUI'
import { issueStock, fulfilRequisitionBatch } from '../../lib/stock'
import { MANAGE_ROLES } from '../../lib/roles'
import { MAIN_STORE } from '../../lib/constants'
import { useFlash } from '../ui/useFlash'

export default function RequisitionsTab() {
  const { profile, session } = useAuth()
  const [items,      setItems]      = useState([])
  const [departments,setDepartments]= useState([])
  const [reqs,       setReqs]       = useState([])
  const [userNames,  setUserNames]  = useState({}) // uuid → full_name
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({ stock_item_id: '', department: '', quantity: '', reason: '' })

  const isManager = MANAGE_ROLES.includes(profile?.role)

  async function fetchReqs() {
    if (!session?.user?.id) return
    let q = supabase
      .from('requisitions')
      .select('*')
      .order('created_at', { ascending: false })
    if (!isManager) q = q.eq('requested_by', session.user.id)
    const { data, error } = await q
    if (error) { flash(error.message, false); return }
    setReqs(data ?? [])
  }

  useEffect(() => {
    fetchActiveItems().then(setItems)
    fetchDepartmentList().then(setDepartments)
    fetchUserMap().then(setUserNames)
    fetchReqs()
  }, [profile?.role, session?.user?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.from('requisitions').insert({
        stock_item_id: form.stock_item_id,
        requested_by:  session.user.id,
        department:    form.department || profile?.department || null,
        quantity:      Number(form.quantity),
        reason:        form.reason || null,
        status:        'pending',
      })
      if (error) throw error
      flash('Requisition submitted')
      setForm({ stock_item_id: '', department: '', quantity: '', reason: '' })
      fetchReqs()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleApprove(req) {
    try {
      const { error } = await supabase.from('requisitions')
        .update({ status: 'approved', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash('Approved')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleFulfil(req) {
    try {
      // Two-tier (migration 055): fulfilling a requisition ISSUES stock from
      // the main store to the requesting department — one atomic call that
      // deducts the store balance and credits the department, and writes both
      // ledger rows. performed_by is set server-side from auth.uid().
      //
      // This previously called applyStockDelta(-qty) with no location, which
      // deducted the item's OWN department tier and credited nobody: fulfilling
      // the live Kitchen requisition deducted Sports Bar. The store was never
      // touched.
      //
      // Fail-closed: if the store cannot cover the full quantity the call is
      // rejected and nothing moves. No partial issue — logged in FOLLOWUPS as
      // a Dhiren-revisit, since that is an operational preference.
      await issueStock(req.stock_item_id, MAIN_STORE, req.department, Number(req.quantity), {
        movementType: 'requisition',
        reason:       req.reason || null,
      })
      const { error } = await supabase.from('requisitions')
        .update({ status: 'fulfilled', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash(`Fulfilled — issued from ${MAIN_STORE} to ${req.department}`)
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleReject(req) {
    try {
      const { error } = await supabase.from('requisitions')
        .update({ status: 'rejected', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash('Rejected')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  // ── par-refill batches (059) ──────────────────────────────────────
  // A night's count can raise dozens of requisitions. They are grouped by the
  // count session that produced them so a refill is approved and fulfilled as
  // one unit — a per-row Approve/Fulfil across 90+ items is not a usable
  // screen. The rows themselves stay ordinary requisitions; only the grouping
  // is new.
  const batches = useMemo(() => {
    const map = new Map()
    for (const r of reqs) {
      if (r.source !== 'par_refill' || !r.count_session_id) continue
      const b = map.get(r.count_session_id) ?? {
        id: r.count_session_id, department: r.department, created_at: r.created_at,
        pending: 0, approved: 0, fulfilled: 0, rejected: 0, units: 0, count: 0,
      }
      b[r.status] = (b[r.status] ?? 0) + 1
      b.units += Number(r.quantity)
      b.count += 1
      map.set(r.count_session_id, b)
    }
    return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [reqs])

  // The flat list shows hand-raised requisitions only; batched refill lines are
  // represented by their batch above, so the table stays readable.
  const looseReqs = reqs.filter(r => r.source !== 'par_refill' || !r.count_session_id)

  async function handleApproveBatch(batch) {
    try {
      const { error } = await supabase.from('requisitions')
        .update({ status: 'approved', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('count_session_id', batch.id)
        .eq('status', 'pending')
      if (error) throw error
      flash(`Approved ${batch.pending} line(s)`)
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleFulfilBatch(batch) {
    try {
      // One transaction server-side. A line the store cannot cover is skipped
      // and named rather than aborting the whole refill; anything else aborts.
      const res = await fulfilRequisitionBatch(batch.id)
      if (res.skipped > 0) {
        flash(`Fulfilled ${res.fulfilled}, skipped ${res.skipped} for insufficient store stock`, false)
      } else {
        flash(`Fulfilled ${res.fulfilled} line(s) — issued from ${MAIN_STORE} to ${batch.department}`)
      }
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleRejectBatch(batch) {
    try {
      const { error } = await supabase.from('requisitions')
        .update({ status: 'rejected', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('count_session_id', batch.id)
        .in('status', ['pending', 'approved'])
      if (error) throw error
      flash('Refill rejected')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]))
  const managerCols = isManager ? 8 : 6

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />

      <section>
        <SectionHead
          title="Raise requisition"
          subtitle="Ask the Main Store for stock. Nothing moves until a manager fulfils it — approval alone does not deduct."
          className="mb-6"
        />
        <form onSubmit={handleSubmit} className="max-w-4xl">
          <FormGrid>
            <Field label="Item *" span="full">
              <Sel required value={form.stock_item_id}
                onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value }))}>
                <option value="">Select item…</option>
                {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
              </Sel>
            </Field>

            <Field
              label="Department"
              hint={profile?.department ? 'Set by your profile.' : undefined}
            >
              {profile?.department
                ? <Inp disabled value={profile.department} />
                : <Sel value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </Sel>
              }
            </Field>

            <Field label="Quantity *">
              <Inp type="number" required min="0.01" step="any"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </Field>

            <Field label="Reason" span="full">
              <Txt rows={2} placeholder="Why is this needed?"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </Field>
          </FormGrid>

          <FormActions>
            <Button type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit requisition'}
            </Button>
          </FormActions>
        </form>
      </section>

      {/* ── Par-refill batches (059) ─────────────────────── */}
      {batches.length > 0 && (
        <div className="border-t border-line pt-6">
          <h2 className="text-[15px] font-bold text-navy mb-1">Bar Refills</h2>
          <p className="text-sm text-gray-500 mb-3">
            Pre-filled from an end-of-day count. Approve and fulfil the whole refill in one go.
          </p>
          <div className="space-y-2">
            {batches.map(b => {
              const done = b.pending === 0 && b.approved === 0
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-xl px-4 py-3">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{b.department}</span>
                    <span className="text-gray-500"> · {b.count} item(s) · {b.units} unit(s) · </span>
                    <span className="text-gray-500">
                      {new Date(b.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <div className="mt-1 flex gap-1.5">
                      {b.pending   > 0 && <ReqStatusBadge status="pending" />}
                      {b.approved  > 0 && <ReqStatusBadge status="approved" />}
                      {b.fulfilled > 0 && <ReqStatusBadge status="fulfilled" />}
                      {b.rejected  > 0 && <ReqStatusBadge status="rejected" />}
                    </div>
                  </div>
                  {isManager && !done && (
                    <div className="flex gap-1.5">
                      {b.pending > 0 && (
                        <button onClick={() => handleApproveBatch(b)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-teal hover:bg-teal-deep text-white rounded-lg wl-transition">
                          Approve all ({b.pending})
                        </button>
                      )}
                      {b.approved > 0 && (
                        <button onClick={() => handleFulfilBatch(b)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-teal hover:bg-teal-deep text-white rounded-lg wl-transition">
                          Fulfil all ({b.approved})
                        </button>
                      )}
                      <button onClick={() => handleRejectBatch(b)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-alert-bg hover:bg-red-200 text-red-700 border border-red-200 rounded-lg wl-transition">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── List ────────────────────────────────────────── */}
      <section className="border-t border-line pt-6 space-y-4">
        <SectionHead
          title={isManager ? 'All requisitions' : 'My requisitions'}
          subtitle="Hand-raised requests. Bar par refills are grouped above rather than listed one line at a time."
        />
        <TableWrap>
          <table className="w-full">
            <Thead>
              <tr>
                <Th>Item</Th><Th>Dept</Th><Th>Qty</Th>
                {isManager && <Th>Requested By</Th>}
                <Th>Reason</Th><Th>Date</Th><Th>Status</Th>
                {isManager && <Th>Actions</Th>}
              </tr>
            </Thead>
            <tbody>
              {looseReqs.map(r => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-gray-50">
                  <TdBold>{itemMap[r.stock_item_id]?.name ?? '—'}</TdBold>
                  <Td>{r.department}</Td>
                  <Td>{r.quantity}</Td>
                  {isManager && <Td>{userNames[r.requested_by]}</Td>}
                  <Td>{r.reason}</Td>
                  <Td>{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Td>
                  <td className="px-4 py-3"><ReqStatusBadge status={r.status} /></td>
                  {isManager && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {r.status === 'pending' && <>
                          <button onClick={() => handleApprove(r)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-teal hover:bg-teal-deep text-white rounded-lg wl-transition">
                            Approve
                          </button>
                          <button onClick={() => handleReject(r)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-alert-bg hover:bg-red-200 text-red-700 border border-red-200 rounded-lg wl-transition">
                            Reject
                          </button>
                        </>}
                        {r.status === 'approved' && (
                          <button onClick={() => handleFulfil(r)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-teal hover:bg-teal-deep text-white rounded-lg wl-transition">
                            Fulfil
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {looseReqs.length === 0 && (
                <EmptyRow cols={managerCols} msg={
                  batches.length > 0
                    ? 'No hand-raised requisitions — the bar refills above are handled as batches.'
                    : 'No requisitions yet. Raise one above and it will appear here for approval.'
                } />
              )}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  )
}
