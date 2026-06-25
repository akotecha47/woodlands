import { useState } from 'react'
import StaffTab       from '../components/admin/StaffTab'
import UsersTab       from '../components/admin/UsersTab'
import AddUserTab     from '../components/admin/AddUserTab'
import DepartmentsTab from '../components/admin/DepartmentsTab'
import StockItemsTab  from '../components/admin/StockItemsTab'

const TABS = [
  { id: 'staff',       label: 'Staff',        Component: StaffTab       },
  { id: 'users',       label: 'Users',        Component: UsersTab       },
  { id: 'add_user',    label: 'Add User',     Component: AddUserTab     },
  { id: 'departments', label: 'Departments',  Component: DepartmentsTab },
  { id: 'stock_items', label: 'Stock Items',  Component: StockItemsTab  },
]

export default function Admin() {
  const [tab, setTab] = useState('staff')
  const { Component } = TABS.find(t => t.id === tab)

  return (
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Admin</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <Component />
      </div>
    </div>
  )
}
