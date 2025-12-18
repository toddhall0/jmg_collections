import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentCases, setRecentCases] = useState([])
  const [myTasks, setMyTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const { user, isAdmin, isLocalCounsel } = useAuth()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsData, casesData, tasksData] = await Promise.all([
        api.get('/cases/stats'),
        api.get('/cases?sort_by=date_opened&sort_order=desc'),
        api.get('/tasks/my-tasks')
      ])
      setStats(statsData)
      setRecentCases(casesData.cases.slice(0, 5))
      setMyTasks(tasksData.tasks || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus })
      loadData()
    } catch (error) {
      alert('Error updating task: ' + error.message)
    }
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  const getStatusBadgeClass = (status) => {
    const classes = {
      'Open': 'badge-open',
      'Settled': 'badge-settled',
      'Judgment Obtained': 'badge-judgment',
      'Dismissed': 'badge-dismissed',
      'Abandoned': 'badge-abandoned'
    }
    return classes[status] || 'badge-stage'
  }

  const getPriorityBadgeClass = (priority) => {
    const classes = {
      'High': 'badge-danger',
      'Medium': 'badge-warning',
      'Low': 'badge-info'
    }
    return classes[priority] || 'badge-secondary'
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--gray-500)', marginTop: '4px' }}>
            Welcome back, {user?.full_name}
          </p>
        </div>
        {isAdmin && (
          <Link to="/cases/new" className="btn btn-primary">
            + New Case
          </Link>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Cases</div>
          <div className="stat-value">{stats?.total_cases || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open Cases</div>
          <div className="stat-value">{stats?.open_cases || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Claimed</div>
          <div className="stat-value currency">{formatCurrency(stats?.total_claimed)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Recovered</div>
          <div className="stat-value currency">{formatCurrency(stats?.total_recovered)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>
            {isLocalCounsel ? 'My Assigned Cases' : 'Recent Cases'}
          </h2>
          <Link to="/cases" className="btn btn-secondary btn-sm">
            View All
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="empty-state">
            <h3>No cases found</h3>
            <p>
              {isLocalCounsel
                ? 'You have no cases assigned to you yet.'
                : 'Get started by creating your first case.'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Case Number</th>
                  <th>Defendant</th>
                  <th>Amount Claimed</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Date Opened</th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td>
                      <Link to={`/cases/${caseItem.id}`} className="table-link">
                        {caseItem.case_number}
                      </Link>
                    </td>
                    <td>{caseItem.defendant_name}</td>
                    <td>{formatCurrency(caseItem.amount_claimed)}</td>
                    <td>
                      <span className="badge badge-stage">{caseItem.current_stage}</span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(caseItem.resolution_status)}`}>
                        {caseItem.resolution_status}
                      </span>
                    </td>
                    <td>{formatDate(caseItem.date_opened)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* My Tasks Section */}
      {myTasks.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>My Tasks</h2>
            <span className="badge badge-secondary">{myTasks.length} pending</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Case</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.slice(0, 10).map((task) => (
                  <tr key={task.id} style={task.is_overdue ? { background: 'rgba(239, 68, 68, 0.05)' } : {}}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{task.description}</div>
                    </td>
                    <td>
                      <Link to={`/cases/${task.case_id}`} className="table-link">
                        {task.case_number}
                      </Link>
                    </td>
                    <td>
                      <span style={{ color: task.is_overdue ? 'var(--danger)' : 'inherit' }}>
                        {formatDate(task.due_date)}
                        {task.is_overdue && <span style={{ marginLeft: '4px', fontSize: '11px' }}>(Overdue)</span>}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getPriorityBadgeClass(task.priority)}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-stage">{task.status}</span>
                    </td>
                    <td>
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                        style={{ fontSize: '13px', padding: '4px 8px' }}
                      >
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Complete">Complete</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats?.by_stage?.length > 0 && !isLocalCounsel && (
        <div className="card">
          <div className="card-header">
            <h2>Cases by Stage</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {stats.by_stage.map((item) => (
              <div key={item.current_stage} style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: '4px' }}>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{item.current_stage}</div>
                <div style={{ fontSize: '24px', fontWeight: '600' }}>{item.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
