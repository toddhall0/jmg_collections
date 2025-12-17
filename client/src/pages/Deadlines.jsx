import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'

export default function Deadlines() {
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDeadlines()
  }, [])

  const loadDeadlines = async () => {
    try {
      const data = await api.get('/cases/deadlines')
      setDeadlines(data.deadlines)
    } catch (error) {
      console.error('Error loading deadlines:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDeadlineTypeIcon = (type) => {
    if (type.includes('Initial Notice')) return '📤'
    if (type.includes('Second Notice')) return '📤'
    if (type.includes('Statute')) return '⚖️'
    if (type.includes('Task')) return '✓'
    return '📅'
  }

  const getRowStyle = (deadline) => {
    if (deadline.is_overdue) {
      return { background: '#fff5f5', borderLeft: '3px solid var(--danger)' }
    }
    if (deadline.is_due_soon) {
      return { background: '#fffbeb', borderLeft: '3px solid var(--warning)' }
    }
    return { background: 'var(--gray-50)', borderLeft: '3px solid var(--gray-300)' }
  }

  const getDaysLabel = (days) => {
    if (days < 0) {
      const absDays = Math.abs(days)
      return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{absDays} day{absDays !== 1 ? 's' : ''} overdue</span>
    }
    if (days === 0) {
      return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Due today</span>
    }
    if (days <= 7) {
      return <span style={{ color: 'var(--warning)' }}>{days} day{days !== 1 ? 's' : ''}</span>
    }
    return <span style={{ color: 'var(--gray-600)' }}>{days} days</span>
  }

  if (loading) {
    return <div className="loading">Loading deadlines...</div>
  }

  const overdueCount = deadlines.filter(d => d.is_overdue).length
  const dueSoonCount = deadlines.filter(d => d.is_due_soon && !d.is_overdue).length

  return (
    <div>
      <div className="page-header">
        <h1>Upcoming Deadlines</h1>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{overdueCount}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="stat-label">Due Within 7 Days</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{dueSoonCount}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="stat-label">Total (Next 30 Days)</div>
          <div className="stat-value">{deadlines.length}</div>
        </div>
      </div>

      <div className="card">
        {deadlines.length === 0 ? (
          <div className="empty-state">
            <h3>No upcoming deadlines</h3>
            <p>There are no deadlines in the next 30 days.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deadlines.map((deadline, index) => (
              <div
                key={`${deadline.id}-${deadline.deadline_type}-${index}`}
                style={{
                  padding: '12px 16px',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  ...getRowStyle(deadline)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <span style={{ fontSize: '20px' }}>{getDeadlineTypeIcon(deadline.deadline_type)}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Link
                        to={`/cases/${deadline.id}`}
                        style={{ fontWeight: 600, color: 'var(--accent)' }}
                      >
                        {deadline.case_number}
                      </Link>
                      <span style={{ color: 'var(--gray-600)' }}>
                        {deadline.defendant_name}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--gray-700)',
                      marginTop: '2px'
                    }}>
                      {deadline.deadline_type}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 500,
                      color: deadline.is_overdue ? 'var(--danger)' : 'var(--gray-700)'
                    }}>
                      {formatDate(deadline.deadline_date)}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '2px' }}>
                      {getDaysLabel(deadline.days_until_due)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: 'var(--gray-50)',
        borderRadius: '4px',
        fontSize: '13px',
        color: 'var(--gray-600)'
      }}>
        <strong>Legend:</strong>
        <span style={{ marginLeft: '16px', color: 'var(--danger)' }}>Red = Overdue</span>
        <span style={{ marginLeft: '16px', color: 'var(--warning)' }}>Yellow = Due within 7 days</span>
      </div>
    </div>
  )
}
