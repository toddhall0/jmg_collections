import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

const PRIORITIES = ['High', 'Medium', 'Low']
const STATUSES = ['Not Started', 'In Progress', 'Complete']

export default function CaseTasks({ caseId }) {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { user, isClient, isAdmin } = useAuth()

  const emptyForm = {
    description: '',
    assigned_to: '',
    due_date: new Date().toISOString().split('T')[0],
    priority: 'Medium',
    status: 'Not Started'
  }

  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    loadTasks()
    loadUsers()
  }, [caseId])

  const loadTasks = async () => {
    try {
      const data = await api.get(`/tasks/case/${caseId}`)
      setTasks(data.tasks)
    } catch (err) {
      console.error('Error loading tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const data = await api.get('/users')
      setUsers(data.users.filter(u => u.active))
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setFormData(emptyForm)
    setEditingTask(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (task) => {
    setFormData({
      description: task.description,
      assigned_to: task.assigned_to.toString(),
      due_date: task.due_date,
      priority: task.priority,
      status: task.status
    })
    setEditingTask(task)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const payload = {
        ...formData,
        assigned_to: parseInt(formData.assigned_to)
      }

      if (editingTask) {
        if (isAdmin) {
          await api.put(`/tasks/${editingTask.id}`, payload)
        } else {
          // Non-admin can only update status
          await api.put(`/tasks/${editingTask.id}`, { status: payload.status })
        }
      } else {
        await api.post(`/tasks/case/${caseId}`, payload)
      }
      await loadTasks()
      resetForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await api.delete(`/tasks/${taskId}`)
      await loadTasks()
    } catch (err) {
      alert('Failed to delete task: ' + err.message)
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus })
      await loadTasks()
    } catch (err) {
      alert('Failed to update status: ' + err.message)
    }
  }

  const isOverdue = (dueDate, status) => {
    if (status === 'Complete') return false
    const today = new Date().toISOString().split('T')[0]
    return dueDate < today
  }

  const canEditTask = (task) => {
    return isAdmin || task.assigned_to === user?.id
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'var(--danger)'
      case 'Medium': return 'var(--warning)'
      case 'Low': return 'var(--gray-500)'
      default: return 'var(--gray-500)'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Complete': return 'var(--success)'
      case 'In Progress': return 'var(--accent)'
      default: return 'var(--gray-500)'
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Tasks</h3>
        {!isClient && !showForm && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
            + New Task
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '16px', background: 'var(--gray-50)', borderRadius: '4px' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div className="form-group">
            <label>Task Description *</label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              disabled={editingTask && !isAdmin}
              placeholder="Describe the task..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Assigned To *</label>
              <select
                name="assigned_to"
                value={formData.assigned_to}
                onChange={handleChange}
                required
                disabled={editingTask && !isAdmin}
              >
                <option value="">Select user...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Due Date *</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                required
                disabled={editingTask && !isAdmin}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Priority</label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                disabled={editingTask && !isAdmin}
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
          No tasks yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tasks.map((task) => {
            const overdue = isOverdue(task.due_date, task.status)

            return (
              <div
                key={task.id}
                style={{
                  padding: '12px',
                  background: overdue ? '#fff5f5' : 'var(--gray-50)',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${overdue ? 'var(--danger)' : getPriorityColor(task.priority)}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: 500,
                      textDecoration: task.status === 'Complete' ? 'line-through' : 'none',
                      color: task.status === 'Complete' ? 'var(--gray-500)' : 'var(--gray-800)'
                    }}>
                      {task.description}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '4px' }}>
                      Assigned to: {task.assigned_to_name}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: `${getPriorityColor(task.priority)}20`,
                      color: getPriorityColor(task.priority)
                    }}>
                      {task.priority}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                    <span style={{ color: overdue ? 'var(--danger)' : 'var(--gray-500)' }}>
                      Due: {formatDate(task.due_date)}
                      {overdue && ' (OVERDUE)'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {canEditTask(task) && !isClient && (
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          border: '1px solid var(--gray-300)',
                          background: `${getStatusColor(task.status)}15`,
                          color: getStatusColor(task.status)
                        }}
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}

                    {!canEditTask(task) && (
                      <span style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        background: `${getStatusColor(task.status)}15`,
                        color: getStatusColor(task.status)
                      }}>
                        {task.status}
                      </span>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          className="btn btn-sm"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => handleEdit(task)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => handleDelete(task.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
