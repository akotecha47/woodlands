import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import TodayTab    from '../components/attendance/TodayTab'
import HistoryTab  from '../components/attendance/HistoryTab'
import SettingsTab from '../components/attendance/SettingsTab'

// ROUTE_ACCESS['/attendance'] is AT_MANAGE_ROLES (owner, admin, hr), so every
// role that reaches this page manages attendance and gets the same three tabs.
//
// The two branches that used to live here were already dead before Phase 2:
// one required `restaurant_manager` and the other any role outside
// owner/manager, but ROUTE_ACCESS['/attendance'] was ['owner','manager'], so
// GuardedPage bounced both to /login before this component rendered. Their
// only content was a "Clock In / Out" tab, which is why ClockInOutTab has no
// reachable mount point — see WOODLANDS_FOLLOWUPS.md.
// One source for the tab list, shared with the top bar's section search (E).
const TABS = sectionsFor('/attendance')

export default function Attendance() {
  const [tab, setTab] = useSectionTab('today')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Attendance"
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Attendance sections" />

      <Card className="overflow-hidden">
        {tab === 'today'    && <TodayTab />}
        {tab === 'history'  && <HistoryTab />}
        {tab === 'settings' && <SettingsTab />}
      </Card>
    </div>
  )
}
