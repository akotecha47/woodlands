import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, GuardedPage } from './components/RouteGuard'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inventory     from './pages/Inventory'
import Attendance    from './pages/Attendance'
import TableBookings from './pages/TableBookings'
import FarmersMarket from './pages/FarmersMarket'
import Events        from './pages/Events'
import Admin         from './pages/Admin'

function PlaceholderPage({ title }) {
  return <h1 className="text-2xl font-semibold text-gray-800">{title}</h1>
}

function Protected({ children, title }) {
  return (
    <RequireAuth>
      <GuardedPage>
        <Layout>
          {children ?? <PlaceholderPage title={title} />}
        </Layout>
      </GuardedPage>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/"               element={<Protected><Inventory /></Protected>} />
        <Route path="/attendance"     element={<Protected><Attendance /></Protected>} />
        <Route path="/events"         element={<Protected><Events /></Protected>} />
        <Route path="/table-bookings" element={<Protected><TableBookings /></Protected>} />
        <Route path="/farmers-market" element={<Protected><FarmersMarket /></Protected>} />
        <Route path="/admin"          element={<Protected><Admin /></Protected>} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
