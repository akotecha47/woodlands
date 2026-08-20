import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import StaffTab       from '../components/admin/StaffTab'
import UsersTab       from '../components/admin/UsersTab'
import AddUserTab     from '../components/admin/AddUserTab'
import DepartmentsTab from '../components/admin/DepartmentsTab'
import StockItemsTab  from '../components/admin/StockItemsTab'
import RoomsTab       from '../components/admin/RoomsTab'

// Labels and order come from lib/sections.js so the top bar's search cannot
// drift from the tab bar. This file owns only the id -> Component mapping.
// `rooms` lives here rather than in Inventory because it is reference data,
// like Departments and Stock Items (060).
const COMPONENTS = {
  staff:       StaffTab,
  users:       UsersTab,
  add_user:    AddUserTab,
  departments: DepartmentsTab,
  stock_items: StockItemsTab,
  rooms:       RoomsTab,
}
const TABS = sectionsFor('/admin')

export default function Admin() {
  const [tab, setTab] = useSectionTab('staff')
  // Falls back rather than throwing: a stale nav state naming a tab this build
  // no longer has would otherwise destructure undefined and blank the page.
  const Component = COMPONENTS[tab] ?? COMPONENTS.staff

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Admin"
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Admin sections" />

      <Card className="overflow-hidden">
        <Component />
      </Card>
    </div>
  )
}
