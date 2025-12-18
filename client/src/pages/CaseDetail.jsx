import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import CaseNotes from '../components/CaseNotes'
import CommunicationLog from '../components/CommunicationLog'
import CaseDocuments from '../components/CaseDocuments'
import CaseTasks from '../components/CaseTasks'
import LocalCounselAssignment from '../components/LocalCounselAssignment'
import AssignedCounsel from '../components/AssignedCounsel'
import ShareLink from '../components/ShareLink'
import GenerateDocument from '../components/GenerateDocument'

export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caseData, setCaseData] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [localCounselList, setLocalCounselList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedCounsel, setSelectedCounsel] = useState('')
  const [options, setOptions] = useState({ stages: [], resolution_statuses: [] })
  const [updating, setUpdating] = useState(false)

  const { isAdmin, isClient, isLocalCounsel } = useAuth()

  useEffect(() => {
    loadCase()
    loadOptions()
    if (isAdmin) {
      loadLocalCounsel()
    }
  }, [id])

  const loadCase = async () => {
    try {
      const data = await api.get(`/cases/${id}`)
      setCaseData(data.case)
      setAssignments(data.assignments || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadOptions = async () => {
    try {
      const data = await api.get('/cases/options')
      setOptions(data)
    } catch (error) {
      console.error('Error loading options:', error)
    }
  }

  const loadLocalCounsel = async () => {
    try {
      const data = await api.get('/users/local-counsel')
      setLocalCounselList(data.users)
    } catch (error) {
      console.error('Error loading local counsel:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this case? This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`/cases/${id}`)
      navigate('/cases')
    } catch (err) {
      alert('Failed to delete case: ' + err.message)
    }
  }

  const handleAssign = async () => {
    if (!selectedCounsel) return

    try {
      await api.post(`/cases/${id}/assign`, { user_id: parseInt(selectedCounsel) })
      setShowAssignModal(false)
      setSelectedCounsel('')
      loadCase()
    } catch (err) {
      alert('Failed to assign counsel: ' + err.message)
    }
  }

  const handleRemoveAssignment = async (userId) => {
    if (!confirm('Remove this counsel from the case?')) return

    try {
      await api.delete(`/cases/${id}/assign/${userId}`)
      loadCase()
    } catch (err) {
      alert('Failed to remove assignment: ' + err.message)
    }
  }

  const handleStageUpdate = async (newStage) => {
    setUpdating(true)
    try {
      await api.put(`/cases/${id}`, { current_stage: newStage })
      setCaseData(prev => ({ ...prev, current_stage: newStage }))
    } catch (err) {
      alert('Failed to update stage: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusUpdate = async (newStatus) => {
    setUpdating(true)
    try {
      const updates = { resolution_status: newStatus }
      if (newStatus !== 'Open' && !caseData.date_closed) {
        updates.date_closed = new Date().toISOString().split('T')[0]
      }
      await api.put(`/cases/${id}`, updates)
      setCaseData(prev => ({ ...prev, ...updates }))
    } catch (err) {
      alert('Failed to update status: ' + err.message)
    } finally {
      setUpdating(false)
    }
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

  if (loading) {
    return <div className="loading">Loading case...</div>
  }

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-error">{error}</div>
        <Link to="/cases" className="btn btn-secondary">Back to Cases</Link>
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="card">
        <div className="empty-state">
          <h3>Case not found</h3>
          <Link to="/cases" className="btn btn-secondary">Back to Cases</Link>
        </div>
      </div>
    )
  }

  const availableCounsel = localCounselList.filter(
    counsel => !assignments.find(a => a.id === counsel.id)
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{caseData.case_name}</h1>
          <div className="case-number">{caseData.case_number}</div>
        </div>
        <div className="actions">
          <Link to="/cases" className="btn btn-secondary">Back to Cases</Link>
          {isAdmin && (
            <>
              <Link to={`/cases/${id}/edit`} className="btn btn-primary">Edit Case</Link>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div>
          <div className="card">
            <div className="detail-section">
              <h3>Case Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Case Number</div>
                  <div className="detail-value">{caseData.case_number}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Case Name</div>
                  <div className="detail-value">{caseData.case_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Client Matter Reference</div>
                  <div className="detail-value">{caseData.client_matter_reference || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Category</div>
                  <div className="detail-value">
                    {caseData.category_name ? (
                      <span className="badge badge-secondary" style={{ fontSize: '12px' }}>
                        {caseData.category_code} - {caseData.category_name}
                      </span>
                    ) : '-'}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Date Opened</div>
                  <div className="detail-value">{formatDate(caseData.date_opened)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Created By</div>
                  <div className="detail-value">{caseData.created_by_name || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Last Updated</div>
                  <div className="detail-value">{formatDateTime(caseData.updated_at)}</div>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>Defendant Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Defendant Name</div>
                  <div className="detail-value">{caseData.defendant_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Entity Type</div>
                  <div className="detail-value">{caseData.defendant_entity_type}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Contact Name</div>
                  <div className="detail-value">{caseData.defendant_contact_name || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Email</div>
                  <div className="detail-value">
                    {caseData.defendant_email ? (
                      <a href={`mailto:${caseData.defendant_email}`}>{caseData.defendant_email}</a>
                    ) : '-'}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Phone</div>
                  <div className="detail-value">
                    {caseData.defendant_phone ? (
                      <a href={`tel:${caseData.defendant_phone}`}>{caseData.defendant_phone}</a>
                    ) : '-'}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">State/Jurisdiction</div>
                  <div className="detail-value">{caseData.defendant_state || '-'}</div>
                </div>
              </div>
              {caseData.defendant_mailing_address && (
                <div className="detail-item" style={{ marginTop: '12px' }}>
                  <div className="detail-label">Mailing Address</div>
                  <div className="detail-value" style={{ whiteSpace: 'pre-line' }}>
                    {caseData.defendant_mailing_address}
                  </div>
                </div>
              )}
            </div>

            {(caseData.defendant_attorney_name || caseData.defendant_attorney_firm || caseData.defendant_attorney_email || caseData.defendant_attorney_phone) && (
              <div className="detail-section">
                <h3>Defendant's Attorney</h3>
                <div className="detail-grid">
                  {caseData.defendant_attorney_name && (
                    <div className="detail-item">
                      <div className="detail-label">Attorney Name</div>
                      <div className="detail-value">{caseData.defendant_attorney_name}</div>
                    </div>
                  )}
                  {caseData.defendant_attorney_firm && (
                    <div className="detail-item">
                      <div className="detail-label">Law Firm</div>
                      <div className="detail-value">{caseData.defendant_attorney_firm}</div>
                    </div>
                  )}
                  {caseData.defendant_attorney_email && (
                    <div className="detail-item">
                      <div className="detail-label">Email</div>
                      <div className="detail-value">
                        <a href={`mailto:${caseData.defendant_attorney_email}`}>{caseData.defendant_attorney_email}</a>
                      </div>
                    </div>
                  )}
                  {caseData.defendant_attorney_phone && (
                    <div className="detail-item">
                      <div className="detail-label">Phone</div>
                      <div className="detail-value">
                        <a href={`tel:${caseData.defendant_attorney_phone}`}>{caseData.defendant_attorney_phone}</a>
                      </div>
                    </div>
                  )}
                </div>
                {caseData.defendant_attorney_address && (
                  <div className="detail-item" style={{ marginTop: '12px' }}>
                    <div className="detail-label">Address</div>
                    <div className="detail-value" style={{ whiteSpace: 'pre-line' }}>
                      {caseData.defendant_attorney_address}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="detail-section">
              <h3>Claim Details</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Date Claim Arose</div>
                  <div className="detail-value">{formatDate(caseData.date_claim_arose)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Statute of Limitations</div>
                  <div className="detail-value">{formatDate(caseData.statute_of_limitations_date)}</div>
                </div>
              </div>
              {caseData.claim_description && (
                <div className="detail-item" style={{ marginTop: '12px' }}>
                  <div className="detail-label">Claim Description</div>
                  <div className="detail-value" style={{ whiteSpace: 'pre-line' }}>
                    {caseData.claim_description}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>Financial Summary</h3>
            <div className="detail-item" style={{ marginBottom: '12px' }}>
              <div className="detail-label">Amount Claimed</div>
              <div className="detail-value large" style={{ color: 'var(--danger)' }}>
                {formatCurrency(caseData.amount_claimed)}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Amount Recovered</div>
              <div className="detail-value large" style={{ color: 'var(--success)' }}>
                {formatCurrency(caseData.amount_recovered)}
              </div>
            </div>
            {caseData.amount_claimed > 0 && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--gray-500)' }}>
                Recovery Rate: {((caseData.amount_recovered / caseData.amount_claimed) * 100).toFixed(1)}%
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>Case Status</h3>

            <div className="detail-item" style={{ marginBottom: '16px' }}>
              <div className="detail-label">Current Stage</div>
              {(isAdmin || isLocalCounsel) && !isClient ? (
                <select
                  value={caseData.current_stage}
                  onChange={(e) => handleStageUpdate(e.target.value)}
                  disabled={updating}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  {options.stages.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              ) : (
                <div className="detail-value">
                  <span className="badge badge-stage">{caseData.current_stage}</span>
                </div>
              )}
            </div>

            <div className="detail-item" style={{ marginBottom: '16px' }}>
              <div className="detail-label">Resolution Status</div>
              {(isAdmin || isLocalCounsel) && !isClient ? (
                <select
                  value={caseData.resolution_status}
                  onChange={(e) => handleStatusUpdate(e.target.value)}
                  disabled={updating}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  {options.resolution_statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              ) : (
                <div className="detail-value">
                  <span className={`badge ${getStatusBadgeClass(caseData.resolution_status)}`}>
                    {caseData.resolution_status}
                  </span>
                </div>
              )}
            </div>

            {caseData.date_closed && (
              <div className="detail-item">
                <div className="detail-label">Date Closed</div>
                <div className="detail-value">{formatDate(caseData.date_closed)}</div>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>Deadline Tracking</h3>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 500, marginBottom: '8px', color: 'var(--gray-700)' }}>Initial Notice</div>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Sent Date</div>
                  <div className="detail-value">{formatDate(caseData.initial_notice_sent_date) || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Response Deadline</div>
                  <div className="detail-value">{formatDate(caseData.initial_notice_response_deadline) || '-'}</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 500, marginBottom: '8px', color: 'var(--gray-700)' }}>Second Notice</div>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Sent Date</div>
                  <div className="detail-value">{formatDate(caseData.second_notice_sent_date) || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Response Deadline</div>
                  <div className="detail-value">{formatDate(caseData.second_notice_response_deadline) || '-'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Generate Documents */}
          <GenerateDocument caseId={id} caseData={caseData} onGenerated={loadCase} />

          {/* Assigned Counsel (Internal) */}
          <AssignedCounsel caseId={id} caseData={caseData} onUpdate={loadCase} />

          {/* Local Counsel Assignment (External) */}
          <LocalCounselAssignment caseId={id} caseData={caseData} onUpdate={loadCase} />

          {/* Share Link */}
          <ShareLink caseId={id} />
        </div>
      </div>

      {/* Tasks section */}
      <div style={{ marginTop: '24px' }}>
        <CaseTasks caseId={id} />
      </div>

      {/* Notes, Communications, and Documents sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
        <CaseNotes caseId={id} />
        <CommunicationLog caseId={id} />
      </div>

      <div style={{ marginTop: '24px' }}>
        <CaseDocuments caseId={id} />
      </div>

    </div>
  )
}
