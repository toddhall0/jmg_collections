import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/format'

export default function LocalCounselDirectory() {
  const [contacts, setContacts] = useState([])
  const [options, setOptions] = useState({ states: [], performance_ratings: [], statuses: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ state: '', status: '', search: '' })
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [formData, setFormData] = useState({
    firm_name: '',
    attorney_name: '',
    email: '',
    phone: '',
    address: '',
    states_covered: [],
    hourly_rate: '',
    retainer_required: '',
    fee_arrangement_notes: '',
    performance_rating: 'Not Yet Rated',
    notes: '',
    status: 'Active',
    create_user_account: false,
    username: '',
    password: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadOptions()
    loadContacts()
  }, [])

  useEffect(() => {
    loadContacts()
  }, [filters])

  const loadOptions = async () => {
    try {
      const data = await api.get('/local-counsel/options')
      setOptions(data)
    } catch (err) {
      console.error('Error loading options:', err)
    }
  }

  const loadContacts = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.state) params.append('state', filters.state)
      if (filters.status) params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)

      const data = await api.get(`/local-counsel?${params.toString()}`)
      setContacts(data.contacts)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleStateToggle = (state) => {
    setFormData(prev => ({
      ...prev,
      states_covered: prev.states_covered.includes(state)
        ? prev.states_covered.filter(s => s !== state)
        : [...prev.states_covered, state]
    }))
  }

  const openNewForm = () => {
    setEditingContact(null)
    setFormData({
      firm_name: '',
      attorney_name: '',
      email: '',
      phone: '',
      address: '',
      states_covered: [],
      hourly_rate: '',
      retainer_required: '',
      fee_arrangement_notes: '',
      performance_rating: 'Not Yet Rated',
      notes: '',
      status: 'Active',
      create_user_account: false,
      username: '',
      password: ''
    })
    setShowForm(true)
  }

  const openEditForm = (contact) => {
    setEditingContact(contact)
    setFormData({
      firm_name: contact.firm_name,
      attorney_name: contact.attorney_name,
      email: contact.email,
      phone: contact.phone || '',
      address: contact.address || '',
      states_covered: contact.states_covered || [],
      hourly_rate: contact.hourly_rate?.toString() || '',
      retainer_required: contact.retainer_required?.toString() || '',
      fee_arrangement_notes: contact.fee_arrangement_notes || '',
      performance_rating: contact.performance_rating || 'Not Yet Rated',
      notes: contact.notes || '',
      status: contact.status || 'Active',
      create_user_account: false,
      username: '',
      password: ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Validate user account fields if creating user
      if (formData.create_user_account && !editingContact) {
        if (!formData.username || formData.username.length < 3) {
          alert('Username must be at least 3 characters')
          setSaving(false)
          return
        }
        if (!formData.password || formData.password.length < 6) {
          alert('Password must be at least 6 characters')
          setSaving(false)
          return
        }
      }

      const payload = {
        firm_name: formData.firm_name,
        attorney_name: formData.attorney_name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        states_covered: formData.states_covered,
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        retainer_required: formData.retainer_required ? parseFloat(formData.retainer_required) : null,
        fee_arrangement_notes: formData.fee_arrangement_notes,
        performance_rating: formData.performance_rating,
        notes: formData.notes,
        status: formData.status
      }

      // Add user account creation fields if checkbox is checked
      if (formData.create_user_account && !editingContact) {
        payload.create_user_account = true
        payload.username = formData.username
        payload.password = formData.password
      }

      let result
      if (editingContact) {
        result = await api.put(`/local-counsel/${editingContact.id}`, payload)
      } else {
        result = await api.post('/local-counsel', payload)
      }

      setShowForm(false)
      loadContacts()

      // Show success message if user was created
      if (result.user_created) {
        alert(`Contact created successfully!\n\nUser account created:\nUsername: ${formData.username}\nTemporary Password: ${formData.password}\n\nPlease share these credentials with the counsel.`)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (contact) => {
    if (!confirm(`Are you sure you want to delete ${contact.attorney_name} from ${contact.firm_name}?`)) {
      return
    }

    try {
      await api.delete(`/local-counsel/${contact.id}`)
      loadContacts()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const getRatingBadgeClass = (rating) => {
    const classes = {
      'Excellent': 'badge-success',
      'Good': 'badge-info',
      'Satisfactory': 'badge-warning',
      'Below Expectations': 'badge-danger',
      'Not Yet Rated': 'badge-secondary'
    }
    return classes[rating] || 'badge-secondary'
  }

  const getStatusBadgeClass = (status) => {
    const classes = {
      'Active': 'badge-success',
      'Inactive': 'badge-secondary',
      'Do Not Use': 'badge-danger'
    }
    return classes[status] || 'badge-secondary'
  }

  if (loading) {
    return <div className="loading">Loading local counsel directory...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1>Local Counsel Directory</h1>
        <button className="btn btn-primary" onClick={openNewForm}>
          + Add Contact
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1', minWidth: '200px', marginBottom: 0 }}>
            <label>Search</label>
            <input
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Search firm or attorney name..."
            />
          </div>
          <div className="form-group" style={{ width: '150px', marginBottom: 0 }}>
            <label>State</label>
            <select name="state" value={filters.state} onChange={handleFilterChange}>
              <option value="">All States</option>
              {options.states.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: '150px', marginBottom: 0 }}>
            <label>Status</label>
            <select name="status" value={filters.status} onChange={handleFilterChange}>
              <option value="">All Statuses</option>
              {options.statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contacts List */}
      <div className="card">
        {contacts.length === 0 ? (
          <div className="empty-state">
            <h3>No contacts found</h3>
            <p>Add local counsel contacts to build your directory.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Firm / Attorney</th>
                <th>Contact</th>
                <th>States</th>
                <th>Hourly Rate</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Cases</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(contact => (
                <tr key={contact.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{contact.firm_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                      {contact.attorney_name}
                    </div>
                  </td>
                  <td>
                    <div>{contact.email}</div>
                    {contact.phone && (
                      <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                        {contact.phone}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {contact.states_covered.slice(0, 5).map(state => (
                        <span key={state} className="badge badge-secondary" style={{ fontSize: '11px' }}>
                          {state}
                        </span>
                      ))}
                      {contact.states_covered.length > 5 && (
                        <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                          +{contact.states_covered.length - 5}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {contact.hourly_rate ? formatCurrency(contact.hourly_rate) + '/hr' : '-'}
                  </td>
                  <td>
                    <span className={`badge ${getRatingBadgeClass(contact.performance_rating)}`}>
                      {contact.performance_rating}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(contact.status)}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td>{contact.case_count}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEditForm(contact)}
                      >
                        Edit
                      </button>
                      {contact.case_count === 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleDelete(contact)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingContact ? 'Edit Contact' : 'Add New Contact'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Firm Name *</label>
                    <input
                      type="text"
                      name="firm_name"
                      value={formData.firm_name}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Attorney Name *</label>
                    <input
                      type="text"
                      name="attorney_name"
                      value={formData.attorney_name}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleFormChange}
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label>States/Jurisdictions Covered</label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                    gap: '8px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    padding: '8px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: '4px'
                  }}>
                    {options.states.map(state => (
                      <label
                        key={state}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.states_covered.includes(state)}
                          onChange={() => handleStateToggle(state)}
                        />
                        {state}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Hourly Rate ($)</label>
                    <input
                      type="number"
                      name="hourly_rate"
                      value={formData.hourly_rate}
                      onChange={handleFormChange}
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Retainer Required ($)</label>
                    <input
                      type="number"
                      name="retainer_required"
                      value={formData.retainer_required}
                      onChange={handleFormChange}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Fee Arrangement Notes</label>
                  <textarea
                    name="fee_arrangement_notes"
                    value={formData.fee_arrangement_notes}
                    onChange={handleFormChange}
                    rows={2}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Performance Rating</label>
                    <select
                      name="performance_rating"
                      value={formData.performance_rating}
                      onChange={handleFormChange}
                    >
                      {options.performance_ratings.map(rating => (
                        <option key={rating} value={rating}>{rating}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleFormChange}
                    >
                      {options.statuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    rows={3}
                    placeholder="General notes about working with this counsel..."
                  />
                </div>

                {/* User Account Creation Section - only for new contacts */}
                {!editingContact && (
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: 'var(--gray-50)',
                    borderRadius: '8px',
                    border: '1px solid var(--gray-200)'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      marginBottom: formData.create_user_account ? '16px' : 0
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.create_user_account}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          create_user_account: e.target.checked,
                          username: e.target.checked ? prev.email.split('@')[0] : '',
                          password: ''
                        }))}
                      />
                      Create user account for system access
                    </label>

                    {formData.create_user_account && (
                      <div>
                        <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '12px' }}>
                          This will create a login account so the counsel can access assigned cases in the system.
                        </p>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Username *</label>
                            <input
                              type="text"
                              name="username"
                              value={formData.username}
                              onChange={handleFormChange}
                              placeholder="Username for login"
                              minLength={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>Temporary Password *</label>
                            <input
                              type="text"
                              name="password"
                              value={formData.password}
                              onChange={handleFormChange}
                              placeholder="Initial password (min 6 chars)"
                              minLength={6}
                            />
                          </div>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '8px' }}>
                          The counsel will use their email ({formData.email || 'entered above'}) and this password to log in.
                          They should change their password after first login.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : (editingContact ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
