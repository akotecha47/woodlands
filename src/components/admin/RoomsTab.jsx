import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Field, Inp, Th, Td, Toast, useFlash } from './AdminUI'

/**
 * Rooms — the reference list stock consumption is attributed against
 * (migration 060, FUNCTIONAL_SPEC §2.2).
 *
 * Deliberately NOT connected to Table Bookings' "Private Room" location, which
 * is a dining area for restaurant tables and shares no key with this list.
 *
 * There is NO DELETE, and that is a decision rather than an omission: a room
 * that stock has been consumed against is part of the audit trail, so the FK on
 * stock_movements.room_id is ON DELETE RESTRICT and rooms carry an is_active
 * flag instead. Deactivating removes a room from the consumption form's picker
 * while leaving its history readable. The database enforces this too — there is
 * no DELETE policy and no DELETE grant on the table.
 *
 * room_type is free text with no CHECK, because the real classes come from
 * Dhiren and a CHECK would need migrating every time he names a new one. The
 * datalist below suggests the seeded values without constraining them.
 */

const TYPE_SUGGESTIONS = ['Standard', 'Executive', 'Family', 'Cottage', 'Public Area']

const BLANK = { room_number: '', name: '', room_type: '', block: '', notes: '' }

export default function RoomsTab() {
  const [rooms,    setRooms]    = useState([])
  const [form,     setForm]     = useState(BLANK)
  const [editing,  setEditing]  = useState(null)   // full row being edited
  const [showAll,  setShowAll]  = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState(null)
  const flash = useFlash(setToast)

  async function fetchRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('id, room_number, name, room_type, block, is_active, notes')
      .order('room_number')
    if (error) { flash(error.message, false); return }
    setRooms(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchRooms() }, [])

  async function addRoom(e) {
    e.preventDefault()
    if (!form.room_number.trim()) return
    setBusy(true)
    try {
      const { error } = await supabase.from('rooms').insert({
        room_number: form.room_number.trim(),
        name:        form.name.trim()      || null,
        room_type:   form.room_type.trim() || null,
        block:       form.block.trim()     || null,
        notes:       form.notes.trim()     || null,
      })
      if (error) throw error
      setForm(BLANK)
      await fetchRooms()
      flash(`Room "${form.room_number.trim()}" added`)
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function saveEdit() {
    if (!editing.room_number.trim()) return
    try {
      const { error } = await supabase.from('rooms').update({
        room_number: editing.room_number.trim(),
        name:        editing.name?.trim()      || null,
        room_type:   editing.room_type?.trim() || null,
        block:       editing.block?.trim()     || null,
        notes:       editing.notes?.trim()     || null,
        updated_at:  new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) throw error
      setEditing(null)
      await fetchRooms()
      flash('Room updated')
    } catch (err) { flash(err.message, false) }
  }

  async function toggleActive(room) {
    try {
      const { error } = await supabase.from('rooms')
        .update({ is_active: !room.is_active, updated_at: new Date().toISOString() })
        .eq('id', room.id)
      if (error) throw error
      await fetchRooms()
      flash(`${room.room_number} ${room.is_active ? 'deactivated' : 'reactivated'}`)
    } catch (err) { flash(err.message, false) }
  }

  const visible = showAll ? rooms : rooms.filter(r => r.is_active)
  const activeCount = rooms.filter(r => r.is_active).length

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />

      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Rooms</h2>
        <p className="text-sm text-gray-500">
          {activeCount} active of {rooms.length} · used to attribute stock consumption
        </p>
      </div>

      <form onSubmit={addRoom} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <Field label="Room number *">
          <Inp required placeholder="A11" value={form.room_number}
            onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))} />
        </Field>
        <Field label="Name">
          <Inp placeholder="Acacia" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Type">
          <Inp list="room-types" placeholder="Standard" value={form.room_type}
            onChange={e => setForm(f => ({ ...f, room_type: e.target.value }))} />
          <datalist id="room-types">
            {TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="Block">
          <Inp placeholder="Block A" value={form.block}
            onChange={e => setForm(f => ({ ...f, block: e.target.value }))} />
        </Field>
        <button type="submit" disabled={busy || !form.room_number.trim()}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 h-[38px]">
          {busy ? 'Adding…' : 'Add Room'}
        </button>
      </form>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
          className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
        Show inactive rooms
      </label>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th>Room</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Block</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No rooms yet</td></tr>
            )}
            {!loading && visible.map(r => (
              editing?.id === r.id ? (
                <tr key={r.id} className="bg-gray-50">
                  <Td><Inp value={editing.room_number ?? ''}
                    onChange={e => setEditing(ed => ({ ...ed, room_number: e.target.value }))} /></Td>
                  <Td><Inp value={editing.name ?? ''}
                    onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))} /></Td>
                  <Td><Inp list="room-types" value={editing.room_type ?? ''}
                    onChange={e => setEditing(ed => ({ ...ed, room_type: e.target.value }))} /></Td>
                  <Td><Inp value={editing.block ?? ''}
                    onChange={e => setEditing(ed => ({ ...ed, block: e.target.value }))} /></Td>
                  <Td>—</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button onClick={saveEdit}
                        className="px-3 py-1 text-xs font-medium bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg transition-colors">Save</button>
                      <button onClick={() => setEditing(null)}
                        className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Cancel</button>
                    </div>
                  </Td>
                </tr>
              ) : (
                <tr key={r.id} className={`hover:bg-gray-50 ${r.is_active ? '' : 'opacity-60'}`}>
                  <Td><span className="font-medium text-gray-900">{r.room_number}</span></Td>
                  <Td>{r.name ?? '—'}</Td>
                  <Td>{r.room_type ?? '—'}</Td>
                  <Td>{r.block ?? '—'}</Td>
                  <Td>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(r)}
                        className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Edit</button>
                      <button onClick={() => toggleActive(r)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
                          r.is_active
                            ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                            : 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200'
                        }`}>
                        {r.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </Td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
