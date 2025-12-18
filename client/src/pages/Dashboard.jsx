import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, isAdmin, isLocalCounsel, isClient } = useAuth()

  // For admin/internal counsel
  if (isAdmin) {
    return <AdminDashboard user={user} />
  }

  // For client users
  if (isClient) {
    return <ClientDashboard user={user} />
  }

  // For local counsel
  return <LocalCounselDashboard user={user} />
}

function AdminDashboard({ user }) {
  const [summary, setSummary] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [activities, setActivities] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [categoryStats, setCategoryStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [summaryData, pipelineData, activityData, deadlineData, categoryData] = await Promise.all([
        api.get('/dashboard/admin-summary'),
        api.get('/dashboard/pipeline-summary'),
        api.get('/dashboard/activity-feed?limit=20'),
        api.get('/dashboard/upcoming-deadlines?limit=10'),
        api.get('/categories/stats/summary')
      ])
      setSummary(summaryData)
      setPipeline(pipelineData)
      setActivities(activityData.activities)
      setDeadlines(deadlineData.deadlines)
      setCategoryStats(categoryData.stats || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case 'note': return '📝'
      case 'communication': return '💬'
      case 'document': return '📄'
      case 'task': return '✅'
      default: return '•'
    }
  }

  const maxBarValue = pipeline?.stages
    ? Math.max(...pipeline.stages.map(s => pipeline.pipeline[s]?.case_count || 0), 1)
    : 1

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p style={{ color: 'var(--gray-500)', marginTop: '4px' }}>
            Welcome back, {user?.full_name}
          </p>
        </div>
        <Link to="/cases/new" className="btn btn-primary">+ New Case</Link>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Active Cases</div>
          <div className="stat-value">{summary?.active_cases || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Amount Outstanding</div>
          <div className="stat-value currency">{formatCurrency(summary?.amount_outstanding)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recovered This Year</div>
          <div className="stat-value currency" style={{ color: 'var(--success)' }}>
            {formatCurrency(summary?.recovered_this_year)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recovery Rate</div>
          <div className="stat-value">{summary?.recovery_rate || 0}%</div>
        </div>
        <div className="stat-card" style={summary?.cases_needing_attention > 0 ? { borderColor: 'var(--danger)' } : {}}>
          <div className="stat-label">Needs Attention</div>
          <div className="stat-value" style={summary?.cases_needing_attention > 0 ? { color: 'var(--danger)' } : {}}>
            {summary?.cases_needing_attention || 0}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginTop: '24px' }}>
        {/* Pipeline Summary */}
        <div className="card">
          <div className="card-header">
            <h2>Pipeline Summary</h2>
            <Link to="/pipeline" className="btn btn-secondary btn-sm">View Pipeline</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pipeline?.stages?.filter(stage => stage !== 'Closed - Resolved').map(stage => {
              const data = pipeline.pipeline[stage] || { case_count: 0, total_amount: 0 }
              const barWidth = (data.case_count / maxBarValue) * 100
              return (
                <div key={stage}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{stage}</span>
                    <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                      {data.case_count} cases • {formatCurrency(data.total_amount)}
                    </span>
                  </div>
                  <div style={{ height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${barWidth}%`,
                      background: 'var(--primary)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="card">
          <div className="card-header">
            <h2>Upcoming Deadlines</h2>
            <Link to="/deadlines" className="btn btn-secondary btn-sm">View All</Link>
          </div>
          {deadlines.length === 0 ? (
            <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
              No upcoming deadlines
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {deadlines.map((deadline, idx) => {
                const isOverdue = deadline.is_overdue || deadline.days_until < 0
                const isUrgent = deadline.days_until <= 3 && deadline.days_until >= 0
                const daysText = isOverdue
                  ? `${Math.abs(deadline.days_until)} days overdue`
                  : deadline.days_until === 0
                    ? 'Due Today'
                    : deadline.days_until === 1
                      ? 'Due Tomorrow'
                      : `${deadline.days_until} days`
                return (
                  <Link
                    key={idx}
                    to={`/cases/${deadline.case_id}`}
                    style={{
                      display: 'block',
                      padding: '12px',
                      background: isOverdue ? 'rgba(239, 68, 68, 0.1)' : isUrgent ? 'rgba(239, 68, 68, 0.05)' : 'var(--gray-50)',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      color: 'inherit',
                      borderLeft: `3px solid ${isOverdue || isUrgent ? 'var(--danger)' : 'var(--primary)'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{deadline.deadline_type}</div>
                      {isOverdue && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'var(--danger)',
                          color: 'white'
                        }}>OVERDUE</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                      {deadline.case_number} • {deadline.defendant_name}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: isOverdue || isUrgent ? 'var(--danger)' : 'var(--gray-500)',
                      marginTop: '4px',
                      fontWeight: isOverdue ? 500 : 400
                    }}>
                      {formatDate(deadline.deadline_date)} ({daysText})
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cases by Category */}
      {categoryStats.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h2>Cases by Category</h2>
            <Link to="/categories" className="btn btn-secondary btn-sm">Manage Categories</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {categoryStats.map(stat => {
              const recoveryRate = stat.total_claimed > 0
                ? ((stat.total_recovered / stat.total_claimed) * 100).toFixed(1)
                : 0
              return (
                <Link
                  key={stat.id}
                  to={`/cases?category_id=${stat.id}`}
                  style={{
                    background: 'var(--gray-50)',
                    borderRadius: '8px',
                    padding: '16px',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span className="badge badge-secondary">{stat.code}</span>
                    <span style={{ fontWeight: 500, fontSize: '14px' }}>{stat.name}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>
                      <div style={{ color: 'var(--gray-500)' }}>Total</div>
                      <div style={{ fontWeight: 600 }}>{stat.case_count}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--gray-500)' }}>Open</div>
                      <div style={{ fontWeight: 600 }}>{stat.open_cases}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--gray-500)' }}>Claimed</div>
                      <div style={{ fontWeight: 600 }}>{formatCurrency(stat.total_claimed)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--gray-500)' }}>Recovery</div>
                      <div style={{ fontWeight: 600, color: recoveryRate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
                        {recoveryRate}%
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2>Recent Activity</h2>
        </div>
        {activities.length === 0 ? (
          <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No recent activity
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activities.map((activity, idx) => (
              <Link
                key={idx}
                to={`/cases/${activity.case_id}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 0',
                  borderBottom: idx < activities.length - 1 ? '1px solid var(--gray-100)' : 'none',
                  textDecoration: 'none',
                  color: 'inherit'
                }}
              >
                <span style={{ fontSize: '18px' }}>{getActivityIcon(activity.activity_type)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>
                    {activity.action}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                    {activity.case_number} • {activity.summary?.substring(0, 60)}{activity.summary?.length > 60 ? '...' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '4px' }}>
                    {activity.user_name} • {formatDateTime(activity.timestamp)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ClientDashboard({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const result = await api.get('/dashboard/client-summary')
      setData(result)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--gray-500)', marginTop: '4px' }}>
            Welcome back, {user?.full_name}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Active Cases</div>
          <div className="stat-value">{data?.summary?.active_cases || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value currency">{formatCurrency(data?.summary?.total_outstanding)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Recovered</div>
          <div className="stat-value currency" style={{ color: 'var(--success)' }}>
            {formatCurrency(data?.summary?.total_recovered)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recovery Rate</div>
          <div className="stat-value">{data?.summary?.recovery_rate || 0}%</div>
        </div>
      </div>

      {/* All Cases */}
      <div className="card">
        <div className="card-header">
          <h2>Your Cases</h2>
        </div>
        {data?.cases?.length === 0 ? (
          <div className="empty-state">
            <h3>No cases found</h3>
            <p>You don't have any cases yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Case Number</th>
                  <th>Name</th>
                  <th>Defendant</th>
                  <th>Amount Claimed</th>
                  <th>Amount Recovered</th>
                  <th>Stage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.cases?.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td>
                      <Link to={`/cases/${caseItem.id}`} className="table-link">
                        {caseItem.case_number}
                      </Link>
                    </td>
                    <td>{caseItem.case_name}</td>
                    <td>{caseItem.defendant_name}</td>
                    <td>{formatCurrency(caseItem.amount_claimed)}</td>
                    <td style={{ color: 'var(--success)' }}>{formatCurrency(caseItem.amount_recovered)}</td>
                    <td><span className="badge badge-stage">{caseItem.current_stage}</span></td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(caseItem.resolution_status)}`}>
                        {caseItem.resolution_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LocalCounselDashboard({ user }) {
  const [data, setData] = useState(null)
  const [myTasks, setMyTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [summaryData, tasksData] = await Promise.all([
        api.get('/dashboard/client-summary'),
        api.get('/tasks/my-tasks')
      ])
      setData(summaryData)
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
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My Cases</div>
          <div className="stat-value">{data?.summary?.active_cases || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value currency">{formatCurrency(data?.summary?.total_outstanding)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Tasks</div>
          <div className="stat-value">{myTasks.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue Tasks</div>
          <div className="stat-value" style={{ color: myTasks.filter(t => t.is_overdue).length > 0 ? 'var(--danger)' : 'inherit' }}>
            {myTasks.filter(t => t.is_overdue).length}
          </div>
        </div>
      </div>

      {/* My Tasks */}
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
                    <td><span className="badge badge-stage">{task.status}</span></td>
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

      {/* My Cases */}
      <div className="card">
        <div className="card-header">
          <h2>My Assigned Cases</h2>
          <Link to="/cases" className="btn btn-secondary btn-sm">View All</Link>
        </div>
        {data?.cases?.length === 0 ? (
          <div className="empty-state">
            <h3>No cases assigned</h3>
            <p>You have no cases assigned to you yet.</p>
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
                </tr>
              </thead>
              <tbody>
                {data?.cases?.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td>
                      <Link to={`/cases/${caseItem.id}`} className="table-link">
                        {caseItem.case_number}
                      </Link>
                    </td>
                    <td>{caseItem.defendant_name}</td>
                    <td>{formatCurrency(caseItem.amount_claimed)}</td>
                    <td><span className="badge badge-stage">{caseItem.current_stage}</span></td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(caseItem.resolution_status)}`}>
                        {caseItem.resolution_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
