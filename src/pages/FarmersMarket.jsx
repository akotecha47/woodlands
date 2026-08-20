import { useState } from 'react'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
import MarketDayTab       from '../components/farmers-market/MarketDayTab'
import HoldersTab         from '../components/farmers-market/HoldersTab'
import AddHolderTab       from '../components/farmers-market/AddHolderTab'
import PaymentsTab        from '../components/farmers-market/PaymentsTab'
import MonthlyMessagesTab from '../components/farmers-market/MonthlyMessagesTab'
import WaitingListTab     from '../components/farmers-market/WaitingListTab'
import FeesTab            from '../components/farmers-market/FeesTab'

const TABS = [
  { id: 'market',   label: 'Market Day'    },
  { id: 'holders',  label: 'Businesses'    },
  { id: 'add',      label: 'Add Business'  },
  { id: 'messages', label: 'Messages'      },
  { id: 'payments', label: 'Payments'      },
  { id: 'waiting',  label: 'Waiting List'  },
  { id: 'fees',     label: 'Fees'          },
]

export default function FarmersMarket() {
  const [tab, setTab] = useState('market')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community"
        title="Farmers Market"
        subtitle="The last Saturday of every month — stallholders, attendance, fees and the waiting list."
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
