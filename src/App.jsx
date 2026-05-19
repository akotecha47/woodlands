import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Inventory from './pages/Inventory'
import Attendance from './pages/Attendance'
import Events from './pages/Events'
import TableBookings from './pages/TableBookings'
import FarmersMarket from './pages/FarmersMarket'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inventory />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="events" element={<Events />} />
        <Route path="table-bookings" element={<TableBookings />} />
        <Route path="farmers-market" element={<FarmersMarket />} />
      </Route>
    </Routes>
  )
}

export default App
