import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import MarketDayTab       from '../components/farmers-market/MarketDayTab'
import HoldersTab         from '../components/farmers-market/HoldersTab'
import AddHolderTab       from '../components/farmers-market/AddHolderTab'
import PaymentsTab        from '../components/farmers-market/PaymentsTab'
import MonthlyMessagesTab from '../components/farmers-market/MonthlyMessagesTab'
import WaitingListTab     from '../components/farmers-market/WaitingListTab'
import FeesTab            from '../components/farmers-market/FeesTab'

const TABS = sectionsFor('/farmers-market')

export default function FarmersMarket() {
  const [tab, setTab] = useSectionTab('market')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community"
        title="Farmers Market"
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Farmers Market sections" />

      <Card className="overflow-hidden">
        {tab === 'market'   && <MarketDayTab />}
        {tab === 'holders'  && <HoldersTab />}
        {tab === 'add'      && <AddHolderTab onCreated={() => setTab('holders')} />}
        {tab === 'messages' && <MonthlyMessagesTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'waiting'  && <WaitingListTab />}
        {tab === 'fees'     && <FeesTab />}
      </Card>
    </div>
  )
}
