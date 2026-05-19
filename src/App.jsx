import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inventory from './pages/Inventory'
import Attendance from './pages/Attendance'
import Events from './pages/Events'
import TableBookings from './pages/TableBookings'
import FarmersMarket from './pages/FarmersMarket'
import Admin from './pages/Admin'
import { RequireAuth, GuardedPage } from './components/RouteGuard'
import { ROUTE_ACCESS } from './lib/roles'

function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={
            <GuardedPage allowed={ROUTE_ACCESS['/']}>
              <Inventory />
            </GuardedPage>
          } />
          <Route path="attendance" element={
            <GuardedPage allowed={ROUTE_ACCESS['/attendance']}>
              <Attendance />
            </GuardedPage>
          } />
          <Route path="events" element={
            <GuardedPage allowed={ROUTE_ACCESS['/events']}>
              <Events />
            </GuardedPage>
          } />
          <Route path="table-bookings" element={
            <GuardedPage allowed={ROUTE_ACCESS['/table-bookings']}>
              <TableBookings />
            </GuardedPage>
          } />
          <Route path="farmers-market" element={
            <GuardedPage allowed={ROUTE_ACCESS['/farmers-market']}>
              <FarmersMarket />
            </GuardedPage>
          } />
          <Route path="admin" element={
            <GuardedPage allowed={ROUTE_ACCESS['/admin']}>
              <Admin />
            </GuardedPage>
          } />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
