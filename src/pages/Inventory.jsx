import { useAuth } from '../contexts/AuthContext'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import { INVENTORY_VIEW_ROLES } from '../lib/roles'
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
// id -> Component. Labels, order AND the U-12 role gates all come from
// lib/sections.js, so the tab bar and the top bar's section search cannot
// disagree about which tabs exist or who may reach them.
const TAB_META = {
  // No self-gate; RLS scopes what a head sees.
  stock:        StockLevelsTab,
  // LogDeliveryTab.jsx:30 -- AccessDenied outside MANAGE_ROLES.
  delivery:     LogDeliveryTab,
  // The end-of-day par cycle (059). Sits next to Requisitions because posting
  // a count is what generates one.
  // No self-gate: a head is pinned to their own par-managed bar (BarCountTab.jsx:52).
  barcount:     BarCountTab,
  // No self-gate: raising a requisition is explicitly a head's job (roles.js).
  requisitions: RequisitionsTab,
  // TransfersTab.jsx:34 -- AccessDenied outside MANAGE_ROLES.
  transfers:    TransfersTab,
  // AdjustmentsTab.jsx:56 -- AccessDenied outside MANAGE_ROLES.
  adjustments:  AdjustmentsTab,
  // Consumption attribution (060). Sits after the movement tabs because it
  // reads what they produce: the draw leg it writes itself, and the bar leg
  // that a posted Bar Count generates without anyone typing it in.
  // ConsumptionTab.jsx:148 -- gated on INVENTORY_VIEW_ROLES, heads included.
  consumption:  ConsumptionTab,
  // Was 'Delivery Log' (delivery-only). The Ledger shows every movement type;
  // the delivery-only view survives as a preset filter inside it.
  // No self-gate; RLS scopes a head to their own department's movements.
  log:          MovementLedgerTab,
}
const TABS = sectionsFor('/').map(s => ({
  ...s,
  Component: TAB_META[s.id],
  // No `roles` on a section means "whatever the module allows".
  roles: s.roles ?? INVENTORY_VIEW_ROLES,
}))

export default function Inventory() {
  const { profile } = useAuth()
  const [tab, setTab] = useSectionTab('stock')

  const visibleTabs = TABS.filter(t => t.roles?.includes(profile?.role))

  // If the selected tab is not one this role may use -- on first paint before
  // the profile resolves, or if the role changes under a live session -- fall
  // back to the first tab it CAN use rather than rendering a denied screen.
  // Derived during render rather than synced into state via an effect: `tab`
  // is only ever the user's intent, and `active` is what that resolves to now.
  const active = visibleTabs.find(t => t.id === tab) ?? visibleTabs[0] ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
      />

      <Tabs
        tabs={visibleTabs}
        value={active?.id}
        onChange={setTab}
        ariaLabel="Inventory sections"
      />

      <Card className="overflow-hidden">
        {active ? <active.Component /> : null}
      </Card>
    </div>
  )
}
