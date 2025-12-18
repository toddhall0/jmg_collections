import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDateTime } from '../utils/format'

const ACTION_LABELS = {
  login: 'User Login',
  logout: 'User Logout',
  user_created: 'User Created',
  user_updated: 'User Updated',
  user_deleted: 'User Deleted',
  case_created: 'Case Created',
  case_updated: 'Case Updated',
  case_deleted: 'Case Deleted',
  case_stage_changed: 'Stage Changed',
  case_status_changed: 'Status Changed',
  document_uploaded: 'Document Uploaded',
  document_deleted: 'Document Deleted',
  document_generated: 'Document Generated',
  task_created: 'Task Created',
  task_updated: 'Task Updated',
  task_completed: 'Task Completed',
  task_deleted: 'Task Deleted',
  communication_logged: 'Communication Logged',
  note_added: 'Note Added',
  counsel_assigned: 'Counsel Assigned',
  counsel_removed: 'Counsel Removed',
  local_counsel_assigned: 'Local Counsel Assigned',
  template_created: 'Template Created',
  template_updated: 'Template Updated',
  template_deleted: 'Template Deleted',
  share_link_created: 'Share Link Created',
  share_link_accessed: 'Share Link Accessed',
  invite_sent: 'Invite Sent',
  invite_accepted: 'Invite Accepted'
}

const ENTITY_LABELS = {
  user: 'User',
  case: 'Case',
  document: 'Document',
  task: 'Task',
  communication: 'Communication',
  note: 'Note',
  template: 'Template',
  share_link: 'Share Link',
  invite: 'Invite',
  local_counsel: 'Local Counsel'
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [actionTypes, setActionTypes] = useState([])
  const [entityTypes, setEntityTypes] = useState([])
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 })

  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    action: '',
    entity_type: '',
    search: ''
  })

  useEffect(() => {
    loadLogs()
    loadStats()
    loadFilterOptions()
  }, [])

  const loadLogs = async (newOffset = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('limit', '50')
      params.append('offset', newOffset.toString())

      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)
      if (filters.action) params.append('action', filters.action)
      if (filters.entity_type) params.append('entity_type', filters.entity_type)
      if (filters.search) params.append('search', filters.search)

      const data = await api.get(`/audit?${params.toString()}`)
      setLogs(data.logs)
      setPagination({ total: data.total, limit: data.limit, offset: data.offset })
    } catch (error) {
      console.error('Error loading audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await api.get('/audit/stats?days=30')
      setStats(data)
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const loadFilterOptions = async () => {
    try {
      const [actionsData, entitiesData] = await Promise.all([
        api.get('/audit/action-types'),
        api.get('/audit/entity-types')
      ])
      setActionTypes(actionsData.actions)
      setEntityTypes(entitiesData.entity_types)
    } catch (error) {
      console.error('Error loading filter options:', error)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    loadLogs(0)
  }

  const clearFilters = () => {
    setFilters({
      start_date: '',
      end_date: '',
      action: '',
      entity_type: '',
      search: ''
    })
    setTimeout(() => loadLogs(0), 0)
  }

  const exportToCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)
      if (filters.action) params.append('action', filters.action)
      if (filters.entity_type) params.append('entity_type', filters.entity_type)

      const response = await fetch(`/api/audit/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to export: ' + error.message)
    }
  }

  const getActionBadgeClass = (action) => {
    if (action.includes('delete')) return 'badge-danger'
    if (action.includes('create')) return 'badge-settled'
    if (action.includes('update') || action.includes('change')) return 'badge-stage'
    if (action.includes('login')) return 'badge-open'
    return 'badge-stage'
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit)
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
        <button className="btn btn-primary" onClick={exportToCSV}>
          Export CSV
        </button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Actions (30d)</div>
            <div style={{ fontSize: '28px', fontWeight: 600 }}>{stats.total_actions}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Top Action</div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>
              {stats.actions_by_type[0]?.action
                ? ACTION_LABELS[stats.actions_by_type[0].action] || stats.actions_by_type[0].action
                : '-'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
              {stats.actions_by_type[0]?.count || 0} occurrences
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Most Active User</div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>
              {stats.actions_by_user[0]?.full_name || '-'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
              {stats.actions_by_user[0]?.count || 0} actions
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Entity Types</div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>{stats.entity_types.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>being tracked</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: '1', minWidth: '150px' }}>
            <label>Search</label>
            <input
              type="text"
              placeholder="Search entity name, user..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Action</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">All Actions</option>
              {actionTypes.map(action => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] || action}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Entity Type</label>
            <select
              value={filters.entity_type}
              onChange={(e) => handleFilterChange('entity_type', e.target.value)}
            >
              <option value="">All Types</option>
              {entityTypes.map(type => (
                <option key={type} value={type}>
                  {ENTITY_LABELS[type] || type}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>
            Apply
          </button>
          <button className="btn btn-secondary" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        {loading ? (
          <div className="loading">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <h3>No audit logs found</h3>
            <p>Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity Type</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{log.user_name || 'System'}</div>
                        {log.user_role && (
                          <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                            {log.user_role.replace('_', ' ')}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getActionBadgeClass(log.action)}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {ENTITY_LABELS[log.entity_type] || log.entity_type}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {log.entity_name || (log.entity_id ? `#${log.entity_id}` : '-')}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', color: 'var(--gray-500)' }}>
                        {log.details ? (
                          typeof log.details === 'object'
                            ? JSON.stringify(log.details).substring(0, 50) + '...'
                            : String(log.details).substring(0, 50)
                        ) : '-'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--gray-200)'
            }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-500)' }}>
                Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadLogs(pagination.offset - pagination.limit)}
                  disabled={pagination.offset === 0}
                >
                  Previous
                </button>
                <span style={{ padding: '4px 12px', fontSize: '14px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadLogs(pagination.offset + pagination.limit)}
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
