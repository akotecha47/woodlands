import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { MANAGE_ROLES, INVENTORY_VIEW_ROLES } from '../lib/roles'
import StockLevelsTab  from '../components/inventory/StockLevelsTab'
import LogDeliveryTab  from '../components/inventory/LogDeliveryTab'
import RequisitionsTab from '../components/inventory/RequisitionsTab'
import TransfersTab    from '../components/inventory/TransfersTab'
import AdjustmentsTab     from '../components/inventory/AdjustmentsTab'
import MovementLedgerTab from '../components/inventory/MovementLedgerTab'
import BarCountTab       from '../components/inventory/BarCountTab'
import ConsumptionTab    from '../components/inventory/ConsumptionTab'

// U-12: a tab is only rendered for a role that can actually use it.
//
// ROUTE_ACCESS['/'] is INVENTORY_VIEW_ROLES, so a department_head reaches this
// page -- but three of these tabs return <AccessDenied /> for anything outside
// MANAGE_ROLES. A Main Bar head could click Log Delivery and be refused by the
// screen it had just been offered. `roles` here MIRRORS the gate each tab
// component already applies to itself; it does not widen anything, and the
// component-level check stays exactly where it is as the real guard. Fails
// closed: a tab with no `roles` entry would be hidden, not shown.
//
// The other five modules were checked for the same pattern and do not have it:
// in Attendance, Events, Table Bookings, Farmers Market and Admin, every tab's
// own gate is the same constant as its ROUTE_ACCESS entry, so no role that
// reaches those pages can be refused a tab on them.
const TABS = [
  // No self-gate; RLS scopes what a head sees.
  { id: 'stock',        label: 'Stock Levels', Component: StockLevelsTab,  roles: INVENTORY_VIEW_ROLES },
  // LogDeliveryTab.jsx:30 -- AccessDenied outside MANAGE_ROLES.
  { id: 'delivery',     label: 'Log Delivery', Component: LogDeliveryTab,  roles: MANAGE_ROLES },
  // The end-of-day par cycle (059). Sits next to Requisitions because posting
  // a count is what generates one.
  // No self-gate: a head is pinned to their own par-managed bar (BarCountTab.jsx:52).
  { id: 'barcount',     label: 'Bar Count',    Component: BarCountTab,     roles: INVENTORY_VIEW_ROLES },
  // No self-gate: raising a requisition is explicitly a head's job (roles.js).
  { id: 'requisitions', label: 'Requisitions', Component: RequisitionsTab, roles: INVENTORY_VIEW_ROLES },
  // TransfersTab.jsx:34 -- AccessDenied outside MANAGE_ROLES.
  { id: 'transfers',    label: 'Transfers',    Component: TransfersTab,    roles: MANAGE_ROLES },
  // AdjustmentsTab.jsx:56 -- AccessDenied outside MANAGE_ROLES.
  { id: 'adjustments',  label: 'Adjustments',  Component: AdjustmentsTab,  roles: MANAGE_ROLES },
  // Consumption attribution (060). Sits after the movement tabs because it
  // reads what they produce: the draw leg it writes itself, and the bar leg
  // that a posted Bar Count generates without anyone typing it in.
  // ConsumptionTab.jsx:148 -- gated on INVENTORY_VIEW_ROLES, heads included.
  { id: 'consumption',  label: 'Consumption',  Component: ConsumptionTab,  roles: INVENTORY_VIEW_ROLES },
  // Was 'Delivery Log' (delivery-only). The Ledger shows every movement type;
  // the delivery-only view survives as a preset filter inside it.
  // No self-gate; RLS scopes a head to their own department's movements.
  { id: 'log',          label: 'Movement Ledger', Component: MovementLedgerTab, roles: INVENTORY_VIEW_ROLES },
]

export default function Inventory() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('stock')

  const visibleTabs = TABS.filter(t => t.roles?.includes(profile?.role))

  // If the selected tab is not one this role may use -- on first paint before
  // the profile resolves, or if the role changes under a live session -- fall
  // back to the first tab it CAN use rather than rendering a denied screen.
  // Derived during render rather than synced into state via an effect: `tab`
  // is only ever the user's intent, and `active` is what that resolves to now.
  const active = visibleTabs.find(t => t.id === tab) ?? visibleTabs[0] ?? null

  return (
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Inventory</h1>

      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              active?.id === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        {active ? <active.Component /> : null}
      </div>
    </div>
  )
}
