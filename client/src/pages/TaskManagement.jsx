import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'

const GROUPABLE_COLUMNS = [
  { key: 'none', label: 'No Grouping' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assigned_to_name', label: 'Assigned To' },
  { key: 'case_number', label: 'Case' },
  { key: 'category_name', label: 'Category' },
  { key: 'is_overdue', label: 'Overdue Status' }
]

const PRIORITY_ORDER = { 'High': 1, 'Medium': 2, 'Low': 3 }
const STATUS_ORDER = { 'Not Started': 1, 'In Progress': 2, 'Complete': 3 }

export default function TaskManagement() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sortColumn, setSortColumn] = useState('due_date')
  const [sortDirection, setSortDirection] = useState('asc')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    try {
      const data = await api.get('/tasks/all')
      setTasks(data.tasks)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus })
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ))
    } catch (err) {
      setError(err.message)
    }
  }

  const getSortedTasks = () => {
    let filtered = [...tasks]

    // Apply status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        filtered = filtered.filter(t => t.status !== 'Complete')
      } else if (filterStatus === 'overdue') {
        filtered = filtered.filter(t => t.is_overdue)
      } else {
        filtered = filtered.filter(t => t.status === filterStatus)
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]

      // Special handling for priority
      if (sortColumn === 'priority') {
        aVal = PRIORITY_ORDER[aVal] || 99
        bVal = PRIORITY_ORDER[bVal] || 99
      }
      // Special handling for status
      else if (sortColumn === 'status') {
        aVal = STATUS_ORDER[aVal] || 99
        bVal = STATUS_ORDER[bVal] || 99
      }
      // Handle nulls
      else if (aVal === null || aVal === undefined) aVal = ''
      else if (bVal === null || bVal === undefined) bVal = ''

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }

  const getGroupedTasks = () => {
    const sorted = getSortedTasks()

    if (groupBy === 'none') {
      return [{ key: 'all', label: null, tasks: sorted }]
    }

    const groups = {}
    for (const task of sorted) {
      let groupKey = task[groupBy]

      // Special label for overdue grouping
      if (groupBy === 'is_overdue') {
        groupKey = task.is_overdue ? 'Overdue' : 'On Track'
      }

      if (groupKey === null || groupKey === undefined || groupKey === '') {
        groupKey = 'Uncategorized'
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(task)
    }

    // Sort groups
    let groupKeys = Object.keys(groups)

    if (groupBy === 'priority') {
      groupKeys.sort((a, b) => (PRIORITY_ORDER[a] || 99) - (PRIORITY_ORDER[b] || 99))
    } else if (groupBy === 'status') {
      groupKeys.sort((a, b) => (STATUS_ORDER[a] || 99) - (STATUS_ORDER[b] || 99))
    } else if (groupBy === 'is_overdue') {
      groupKeys.sort((a, b) => (a === 'Overdue' ? -1 : 1))
    } else {
      groupKeys.sort()
    }

    return groupKeys.map(key => ({
      key,
      label: key,
      tasks: groups[key]
    }))
  }

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'High': return 'badge-danger'
      case 'Medium': return 'badge-warning'
      case 'Low': return 'badge-secondary'
      default: return 'badge-secondary'
    }
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'Complete': return 'badge-success'
      case 'In Progress': return 'badge-info'
      case 'Not Started': return 'badge-secondary'
      default: return 'badge-secondary'
    }
  }

  const SortHeader = ({ column, label }) => (
    <th
      onClick={() => handleSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label}
      {sortColumn === column && (
        <span style={{ marginLeft: '4px' }}>
          {sortDirection === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  )

  const TaskTable = ({ tasks: tableTasks }) => (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <SortHeader column="description" label="Task" />
            <SortHeader column="case_number" label="Case" />
            <SortHeader column="assigned_to_name" label="Assigned To" />
            <SortHeader column="priority" label="Priority" />
            <SortHeader column="status" label="Status" />
            <SortHeader column="due_date" label="Due Date" />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tableTasks.map(task => (
            <tr
              key={task.id}
              className={task.is_overdue ? 'overdue-row' : ''}
            >
              <td>
                <div style={{ fontWeight: 500 }}>{task.description}</div>
                {task.is_overdue && (
                  <span className="badge badge-danger" style={{ fontSize: '10px', marginTop: '4px' }}>
                    OVERDUE
                  </span>
                )}
              </td>
              <td>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); navigate(`/cases/${task.case_id}`) }}
                  style={{ fontWeight: 500 }}
                >
                  {task.case_number}
                </a>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                  {task.defendant_name}
                </div>
              </td>
              <td>{task.assigned_to_name}</td>
              <td>
                <span className={`badge ${getPriorityClass(task.priority)}`}>
                  {task.priority}
                </span>
              </td>
              <td>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  className={`status-select ${getStatusClass(task.status)}`}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--gray-300)',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Complete">Complete</option>
                </select>
              </td>
              <td>
                <span style={{ color: task.is_overdue ? 'var(--danger)' : 'inherit' }}>
                  {formatDate(task.due_date)}
                </span>
              </td>
              <td>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  onClick={() => navigate(`/cases/${task.case_id}`)}
                >
                  View Case
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (loading) {
    return <div className="loading">Loading tasks...</div>
  }

  const groupedTasks = getGroupedTasks()
  const totalTasks = getSortedTasks().length
  const overdueTasks = tasks.filter(t => t.is_overdue).length
  const completedTasks = tasks.filter(t => t.status === 'Complete').length

  return (
    <div>
      <div className="page-header">
        <h1>Task Management</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--primary)' }}>{tasks.length}</div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>Total Tasks</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--danger)' }}>{overdueTasks}</div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>Overdue</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--warning)' }}>
            {tasks.filter(t => t.status === 'In Progress').length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>In Progress</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--success)' }}>{completedTasks}</div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>Completed</div>
        </div>
      </div>

      {/* Filters and Grouping */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ marginBottom: '4px', display: 'block', fontSize: '12px' }}>Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="all">All Tasks</option>
              <option value="active">Active (Not Complete)</option>
              <option value="overdue">Overdue Only</option>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ marginBottom: '4px', display: 'block', fontSize: '12px' }}>Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              {GROUPABLE_COLUMNS.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginLeft: 'auto', color: 'var(--gray-500)', fontSize: '14px' }}>
            Showing {totalTasks} task{totalTasks !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Task Tables */}
      {groupedTasks.length === 0 || (groupedTasks.length === 1 && groupedTasks[0].tasks.length === 0) ? (
        <div className="card">
          <div className="empty-state">
            <h3>No Tasks Found</h3>
            <p>No tasks match the current filters.</p>
          </div>
        </div>
      ) : (
        groupedTasks.map(group => (
          <div key={group.key} className="card" style={{ marginBottom: '24px' }}>
            {group.label && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--gray-200)'
              }}>
                <h3 style={{ margin: 0 }}>
                  {groupBy === 'priority' && (
                    <span className={`badge ${getPriorityClass(group.label)}`} style={{ marginRight: '8px' }}>
                      {group.label}
                    </span>
                  )}
                  {groupBy === 'status' && (
                    <span className={`badge ${getStatusClass(group.label)}`} style={{ marginRight: '8px' }}>
                      {group.label}
                    </span>
                  )}
                  {groupBy === 'is_overdue' && (
                    <span className={`badge ${group.label === 'Overdue' ? 'badge-danger' : 'badge-success'}`} style={{ marginRight: '8px' }}>
                      {group.label}
                    </span>
                  )}
                  {groupBy !== 'priority' && groupBy !== 'status' && groupBy !== 'is_overdue' && group.label}
                </h3>
                <span style={{ color: 'var(--gray-500)', fontSize: '14px' }}>
                  {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <TaskTable tasks={group.tasks} />
          </div>
        ))
      )}
    </div>
  )
}
