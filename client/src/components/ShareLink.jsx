import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function ShareLink({ caseId }) {
  const { isAdmin } = useAuth()
  const [shareLink, setShareLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      loadShareLink()
    } else {
      setLoading(false)
    }
  }, [caseId, isAdmin])

  const loadShareLink = async () => {
    try {
      const data = await api.get(`/share-links/case/${caseId}`)
      setShareLink(data.shareLink)
    } catch (err) {
      console.error('Error loading share link:', err)
    } finally {
      setLoading(false)
    }
  }

  const createShareLink = async () => {
    setCreating(true)
    try {
      const data = await api.post(`/share-links/case/${caseId}`)
      setShareLink(data.shareLink)
    } catch (err) {
      alert('Error creating share link: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  const revokeShareLink = async () => {
    if (!confirm('Revoke this share link? Anyone with the link will no longer be able to view this case.')) {
      return
    }

    try {
      await api.delete(`/share-links/${shareLink.id}`)
      setShareLink(null)
    } catch (err) {
      alert('Error revoking share link: ' + err.message)
    }
  }

  const copyToClipboard = () => {
    const fullUrl = `${window.location.origin}/shared/case/${shareLink.share_token}`
    navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isAdmin) {
    return null
  }

  if (loading) {
    return null
  }

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Client View Link</h3>
      </div>

      {shareLink ? (
        <div>
          <div style={{
            padding: '12px',
            background: 'var(--gray-50)',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
            wordBreak: 'break-all',
            fontFamily: 'monospace'
          }}>
            {window.location.origin}/shared/case/{shareLink.share_token}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="btn btn-primary btn-sm" onClick={copyToClipboard}>
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={revokeShareLink}
            >
              Revoke
            </button>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            <div>Expires: {formatDate(shareLink.expires_at)}</div>
            <div>Views: {shareLink.view_count}</div>
            {shareLink.last_viewed_at && (
              <div>Last viewed: {formatDate(shareLink.last_viewed_at)}</div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginBottom: '12px' }}>
            Generate a read-only link to share case status with the client.
            Link expires after 30 days.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={createShareLink}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Generate Link'}
          </button>
        </div>
      )}
    </div>
  )
}
