import { useState } from 'react'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
import StaffTab       from '../components/admin/StaffTab'
import UsersTab       from '../components/admin/UsersTab'
import AddUserTab     from '../components/admin/AddUserTab'
import DepartmentsTab from '../components/admin/DepartmentsTab'
import StockItemsTab  from '../components/admin/StockItemsTab'
import RoomsTab       from '../components/admin/RoomsTab'

const TABS = [
  { id: 'staff',       label: 'Staff',        Component: StaffTab       },
  { id: 'users',       label: 'Users',        Component: UsersTab       },
  { id: 'add_user',    label: 'Add User',     Component: AddUserTab     },
  { id: 'departments', label: 'Departments',  Component: DepartmentsTab },
  { id: 'stock_items', label: 'Stock Items',  Component: StockItemsTab  },
  // The rooms reference list (060). Lives here rather than in Inventory
  // because it is reference data, like Departments and Stock Items.
  { id: 'rooms',       label: 'Rooms',        Component: RoomsTab       },
]

export default function Admin() {
  const [tab, setTab] = useState('staff')
  const { Component } = TABS.find(t => t.id === tab)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Admin"
        subtitle="The reference data the rest of the system runs on — people, logins, departments, the catalogue and the rooms."
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Admin sections" />

      <Card className="overflow-hidden">
        <Component />
      </Card>
    </div>
  )
}
