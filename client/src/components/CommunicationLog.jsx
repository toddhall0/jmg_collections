import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDate, formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'

const COMMUNICATION_TYPES = [
  'Phone Call - Outbound',
  'Phone Call - Inbound',
  'Email - Sent',
  'Email - Received',
  'Letter - Sent',
  'Letter - Received',
  'In-Person Meeting',
  'Other'
]

export default function CommunicationLog({ caseId }) {
  const [communications, setCommunications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { user, isClient, isAdmin } = useAuth()

  const emptyForm = {
    communication_date: new Date().toISOString().split('T')[0],
    type: 'Phone Call - Outbound',
    contact_person: '',
    summary: '',
    follow_up_required: false,
    follow_up_date: ''
  }

  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    loadCommunications()
  }, [caseId])

  const loadCommunications = async () => {
    try {
      const data = await api.get(`/communications/case/${caseId}`)
      setCommunications(data.communications)
    } catch (err) {
      console.error('Error loading communications:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const resetForm = () => {
    setFormData(emptyForm)
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (comm) => {
    setFormData({
      communication_date: comm.communication_date,
      type: comm.type,
      contact_person: comm.contact_person || '',
      summary: comm.summary || '',
      follow_up_required: Boolean(comm.follow_up_required),
      follow_up_date: comm.follow_up_date || ''
    })
    setEditingId(comm.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      if (editingId) {
        const data = await api.put(`/communications/${editingId}`, formData)
        setCommunications(communications.map(c =>
          c.id === editingId ? data.communication : c
        ))
      } else {
        const data = await api.post(`/communications/case/${caseId}`, formData)
        setCommunications([data.communication, ...communications])
      }
      resetForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const canEdit = (comm) => {
    return isAdmin || comm.created_by === user?.id
  }

  const getTypeIcon = (type) => {
    if (type.includes('Phone')) return '📞'
    if (type.includes('Email')) return '📧'
    if (type.includes('Letter')) return '📬'
    if (type.includes('Meeting')) return '🤝'
    return '📝'
  }

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Communication Log</h3>
        {!isClient && !showForm && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
            + Log Communication
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '16px', background: 'var(--gray-50)', borderRadius: '4px' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Date of Communication *</label>
              <input
                type="date"
                name="communication_date"
                value={formData.communication_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Type *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
              >
                {COMMUNICATION_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Contact Person</label>
            <input
              type="text"
              name="contact_person"
              value={formData.contact_person}
              onChange={handleChange}
              placeholder="Who did you communicate with?"
            />
          </div>

          <div className="form-group">
            <label>Summary</label>
            <textarea
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              rows={3}
              placeholder="Brief summary of the communication..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  name="follow_up_required"
                  checked={formData.follow_up_required}
                  onChange={handleChange}
                />
                Follow-up Required
              </label>
            </div>
            {formData.follow_up_required && (
              <div className="form-group">
                <label>Follow-up Date</label>
                <input
                  type="date"
                  name="follow_up_date"
                  value={formData.follow_up_date}
                  onChange={handleChange}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Log Communication'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">Loading communications...</div>
      ) : communications.length === 0 ? (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
          No communications logged yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {communications.map((comm) => (
            <div
              key={comm.id}
              style={{
                padding: '12px',
                background: 'var(--gray-50)',
                borderRadius: '4px',
                borderLeft: comm.follow_up_required ? '3px solid var(--warning)' : '3px solid var(--gray-300)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '16px', marginRight: '8px' }}>{getTypeIcon(comm.type)}</span>
                  <strong>{comm.type}</strong>
                  {comm.contact_person && (
                    <span style={{ color: 'var(--gray-600)', marginLeft: '8px' }}>
                      with {comm.contact_person}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                  {formatDate(comm.communication_date)}
                </div>
              </div>

              {comm.summary && (
                <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap', color: 'var(--gray-700)' }}>
                  {comm.summary}
                </div>
              )}

              {comm.follow_up_required && (
                <div style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  background: 'var(--warning)',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '8px'
                }}>
                  Follow-up {comm.follow_up_date ? `by ${formatDate(comm.follow_up_date)}` : 'required'}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--gray-500)' }}>
                <span>
                  Logged by <strong>{comm.author_name}</strong> &middot; {formatDateTime(comm.created_at)}
                </span>
                {canEdit(comm) && !isClient && (
                  <button
                    className="btn btn-sm"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                    onClick={() => handleEdit(comm)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
