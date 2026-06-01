import { useState } from 'react'
import MarketDayTab from '../components/farmers-market/MarketDayTab'
import HoldersTab   from '../components/farmers-market/HoldersTab'
import AddHolderTab from '../components/farmers-market/AddHolderTab'
import PaymentsTab  from '../components/farmers-market/PaymentsTab'

const TABS = [
  { id: 'market',   label: 'Market Day' },
  { id: 'holders',  label: 'Holders'    },
  { id: 'add',      label: 'Add Holder' },
  { id: 'payments', label: 'Payments'   },
]

export default function FarmersMarket() {
  const [tab, setTab] = useState('market')

  return (
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Farmers Market</h1>

      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
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
        {tab === 'market'   && <MarketDayTab />}
        {tab === 'holders'  && <HoldersTab />}
        {tab === 'add'      && <AddHolderTab onCreated={() => setTab('holders')} />}
        {tab === 'payments' && <PaymentsTab />}
      </div>
    </div>
  )
}
