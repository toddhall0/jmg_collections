import { useState, useEffect } from 'react'
import { api } from '../utils/api'

const ENTITY_TYPES = ['Individual', 'LLC', 'Corporation', 'Partnership', 'Trust', 'Other']

export default function ClientMatterForm({ onClose, onSuccess }) {
  const [categories, setCategories] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    case_name: '',
    category_id: '',
    defendant_name: '',
    defendant_entity_type: 'Individual',
    defendant_contact_name: '',
    defendant_email: '',
    defendant_phone: '',
    defendant_mailing_address: '',
    defendant_state: '',
    amount_claimed: '',
    date_claim_arose: '',
    claim_description: ''
  })

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const data = await api.get('/categories')
      setCategories(data.categories || [])
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-populate claim description from category
    if (name === 'category_id' && value) {
      const category = categories.find(c => c.id.toString() === value)
      if (category?.default_claim_language && !formData.claim_description) {
        setFormData(prev => ({ ...prev, claim_description: category.default_claim_language }))
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const payload = {
        ...formData,
        category_id: formData.category_id ? parseInt(formData.category_id) : null,
        amount_claimed: parseFloat(formData.amount_claimed) || 0
      }

      await api.post('/cases/client-request', payload)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to submit matter request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>New Matter Request</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ marginBottom: '24px', padding: '12px', background: 'var(--gray-50)', borderRadius: '6px', fontSize: '14px', color: 'var(--gray-600)' }}>
              Please provide the details of the matter you would like us to handle. Our team will review and follow up with you.
            </div>

            {/* Matter Information */}
            <h4 style={{ marginBottom: '16px', color: 'var(--gray-700)' }}>Matter Information</h4>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="case_name">Matter Name *</label>
                <input
                  type="text"
                  id="case_name"
                  name="case_name"
                  value={formData.case_name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., ABC Company Collection"
                />
              </div>
              <div className="form-group">
                <label htmlFor="category_id">Category</label>
                <select
                  id="category_id"
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                >
                  <option value="">Select Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name} ({cat.code})</option>
                  ))}
                </select>
              </div>
            </div>

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
                  placeholder="0.00"
                />
              </div>
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
            </div>

            {/* Defendant Information */}
            <h4 style={{ marginTop: '24px', marginBottom: '16px', color: 'var(--gray-700)' }}>Defendant Information</h4>

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
                  placeholder="Full legal name"
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
                  {ENTITY_TYPES.map(type => (
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
                  placeholder="Primary contact person"
                />
              </div>
              <div className="form-group">
                <label htmlFor="defendant_state">State</label>
                <input
                  type="text"
                  id="defendant_state"
                  name="defendant_state"
                  value={formData.defendant_state}
                  onChange={handleChange}
                  placeholder="e.g., TX"
                  maxLength={2}
                  style={{ textTransform: 'uppercase' }}
                />
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
                  placeholder="defendant@example.com"
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
                  placeholder="(555) 123-4567"
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
                rows={2}
                placeholder="Street address, City, State ZIP"
              />
            </div>

            {/* Claim Description */}
            <h4 style={{ marginTop: '24px', marginBottom: '16px', color: 'var(--gray-700)' }}>Claim Details</h4>

            <div className="form-group">
              <label htmlFor="claim_description">Description of Claim</label>
              <textarea
                id="claim_description"
                name="claim_description"
                value={formData.claim_description}
                onChange={handleChange}
                rows={4}
                placeholder="Please describe the nature of the claim, including relevant dates, agreements, and any supporting facts..."
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Matter Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
