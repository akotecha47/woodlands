import { useState, useEffect, Fragment } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import {
  STALL_TYPES, FM_PAY_TYPES, HOLDER_STATUS_CFG,
  fmtDate, fmtMWK,
  getLastNMarketDays, getMarketDaysSince,
  HolderStatusBadge, PaidIcon,
} from './FarmersMarketUI'

const FILTER_TABS = [
  { id: 'all',            label: 'All'           },
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'active',         label: 'Active'        },
  { id: 'at_risk',        label: 'At Risk'       },
  { id: 'inactive',       label: 'Inactive'      },
]

const BLANK_EDIT = {
  full_name: '', business_name: '', stall_number: '',
  stall_type: 'Produce', phone: '', email: '', notes: '', status: 'active',
}

export default function HoldersTab() {
  const { profile } = useAuth()
  const canManage = ['owner', 'manager'].includes(profile?.role)

  const [holders,          setHolders]          = useState([])
  const [yearVisits,       setYearVisits]        = useState([])
  const [filter,           setFilter]            = useState('all')
  const [expandedId,       setExpandedId]        = useState(null)
  const [expandedPayments, setExpandedPayments]  = useState([])
  const [expandedVisits,   setExpandedVisits]    = useState([])
  const [editHolder,       setEditHolder]        = useState(null)
  const [editForm,         setEditForm]          = useState(BLANK_EDIT)
  const [busy,             setBusy]              = useState(false)
  const [toast,            setToast]             = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const yearStart      = `${new Date().getFullYear()}-01-01`
    const lastThreeDays  = getLastNMarketDays(3)

    const [holdersR, yearVisitsR, atRiskVisitsR] = await Promise.all([
      supabaseAdmin.from('fm_holders').select('*').order('stall_number'),
      supabaseAdmin.from('fm_visits').select('holder_id').gte('visit_date', yearStart),
      lastThreeDays.length > 0
        ? supabaseAdmin.from('fm_visits').select('holder_id, visit_date').in('visit_date', lastThreeDays)
        : Promise.resolve({ data: [] }),
    ])

    setYearVisits(yearVisitsR.data ?? [])

    const allHolders    = holdersR.data ?? []
    const atRiskVisits  = atRiskVisitsR.data ?? []

    // Auto-flag: active holders with 0 visits across last 3 market days
    if (lastThreeDays.length > 0 && allHolders.length > 0) {
      const visitedIds = new Set(atRiskVisits.map(v => v.holder_id))
      const toFlag     = allHolders
        .filter(h => h.status === 'active' && !visitedIds.has(h.id))
        .map(h => h.id)

      if (toFlag.length > 0) {
        await supabaseAdmin.from('fm_holders').update({ status: 'at_risk' }).in('id', toFlag)
        const flaggedSet = new Set(toFlag)
        setHolders(allHolders.map(h => flaggedSet.has(h.id) ? { ...h, status: 'at_risk' } : h))
        return
      }
    }
    setHolders(allHolders)
  }

  useEffect(() => { load() }, [])

  // ── derived ────────────────────────────────────────────────────────────────

  const yearVisitCountMap = {}
  for (const v of yearVisits) {
    yearVisitCountMap[v.holder_id] = (yearVisitCountMap[v.holder_id] ?? 0) + 1
  }

  const activeHolders  = holders.filter(h => h.status === 'active')
  const atRiskHolders  = holders.filter(h => h.status === 'at_risk')

  const outstandingTotal = holders
    .filter(h => h.status !== 'inactive')
    .reduce((sum, h) => sum + (!h.application_paid ? 10000 : 0) + (!h.acceptance_paid ? 20000 : 0), 0)

  function holderOutstanding(h) {
    return (!h.application_paid ? 10000 : 0) + (!h.acceptance_paid ? 20000 : 0)
  }

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
      return
    }
    setExpandedId(holder.id)
    const [pR, vR] = await Promise.all([
      supabaseAdmin.from('fm_payments').select('*').eq('holder_id', holder.id).order('payment_date', { ascending: false }),
      supabaseAdmin.from('fm_visits').select('*').eq('holder_id', holder.id),
    ])
    setExpandedPayments(pR.data ?? [])
    setExpandedVisits(vR.data ?? [])
  }

  function buildVisitHistory(holder) {
    const allDays      = getMarketDaysSince(holder.created_at)
    const visitDateSet = new Set(expandedVisits.map(v => v.visit_date))
    const feeMap       = Object.fromEntries(expandedVisits.map(v => [v.visit_date, v.fee_paid]))
    return allDays.map(date => ({
      date,
      checkedIn: visitDateSet.has(date),
      feePaid:   feeMap[date] ?? false,
    }))
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function handleMarkContacted(holder) {
    try {
      await supabaseAdmin.from('fm_holders').update({ last_contacted: new Date().toISOString() }).eq('id', holder.id)
      flash('Marked as contacted')
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function handleApprove(holder) {
    try {
      await supabaseAdmin.from('fm_holders').update({ status: 'active' }).eq('id', holder.id)
      flash(`${holder.full_name} approved`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function handleDeactivate(holder) {
    try {
      await supabaseAdmin.from('fm_holders').update({ status: 'inactive' }).eq('id', holder.id)
      flash(`${holder.full_name} deactivated`)
      if (expandedId === holder.id) setExpandedId(null)
      load()
    } catch (err) { flash(err.message, false) }
  }

  function openEdit(holder) {
    setEditHolder(holder)
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
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('fm_holders').update({
        full_name:     editForm.full_name,
        business_name: editForm.business_name || null,
        stall_number:  editForm.stall_number,
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
      flash('Holder updated')
      setEditHolder(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  const ef = field => e => setEditForm(p => ({ ...p, [field]: e.target.value }))

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="bg-gray-50 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Active Holders</p>
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
          <p className="text-xs text-gray-500 mb-1">Total Holders</p>
          <p className="text-2xl font-bold text-gray-900">{holders.length}</p>
        </div>
      </div>

      {/* At-risk banner */}
      {atRiskHolders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-red-800 mb-3">
            {atRiskHolders.length} holder{atRiskHolders.length !== 1 ? 's' : ''} flagged as at risk — follow up required
          </p>
          <div className="flex flex-wrap gap-2">
            {atRiskHolders.map(h => (
              <div key={h.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-sm text-gray-800">{h.full_name} ({h.stall_number})</span>
                {h.last_contacted && (
                  <span className="text-xs text-gray-400">Contacted {fmtDate(h.last_contacted)}</span>
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
            {filtered.map(h => {
              const outstanding = holderOutstanding(h)
              return (
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
                    <td className="px-4 py-3 text-sm font-medium">
                      {outstanding > 0
                        ? <span className="text-amber-700">{fmtMWK(outstanding)}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
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
                        {canManage && h.status === 'pending_review' && (
                          <button onClick={() => handleApprove(h)}
                            className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 transition-colors">
                            Approve
                          </button>
                        )}
                        {canManage && ['active', 'at_risk', 'accepted'].includes(h.status) && (
                          <button onClick={() => handleDeactivate(h)}
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
                                        {['Date', 'Checked In', 'Fee Paid'].map(c => (
                                          <th key={c} className="text-left pb-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase">{c}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {history.map(({ date, checkedIn, feePaid }) => (
                                        <tr key={date} className="border-t border-gray-100">
                                          <td className="py-1.5 pr-4 text-gray-700">{fmtDate(date)}</td>
                                          <td className="py-1.5 pr-4">
                                            <span className={`text-xs font-medium ${checkedIn ? 'text-green-600' : 'text-gray-400'}`}>
                                              {checkedIn ? 'Yes' : 'No'}
                                            </span>
                                          </td>
                                          <td className="py-1.5">
                                            <span className={`text-xs font-medium ${feePaid ? 'text-green-600' : 'text-gray-400'}`}>
                                              {feePaid ? 'Yes' : '—'}
                                            </span>
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-gray-400">No holders found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editHolder && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-gray-900 mb-4">Edit Holder</h4>
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
                  <Inp required value={editForm.stall_number} onChange={ef('stall_number')} />
                </Field>
                <Field label="Stall Type *">
                  <Sel required value={editForm.stall_type} onChange={ef('stall_type')}>
                    {STALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Sel>
                </Field>
              </div>
              <Field label="Phone *">
                <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-green-600">
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
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
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
    </div>
  )
}
