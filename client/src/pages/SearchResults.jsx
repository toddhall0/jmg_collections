import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'all'

  const [results, setResults] = useState({ cases: [], notes: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    if (query.length >= 2) {
      performSearch()
    } else {
      setLoading(false)
    }
  }, [query, type])

  const performSearch = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(query)}&type=${type}`)
      setResults(data)
    } catch (error) {
      console.error('Search error:', error)
      setResults({ cases: [], notes: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }

  const handleCaseClick = (caseId) => {
    navigate(`/cases/${caseId}`)
  }

  if (query.length < 2) {
    return (
      <div className="card">
        <div className="empty-state">
          <h3>Search</h3>
          <p>Enter at least 2 characters to search</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Search Results</h1>
        <span style={{ color: 'var(--gray-500)' }}>
          {loading ? 'Searching...' : `${results.total} results for "${query}"`}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('all')}
        >
          All ({results.cases.length + results.notes.length})
        </button>
        <button
          className={`btn ${activeTab === 'cases' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('cases')}
        >
          Cases ({results.cases.length})
        </button>
        <button
          className={`btn ${activeTab === 'notes' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes ({results.notes.length})
        </button>
      </div>

      {loading ? (
        <div className="loading">Searching...</div>
      ) : results.total === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No results found</h3>
            <p>Try different search terms or check your spelling.</p>
          </div>
        </div>
      ) : (
        <div>
          {/* Cases Results */}
          {(activeTab === 'all' || activeTab === 'cases') && results.cases.length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                  <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z"/>
                </svg>
                Cases ({results.cases.length})
              </h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Case Number</th>
                      <th>Defendant</th>
                      <th>Category</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Opened</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.cases.map(caseResult => (
                      <tr
                        key={caseResult.id}
                        onClick={() => handleCaseClick(caseResult.id)}
                        style={{ cursor: 'pointer' }}
                        className="clickable-row"
                      >
                        <td style={{ fontWeight: 600 }}>
                          <HighlightedText text={caseResult.case_number} highlight={query} />
                        </td>
                        <td>
                          <HighlightedText text={caseResult.defendant_name} highlight={query} />
                          {caseResult.case_name && (
                            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                              <HighlightedText text={caseResult.case_name} highlight={query} />
                            </div>
                          )}
                        </td>
                        <td>
                          {caseResult.category_code ? (
                            <span className="badge badge-secondary">
                              <HighlightedText text={caseResult.category_code} highlight={query} />
                            </span>
                          ) : '-'}
                        </td>
                        <td>
                          <span className="badge badge-stage">{caseResult.current_stage}</span>
                        </td>
                        <td>
                          <span className={`badge ${caseResult.resolution_status === 'Open' ? 'badge-open' : 'badge-settled'}`}>
                            {caseResult.resolution_status}
                          </span>
                        </td>
                        <td>{formatCurrency(caseResult.amount_claimed)}</td>
                        <td>{formatDate(caseResult.date_opened)}</td>
                        <td style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                          {caseResult.match_type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes Results */}
          {(activeTab === 'all' || activeTab === 'notes') && results.notes.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: '16px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h8v2H8v-2zm0-3h8v2H8v-2z"/>
                </svg>
                Notes ({results.notes.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.notes.map(note => (
                  <div
                    key={note.id}
                    className="search-note-result"
                    onClick={() => handleCaseClick(note.case_id)}
                    style={{
                      padding: '16px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{note.case_number}</span>
                        <span style={{ color: 'var(--gray-500)', marginLeft: '8px' }}>{note.defendant_name}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                        {formatDate(note.created_at)} by {note.created_by_name}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--gray-600)', lineHeight: 1.5 }}>
                      <HighlightedText text={note.content_preview} highlight={query} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Component to highlight search matches in text
function HighlightedText({ text, highlight }) {
  if (!text || !highlight) return text || ''

  const parts = text.split(new RegExp(`(${escapeRegex(highlight)})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={index} style={{
            backgroundColor: 'var(--warning)',
            padding: '0 2px',
            borderRadius: '2px'
          }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

// Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
