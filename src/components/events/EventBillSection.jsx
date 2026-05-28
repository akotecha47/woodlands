import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { fmtMWK } from './EventsUI'

const CATEGORIES = [
  'Venue Hire',
  'Catering',
  'Beverages',
  'Accommodation',
  'Equipment & AV',
  'Decoration & Setup',
  'Security',
  'Grounds & Outdoor Setup',
  'Staff Service Charge',
  'Other',
]

const BLANK = { category: 'Venue Hire', description: '', amount: '' }

export default function EventBillSection({ eventId, items, canManage, onRefresh }) {
  const { session } = useAuth()
  const [form,  setForm]  = useState(BLANK)
  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)
  const flash = useFlash(setToast)

  function f(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const billTotal = items.reduce((s, i) => s + Number(i.amount), 0)

  async function handleAdd(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('event_bill_items').insert({
        event_id:    eventId,
        category:    form.category,
        description: form.description || null,
        amount:      Number(form.amount),
        created_by:  session?.user?.id ?? null,
      })
      if (error) throw error
      flash('Item added')
      setForm(BLANK)
      onRefresh()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabaseAdmin.from('event_bill_items').delete().eq('id', id)
      if (error) throw error
      onRefresh()
    } catch (err) { flash(err.message, false) }
  }

  const colSpan = canManage ? 4 : 3

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-base font-semibold text-gray-800 mb-4">Bill</h3>

      {/* Bill items table */}
      {items.length > 0 ? (
        <div className="overflow-x-auto mb-4 border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Amount</Th>
                {canManage && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <Td>{item.category}</Td>
                  <Td>{item.description}</Td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{fmtMWK(item.amount)}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(item.id)}
                        className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={canManage ? 2 : 1}
                  className="px-4 py-3 text-sm font-semibold text-gray-700">
                  Bill Total
                </td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900">{fmtMWK(billTotal)}</td>
                {canManage && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No bill items yet.</p>
      )}

      {/* Add bill item form — owner/manager only */}
      {canManage && (
        <div className="border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Add Bill Item</h4>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category *">
                <Sel required value={form.category} onChange={f('category')}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Sel>
              </Field>
              <Field label={form.category === 'Other' ? 'Description *' : 'Description'}>
                <Inp
                  required={form.category === 'Other'}
                  placeholder={form.category === 'Other' ? 'Required' : 'Optional'}
                  value={form.description}
                  onChange={f('description')}
                />
              </Field>
            </div>
            <Field label="Amount (MWK) *">
              <Inp type="number" required min="0.01" step="any" placeholder="0"
                value={form.amount} onChange={f('amount')} />
            </Field>
            <button type="submit" disabled={busy}
              className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
              {busy ? 'Adding…' : 'Add Item'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
