import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

const todayDate = new Date().toISOString().split('T')[0]

function fmtMWK(amount) {
  return `MWK ${Number(amount).toLocaleString()}`
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'

const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'
const tdCls = 'px-4 py-3'

// ─── Tab 1: Log Revenue ───────────────────────────────────────────────────────

const logDefaults = { departmentId: '', amount: '', date: todayDate, recordedBy: '', notes: '' }

function LogRevenue({ departments }) {
  const [form, setForm] = useState(logDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const { error: err } = await supabase.from('daily_revenue').insert({
      department_id: form.departmentId,
      amount:        Number(form.amount),
      date:          form.date,
      recorded_by:   form.recordedBy,
      notes:         form.notes || null,
    })

    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setForm(logDefaults)
    setSubmitting(false)
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Log Revenue Entry</h2>

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Revenue entry logged successfully.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className={labelCls}>Department</label>
          <select required value={form.departmentId} onChange={set('departmentId')} className={inputCls}>
            <option value="">Select department…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Amount (MWK)</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input
              required
              type="date"
              value={form.date}
              onChange={set('date')}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Recorded By</label>
          <input
            required
            type="text"
            value={form.recordedBy}
            onChange={set('recordedBy')}
            placeholder="Staff name"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Notes <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={set('notes')}
            placeholder="Any additional notes…"
            className={`${inputCls} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Logging…' : 'Log Revenue'}
        </button>
      </form>
    </div>
  )
}

// ─── Tab 2: Daily Summary ─────────────────────────────────────────────────────

function DailySummary() {
  const [date, setDate] = useState(todayDate)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('daily_revenue')
      .select('*, departments(name)')
      .eq('date', date)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setRecords(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [date])

  const total = records.reduce((sum, r) => sum + Number(r.amount), 0)

  // Group by department for bar chart
  const byDept = records.reduce((acc, r) => {
    const name = r.departments?.name ?? 'Unknown'
    acc[name] = (acc[name] ?? 0) + Number(r.amount)
    return acc
  }, {})
  const deptBars = Object.entries(byDept).sort(([, a], [, b]) => b - a)
  const maxAmount = deptBars.length > 0 ? deptBars[0][1] : 1

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
          No revenue recorded for this date.
        </div>
      ) : (
        <>
          {/* Revenue table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Department', 'Amount (MWK)', 'Recorded By', 'Notes'].map(h => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className={`${tdCls} font-medium text-gray-900`}>
                      {r.departments?.name ?? '—'}
                    </td>
                    <td className={`${tdCls} tabular-nums text-gray-900`}>
                      {fmtMWK(r.amount)}
                    </td>
                    <td className={`${tdCls} text-gray-600`}>{r.recorded_by}</td>
                    <td className={`${tdCls} text-gray-500`}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className={`${tdCls} font-semibold text-gray-900`}>Total</td>
                  <td className={`${tdCls} tabular-nums font-semibold text-gray-900`}>
                    {fmtMWK(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Department breakdown bars */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Breakdown by Department
            </h3>
            <div className="space-y-3">
              {deptBars.map(([name, amount]) => {
                const pct = Math.round((amount / maxAmount) * 100)
                const share = Math.round((amount / total) * 100)
                return (
                  <div key={name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{name}</span>
                      <span className="tabular-nums text-gray-500">
                        {fmtMWK(amount)}
                        <span className="ml-2 text-xs text-gray-400">{share}%</span>
                      </span>
                    </div>
                    <div className="h-6 w-full overflow-hidden rounded-md bg-gray-100">
                      <div
                        className="h-full rounded-md bg-[#16a34a] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Log Revenue', 'Daily Summary']

export default function Revenue() {
  const [tab, setTab] = useState(0)
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    let cancelled = false
    supabase.from('departments').select('*').order('name').then(({ data }) => {
      if (cancelled) return
      setDepartments(data ?? [])
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Revenue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Log daily revenue entries and review summaries by date.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === i
                ? 'border-[#16a34a] text-[#16a34a]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <LogRevenue departments={departments} />}
      {tab === 1 && <DailySummary />}
    </div>
  )
}
