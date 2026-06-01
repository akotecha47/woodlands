import { useState } from 'react'
import StockLevelsTab  from '../components/inventory/StockLevelsTab'
import LogDeliveryTab  from '../components/inventory/LogDeliveryTab'
import RequisitionsTab from '../components/inventory/RequisitionsTab'
import TransfersTab    from '../components/inventory/TransfersTab'
import AdjustmentsTab  from '../components/inventory/AdjustmentsTab'
import DeliveryLogTab  from '../components/inventory/DeliveryLogTab'

const TABS = [
  { id: 'stock',        label: 'Stock Levels', Component: StockLevelsTab  },
  { id: 'delivery',     label: 'Log Delivery', Component: LogDeliveryTab  },
  { id: 'requisitions', label: 'Requisitions', Component: RequisitionsTab },
  { id: 'transfers',    label: 'Transfers',    Component: TransfersTab    },
  { id: 'adjustments',  label: 'Adjustments',  Component: AdjustmentsTab  },
  { id: 'log',          label: 'Delivery Log', Component: DeliveryLogTab  },
]

export default function Inventory() {
  const [tab, setTab] = useState('stock')
  const { Component } = TABS.find(t => t.id === tab)

  return (
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Inventory</h1>

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
        <Component />
      </div>
    </div>
  )
}
