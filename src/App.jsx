import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Inventory from './pages/Inventory'
import Attendance from './pages/Attendance'
import Housekeeping from './pages/Housekeeping'
import Revenue from './pages/Revenue'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inventory />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="housekeeping" element={<Housekeeping />} />
        <Route path="revenue" element={<Revenue />} />
      </Route>
    </Routes>
  )
}

export default App
