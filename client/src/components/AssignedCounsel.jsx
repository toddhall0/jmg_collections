import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

export default function AssignedCounsel({ caseId, caseData, onUpdate }) {
  const { isAdmin } = useAuth()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [counselOptions, setCounselOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  useEffect(() => {
    if (showAssignModal) {
      loadInternalCounsel()
    }
  }, [showAssignModal])

  const loadInternalCounsel = async () => {
    try {
      const data = await api.get('/users/internal-counsel')
      setCounselOptions(data.users)
      // Pre-select current assigned counsel if any
      if (caseData?.assigned_counsel_id) {
        setSelectedUserId(caseData.assigned_counsel_id.toString())
      }
    } catch (err) {
      console.error('Error loading internal counsel:', err)
    }
  }

  const handleAssign = async () => {
    if (!selectedUserId) {
      alert('Please select an attorney')
      return
    }

    setLoading(true)
    try {
      await api.post(`/cases/${caseId}/assigned-counsel`, {
        user_id: parseInt(selectedUserId)
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
    if (!confirm('Remove assigned counsel from this case?')) return

    try {
      await api.delete(`/cases/${caseId}/assigned-counsel`)
      onUpdate()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const hasAssignedCounsel = caseData?.assigned_counsel_id

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Assigned Counsel</h3>
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
              {caseData.assigned_counsel_name}
            </div>
            <div style={{ color: 'var(--gray-600)' }}>
              <a href={`mailto:${caseData.assigned_counsel_email}`}>
                {caseData.assigned_counsel_email}
              </a>
            </div>
          </div>

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
          No assigned counsel
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{hasAssignedCounsel ? 'Change' : 'Assign'} Counsel</h2>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Internal Counsel / Attorney</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select attorney...</option>
                  {counselOptions.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </select>
                {counselOptions.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
                    No internal counsel users found.
                    Create users with the "Internal Counsel" role in User Management.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAssign}
                disabled={loading || !selectedUserId}
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
