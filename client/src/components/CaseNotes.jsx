import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDateTime } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function CaseNotes({ caseId }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { isClient } = useAuth()

  useEffect(() => {
    loadNotes()
  }, [caseId])

  const loadNotes = async () => {
    try {
      const data = await api.get(`/notes/case/${caseId}`)
      setNotes(data.notes)
    } catch (err) {
      console.error('Error loading notes:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!content.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const data = await api.post(`/notes/case/${caseId}`, { content: content.trim() })
      setNotes([data.note, ...notes])
      setContent('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: '16px' }}>Case Notes</h3>

      {!isClient && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              style={{ width: '100%' }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={submitting || !content.trim()}
          >
            {submitting ? 'Adding...' : 'Add Note'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="loading">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
          No notes yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notes.map((note) => (
            <div
              key={note.id}
              style={{
                padding: '12px',
                background: 'var(--gray-50)',
                borderRadius: '4px',
                borderLeft: '3px solid var(--accent)'
              }}
            >
              <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                {note.content}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                <strong>{note.author_name}</strong> &middot; {formatDateTime(note.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
