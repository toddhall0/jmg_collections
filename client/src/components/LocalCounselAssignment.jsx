import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function LocalCounselAssignment({ caseId, caseData, onUpdate }) {
  const { isAdmin } = useAuth()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [counselOptions, setCounselOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    local_counsel_id: '',
    engagement_date: new Date().toISOString().split('T')[0],
    fee_arrangement: '',
    user_id: ''
  })

  useEffect(() => {
    if (showAssignModal && caseData?.defendant_state) {
      loadCounselByState(caseData.defendant_state)
      loadLocalCounselUsers()
    }
  }, [showAssignModal, caseData?.defendant_state])

  const loadCounselByState = async (state) => {
    try {
      const data = await api.get(`/local-counsel/by-state/${state}`)
      setCounselOptions(data.contacts)
    } catch (err) {
      console.error('Error loading counsel:', err)
    }
  }

  const loadLocalCounselUsers = async () => {
    try {
      const data = await api.get('/users/local-counsel')
      setUserOptions(data.users)
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const handleAssign = async () => {
    if (!formData.local_counsel_id) {
      alert('Please select a local counsel contact')
      return
    }

    setLoading(true)
    try {
      await api.post(`/cases/${caseId}/local-counsel`, {
        local_counsel_id: parseInt(formData.local_counsel_id),
        engagement_date: formData.engagement_date,
        fee_arrangement: formData.fee_arrangement,
        user_id: formData.user_id ? parseInt(formData.user_id) : null
      })
      setShowAssignModal(false)
      onUpdate()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove local counsel from this case?')) return

    try {
      await api.delete(`/cases/${caseId}/local-counsel`)
      onUpdate()
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

  const hasAssignedCounsel = caseData?.local_counsel_id

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Local Counsel</h3>
        {isAdmin && !hasAssignedCounsel && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAssignModal(true)}
          >
            + Assign
          </button>
        )}
      </div>

      {hasAssignedCounsel ? (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '16px' }}>
              {caseData.local_counsel_attorney}
            </div>
            <div style={{ color: 'var(--gray-600)' }}>
              {caseData.local_counsel_firm}
            </div>
          </div>

          <div className="detail-grid" style={{ marginBottom: '16px' }}>
            <div className="detail-item">
              <div className="detail-label">Email</div>
              <div className="detail-value">
                <a href={`mailto:${caseData.local_counsel_email}`}>
                  {caseData.local_counsel_email}
                </a>
              </div>
            </div>
            {caseData.local_counsel_phone && (
              <div className="detail-item">
                <div className="detail-label">Phone</div>
                <div className="detail-value">
                  <a href={`tel:${caseData.local_counsel_phone}`}>
                    {caseData.local_counsel_phone}
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="detail-grid" style={{ marginBottom: '16px' }}>
            <div className="detail-item">
              <div className="detail-label">Rating</div>
              <div className="detail-value">
                <span className={`badge ${getRatingBadgeClass(caseData.local_counsel_rating)}`}>
                  {caseData.local_counsel_rating}
                </span>
              </div>
            </div>
            {caseData.local_counsel_engagement_date && (
              <div className="detail-item">
                <div className="detail-label">Engagement Date</div>
                <div className="detail-value">
                  {formatDate(caseData.local_counsel_engagement_date)}
                </div>
              </div>
            )}
          </div>

          {caseData.local_counsel_user_name && (
            <div className="detail-item" style={{ marginBottom: '16px' }}>
              <div className="detail-label">System User Account</div>
              <div className="detail-value">
                {caseData.local_counsel_user_name} ({caseData.local_counsel_user_email})
              </div>
            </div>
          )}

          {caseData.local_counsel_fee_arrangement && (
            <div className="detail-item" style={{ marginBottom: '16px' }}>
              <div className="detail-label">Fee Arrangement</div>
              <div className="detail-value" style={{ whiteSpace: 'pre-line' }}>
                {caseData.local_counsel_fee_arrangement}
              </div>
            </div>
          )}

          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAssignModal(true)}
              >
                Change
              </button>
              <button
                className="btn btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={handleRemove}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px' }}>
          No local counsel assigned
          {caseData?.defendant_state && (
            <span> (Defendant in {caseData.defendant_state})</span>
          )}
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assign Local Counsel</h2>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {caseData?.defendant_state ? (
                <>
                  <div className="form-group">
                    <label>Local Counsel (in {caseData.defendant_state})</label>
                    <select
                      value={formData.local_counsel_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, local_counsel_id: e.target.value }))}
                    >
                      <option value="">Select counsel...</option>
                      {counselOptions.map(counsel => (
                        <option key={counsel.id} value={counsel.id}>
                          {counsel.attorney_name} - {counsel.firm_name}
                          {counsel.hourly_rate && ` (${formatCurrency(counsel.hourly_rate)}/hr)`}
                          {counsel.performance_rating !== 'Not Yet Rated' && ` - ${counsel.performance_rating}`}
                        </option>
                      ))}
                    </select>
                    {counselOptions.length === 0 && (
                      <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
                        No active counsel found for {caseData.defendant_state}.
                        Add contacts in the Local Counsel Directory.
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Engagement Date</label>
                    <input
                      type="date"
                      value={formData.engagement_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, engagement_date: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Fee Arrangement</label>
                    <textarea
                      value={formData.fee_arrangement}
                      onChange={(e) => setFormData(prev => ({ ...prev, fee_arrangement: e.target.value }))}
                      rows={3}
                      placeholder="Describe the fee arrangement for this engagement..."
                    />
                  </div>

                  <div className="form-group">
                    <label>Link User Account (for system access)</label>
                    <select
                      value={formData.user_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, user_id: e.target.value }))}
                    >
                      <option value="">No system access</option>
                      {userOptions.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name} ({user.email})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
                      Select an existing Local Counsel user account to grant them access to this case.
                    </div>
                  </div>
                </>
              ) : (
                <div className="alert alert-warning">
                  Please set the defendant's state/jurisdiction on this case before assigning local counsel.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAssign}
                disabled={loading || !formData.local_counsel_id}
              >
                {loading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
