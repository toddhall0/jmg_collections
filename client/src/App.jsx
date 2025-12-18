import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CaseList from './pages/CaseList'
import CaseDetail from './pages/CaseDetail'
import CaseForm from './pages/CaseForm'
import UserManagement from './pages/UserManagement'
import Pipeline from './pages/Pipeline'
import Deadlines from './pages/Deadlines'
import LocalCounselDirectory from './pages/LocalCounselDirectory'
import SharedCaseView from './pages/SharedCaseView'
import Register from './pages/Register'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public registration with invite token */}
      <Route path="/register/:token" element={<Register />} />
      {/* Public shared case view - no authentication */}
      <Route path="/shared/case/:token" element={<SharedCaseView />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="cases" element={<CaseList />} />
        <Route path="cases/new" element={<AdminRoute><CaseForm /></AdminRoute>} />
        <Route path="cases/:id" element={<CaseDetail />} />
        <Route path="cases/:id/edit" element={<AdminRoute><CaseForm /></AdminRoute>} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="deadlines" element={<Deadlines />} />
        <Route path="local-counsel" element={<AdminRoute><LocalCounselDirectory /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><UserManagement /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
