import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../utils/api'

export default function CaseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [options, setOptions] = useState({
    stages: [],
    entity_types: [],
    resolution_statuses: [],
    states: []
  })

  const [formData, setFormData] = useState({
    case_name: '',
    client_matter_reference: '',
    date_opened: new Date().toISOString().split('T')[0],
    defendant_name: '',
    defendant_entity_type: 'Individual',
    defendant_contact_name: '',
    defendant_email: '',
    defendant_phone: '',
    defendant_mailing_address: '',
    defendant_state: '',
    defendant_attorney_name: '',
    defendant_attorney_firm: '',
    defendant_attorney_address: '',
    defendant_attorney_email: '',
    defendant_attorney_phone: '',
    amount_claimed: '',
    date_claim_arose: '',
    statute_of_limitations_date: '',
    claim_description: '',
    current_stage: 'Intake',
    resolution_status: 'Open',
    amount_recovered: '0',
    date_closed: '',
    initial_notice_sent_date: '',
    initial_notice_response_deadline: '',
    second_notice_sent_date: '',
    second_notice_response_deadline: ''
  })

  useEffect(() => {
    loadOptions()
    if (isEditing) {
      loadCase()
    }
  }, [id])

  const loadOptions = async () => {
    try {
      const data = await api.get('/cases/options')
      setOptions(data)
    } catch (err) {
      console.error('Error loading options:', err)
    }
  }

  const loadCase = async () => {
    try {
      const data = await api.get(`/cases/${id}`)
      const caseData = data.case
      setFormData({
        case_name: caseData.case_name || '',
        client_matter_reference: caseData.client_matter_reference || '',
        date_opened: caseData.date_opened || '',
        defendant_name: caseData.defendant_name || '',
        defendant_entity_type: caseData.defendant_entity_type || 'Individual',
        defendant_contact_name: caseData.defendant_contact_name || '',
        defendant_email: caseData.defendant_email || '',
        defendant_phone: caseData.defendant_phone || '',
        defendant_mailing_address: caseData.defendant_mailing_address || '',
        defendant_state: caseData.defendant_state || '',
        defendant_attorney_name: caseData.defendant_attorney_name || '',
        defendant_attorney_firm: caseData.defendant_attorney_firm || '',
        defendant_attorney_address: caseData.defendant_attorney_address || '',
        defendant_attorney_email: caseData.defendant_attorney_email || '',
        defendant_attorney_phone: caseData.defendant_attorney_phone || '',
        amount_claimed: caseData.amount_claimed?.toString() || '',
        date_claim_arose: caseData.date_claim_arose || '',
        statute_of_limitations_date: caseData.statute_of_limitations_date || '',
        claim_description: caseData.claim_description || '',
        current_stage: caseData.current_stage || 'Intake',
        resolution_status: caseData.resolution_status || 'Open',
        amount_recovered: caseData.amount_recovered?.toString() || '0',
        date_closed: caseData.date_closed || '',
        initial_notice_sent_date: caseData.initial_notice_sent_date || '',
        initial_notice_response_deadline: caseData.initial_notice_response_deadline || '',
        second_notice_sent_date: caseData.second_notice_sent_date || '',
        second_notice_response_deadline: caseData.second_notice_response_deadline || ''
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const updated = { ...prev, [name]: value }

      // Auto-calculate response deadlines
      if (name === 'initial_notice_sent_date' && value) {
        const date = new Date(value)
        date.setDate(date.getDate() + 14)
        updated.initial_notice_response_deadline = date.toISOString().split('T')[0]
      }
      if (name === 'second_notice_sent_date' && value) {
        const date = new Date(value)
        date.setDate(date.getDate() + 10)
        updated.second_notice_response_deadline = date.toISOString().split('T')[0]
      }

      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const payload = {
        ...formData,
        amount_claimed: parseFloat(formData.amount_claimed) || 0,
        amount_recovered: parseFloat(formData.amount_recovered) || 0
      }

      if (isEditing) {
        await api.put(`/cases/${id}`, payload)
      } else {
        const data = await api.post('/cases', payload)
        navigate(`/cases/${data.case.id}`)
        return
      }

      navigate(`/cases/${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEditing ? 'Edit Case' : 'New Case'}</h1>
        <Link to={isEditing ? `/cases/${id}` : '/cases'} className="btn btn-secondary">
          Cancel
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Case Information</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="case_name">Case Name *</label>
              <input
                type="text"
                id="case_name"
                name="case_name"
                value={formData.case_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="client_matter_reference">Client Matter Reference</label>
              <input
                type="text"
                id="client_matter_reference"
                name="client_matter_reference"
                value={formData.client_matter_reference}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date_opened">Date Opened</label>
              <input
                type="date"
                id="date_opened"
                name="date_opened"
                value={formData.date_opened}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="current_stage">Current Stage</label>
              <select
                id="current_stage"
                name="current_stage"
                value={formData.current_stage}
                onChange={handleChange}
              >
                {options.stages.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="resolution_status">Resolution Status</label>
              <select
                id="resolution_status"
                name="resolution_status"
                value={formData.resolution_status}
                onChange={handleChange}
              >
                {options.resolution_statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="date_closed">Date Closed</label>
              <input
                type="date"
                id="date_closed"
                name="date_closed"
                value={formData.date_closed}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Defendant Information</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defendant_name">Defendant Name *</label>
              <input
                type="text"
                id="defendant_name"
                name="defendant_name"
                value={formData.defendant_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="defendant_entity_type">Entity Type *</label>
              <select
                id="defendant_entity_type"
                name="defendant_entity_type"
                value={formData.defendant_entity_type}
                onChange={handleChange}
                required
              >
                {options.entity_types.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defendant_contact_name">Contact Name</label>
              <input
                type="text"
                id="defendant_contact_name"
                name="defendant_contact_name"
                value={formData.defendant_contact_name}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="defendant_state">State/Jurisdiction</label>
              <select
                id="defendant_state"
                name="defendant_state"
                value={formData.defendant_state}
                onChange={handleChange}
              >
                <option value="">Select State...</option>
                {options.states.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defendant_email">Email</label>
              <input
                type="email"
                id="defendant_email"
                name="defendant_email"
                value={formData.defendant_email}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="defendant_phone">Phone</label>
              <input
                type="tel"
                id="defendant_phone"
                name="defendant_phone"
                value={formData.defendant_phone}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="defendant_mailing_address">Mailing Address</label>
            <textarea
              id="defendant_mailing_address"
              name="defendant_mailing_address"
              value={formData.defendant_mailing_address}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Defendant's Attorney (if known)</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defendant_attorney_name">Attorney Name</label>
              <input
                type="text"
                id="defendant_attorney_name"
                name="defendant_attorney_name"
                value={formData.defendant_attorney_name}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="defendant_attorney_firm">Law Firm</label>
              <input
                type="text"
                id="defendant_attorney_firm"
                name="defendant_attorney_firm"
                value={formData.defendant_attorney_firm}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defendant_attorney_email">Attorney Email</label>
              <input
                type="email"
                id="defendant_attorney_email"
                name="defendant_attorney_email"
                value={formData.defendant_attorney_email}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="defendant_attorney_phone">Attorney Phone</label>
              <input
                type="tel"
                id="defendant_attorney_phone"
                name="defendant_attorney_phone"
                value={formData.defendant_attorney_phone}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="defendant_attorney_address">Attorney Address</label>
            <textarea
              id="defendant_attorney_address"
              name="defendant_attorney_address"
              value={formData.defendant_attorney_address}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Claim Details</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="amount_claimed">Amount Claimed *</label>
              <input
                type="number"
                id="amount_claimed"
                name="amount_claimed"
                value={formData.amount_claimed}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="amount_recovered">Amount Recovered</label>
              <input
                type="number"
                id="amount_recovered"
                name="amount_recovered"
                value={formData.amount_recovered}
                onChange={handleChange}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date_claim_arose">Date Claim Arose</label>
              <input
                type="date"
                id="date_claim_arose"
                name="date_claim_arose"
                value={formData.date_claim_arose}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="statute_of_limitations_date">Statute of Limitations Date</label>
              <input
                type="date"
                id="statute_of_limitations_date"
                name="statute_of_limitations_date"
                value={formData.statute_of_limitations_date}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="claim_description">Claim Description</label>
            <textarea
              id="claim_description"
              name="claim_description"
              value={formData.claim_description}
              onChange={handleChange}
              rows={4}
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Deadline Tracking</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="initial_notice_sent_date">Initial Notice Sent Date</label>
              <input
                type="date"
                id="initial_notice_sent_date"
                name="initial_notice_sent_date"
                value={formData.initial_notice_sent_date}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="initial_notice_response_deadline">
                Response Deadline
                <span style={{ fontSize: '11px', color: 'var(--gray-500)', marginLeft: '8px' }}>
                  (auto: 14 days)
                </span>
              </label>
              <input
                type="date"
                id="initial_notice_response_deadline"
                name="initial_notice_response_deadline"
                value={formData.initial_notice_response_deadline}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="second_notice_sent_date">Second Notice Sent Date</label>
              <input
                type="date"
                id="second_notice_sent_date"
                name="second_notice_sent_date"
                value={formData.second_notice_sent_date}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="second_notice_response_deadline">
                Response Deadline
                <span style={{ fontSize: '11px', color: 'var(--gray-500)', marginLeft: '8px' }}>
                  (auto: 10 days)
                </span>
              </label>
              <input
                type="date"
                id="second_notice_response_deadline"
                name="second_notice_response_deadline"
                value={formData.second_notice_response_deadline}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Link to={isEditing ? `/cases/${id}` : '/cases'} className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  )
}
