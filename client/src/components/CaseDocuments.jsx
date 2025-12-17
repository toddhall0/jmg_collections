import { useState, useEffect, useRef } from 'react'
import { formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'

const DOCUMENT_CATEGORIES = [
  'Demand Letters',
  'Responses/Correspondence',
  'Contracts/Underlying Documents',
  'Pleadings',
  'Discovery',
  'Settlement Documents',
  'Court Orders',
  'Other'
]

export default function CaseDocuments({ caseId }) {
  const [documents, setDocuments] = useState([])
  const [grouped, setGrouped] = useState({})
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Other')
  const fileInputRef = useRef(null)

  const { isClient, isAdmin } = useAuth()

  useEffect(() => {
    loadDocuments()
  }, [caseId])

  const loadDocuments = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/documents/case/${caseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setDocuments(data.documents)
        setGrouped(data.grouped)
      }
    } catch (err) {
      console.error('Error loading documents:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    const file = fileInputRef.current?.files[0]

    if (!file) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/documents/case/${caseId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      await loadDocuments()
      setShowUpload(false)
      setCategory('Other')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (docId, fileName) => {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } else {
      alert('Failed to download file')
    }
  }

  const handleDelete = async (docId) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        await loadDocuments()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete document')
      }
    } catch (err) {
      alert('Failed to delete document')
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return '📄'
    if (mimeType?.includes('word')) return '📝'
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '📊'
    if (mimeType?.includes('image')) return '🖼️'
    return '📎'
  }

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <h3>Documents</h3>
        {!isClient && !showUpload && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowUpload(true)}>
            + Upload Document
          </button>
        )}
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} style={{ marginBottom: '20px', padding: '16px', background: 'var(--gray-50)', borderRadius: '4px' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div className="form-group">
            <label>Document Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {DOCUMENT_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>File *</label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
              required
            />
            <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '4px' }}>
              Allowed: PDF, Word, Excel, images (max 10MB)
            </small>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowUpload(false)
                setError('')
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
          No documents uploaded yet
        </div>
      ) : (
        <div>
          {DOCUMENT_CATEGORIES.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat} style={{ marginBottom: '20px' }}>
              <h4 style={{
                fontSize: '14px',
                color: 'var(--gray-600)',
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: '1px solid var(--gray-200)'
              }}>
                {cat} ({grouped[cat].length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {grouped[cat].map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--gray-50)',
                      borderRadius: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <span style={{ fontSize: '20px' }}>{getFileIcon(doc.mime_type)}</span>
                      <div>
                        <div
                          style={{ fontWeight: 500, cursor: 'pointer', color: 'var(--accent)' }}
                          onClick={() => handleDownload(doc.id, doc.original_name)}
                        >
                          {doc.original_name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                          {formatFileSize(doc.file_size)} &middot;
                          Uploaded by {doc.uploaded_by_name} &middot;
                          {formatDateTime(doc.uploaded_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={() => handleDownload(doc.id, doc.original_name)}
                      >
                        Download
                      </button>
                      {isAdmin && (
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => handleDelete(doc.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
