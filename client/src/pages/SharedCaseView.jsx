import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { formatCurrency, formatDate } from '../utils/format'

export default function SharedCaseView() {
  const { token } = useParams()
  const [caseData, setCaseData] = useState(null)
  const [communications, setCommunications] = useState([])
  const [expiresAt, setExpiresAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSharedCase()
  }, [token])

  const loadSharedCase = async () => {
    try {
      const response = await fetch(`/api/share-links/view/${token}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load case')
      }

      setCaseData(data.case)
      setCommunications(data.communications || [])
      setExpiresAt(data.expires_at)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'Open': '#3b82f6',
      'Settled': '#22c55e',
      'Judgment Obtained': '#8b5cf6',
      'Dismissed': '#ef4444',
      'Abandoned': '#6b7280'
    }
    return colors[status] || '#6b7280'
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gray-50)'
      }}>
        <div>Loading case information...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gray-50)'
      }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Access Denied</h2>
          <p style={{ color: 'var(--gray-600)' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-50)',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'var(--primary)',
          color: 'white',
          padding: '24px',
          borderRadius: '8px 8px 0 0'
        }}>
          <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
            CASE STATUS UPDATE
          </div>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>{caseData.case_name}</h1>
          <div style={{ opacity: 0.9 }}>Case Number: {caseData.case_number}</div>
        </div>

        {/* Main Content */}
        <div className="card" style={{ borderRadius: '0 0 8px 8px', marginTop: 0 }}>
          {/* Status Banner */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px',
            background: 'var(--gray-50)',
            borderRadius: '4px',
            marginBottom: '24px'
          }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '4px' }}>
                Current Stage
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600 }}>
                {caseData.current_stage}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '4px' }}>
                Status
              </div>
              <span style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '4px',
                background: getStatusColor(caseData.resolution_status),
                color: 'white',
                fontWeight: 500
              }}>
                {caseData.resolution_status}
              </span>
            </div>
          </div>

          {/* Case Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                Defendant
              </h3>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>{caseData.defendant_name}</div>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                Date Opened
              </h3>
              <div style={{ fontSize: '16px' }}>{formatDate(caseData.date_opened)}</div>
            </div>
          </div>

          {/* Financial Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            padding: '20px',
            background: 'var(--gray-50)',
            borderRadius: '4px',
            marginBottom: '24px'
          }}>
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                Amount Claimed
              </h3>
              <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--danger)' }}>
                {formatCurrency(caseData.amount_claimed)}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                Amount Recovered
              </h3>
              <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--success)' }}>
                {formatCurrency(caseData.amount_recovered)}
              </div>
            </div>
          </div>

          {/* Local Counsel */}
          {(caseData.local_counsel_firm || caseData.local_counsel_attorney) && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                Local Counsel
              </h3>
              <div style={{ fontSize: '16px' }}>
                {caseData.local_counsel_attorney}
                {caseData.local_counsel_firm && (
                  <span style={{ color: 'var(--gray-600)' }}> - {caseData.local_counsel_firm}</span>
                )}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {communications.length > 0 && (
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Recent Activity</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {communications.map((comm, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '12px',
                      background: 'var(--gray-50)',
                      borderRadius: '4px',
                      borderLeft: '3px solid var(--primary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500 }}>{comm.type}</span>
                      <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                        {formatDate(comm.communication_date)}
                      </span>
                    </div>
                    {comm.summary && (
                      <div style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                        {comm.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          fontSize: '13px',
          color: 'var(--gray-500)'
        }}>
          This is a read-only view. Link expires on {formatDate(expiresAt)}.
        </div>
      </div>
    </div>
  )
}
