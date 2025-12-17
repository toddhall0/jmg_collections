import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function CaseList() {
  const [cases, setCases] = useState([])
  const [options, setOptions] = useState({ stages: [], resolution_statuses: [] })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    stage: '',
    resolution_status: '',
    search: ''
  })
  const [sort, setSort] = useState({
    field: 'date_opened',
    order: 'desc'
  })

  const { isAdmin, isLocalCounsel } = useAuth()

  useEffect(() => {
    loadOptions()
  }, [])

  useEffect(() => {
    loadCases()
  }, [filters, sort])

  const loadOptions = async () => {
    try {
      const data = await api.get('/cases/options')
      setOptions(data)
    } catch (error) {
      console.error('Error loading options:', error)
    }
  }

  const loadCases = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.stage) params.set('stage', filters.stage)
      if (filters.resolution_status) params.set('resolution_status', filters.resolution_status)
      if (filters.search) params.set('search', filters.search)
      params.set('sort_by', sort.field)
      params.set('sort_order', sort.order)

      const data = await api.get(`/cases?${params.toString()}`)
      setCases(data.cases)
    } catch (error) {
      console.error('Error loading cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field) => {
    setSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (field) => {
    if (sort.field !== field) return ''
    return sort.order === 'asc' ? ' ↑' : ' ↓'
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

  return (
    <div>
      <div className="page-header">
        <h1>{isLocalCounsel ? 'My Assigned Cases' : 'All Cases'}</h1>
        {isAdmin && (
          <Link to="/cases/new" className="btn btn-primary">
            + New Case
          </Link>
        )}
      </div>

      <div className="card">
        <div className="filters">
          <input
            type="text"
            placeholder="Search cases..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            style={{ minWidth: '200px' }}
          />

          <select
            value={filters.stage}
            onChange={(e) => setFilters(prev => ({ ...prev, stage: e.target.value }))}
          >
            <option value="">All Stages</option>
            {options.stages.map(stage => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>

          <select
            value={filters.resolution_status}
            onChange={(e) => setFilters(prev => ({ ...prev, resolution_status: e.target.value }))}
          >
            <option value="">All Statuses</option>
            {options.resolution_statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          {(filters.stage || filters.resolution_status || filters.search) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFilters({ stage: '', resolution_status: '', search: '' })}
            >
              Clear Filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <h3>No cases found</h3>
            <p>
              {filters.stage || filters.resolution_status || filters.search
                ? 'Try adjusting your filters.'
                : isLocalCounsel
                  ? 'You have no cases assigned to you yet.'
                  : 'Get started by creating your first case.'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th
                    className={`sortable ${sort.field === 'case_number' ? 'sorted' : ''}`}
                    onClick={() => handleSort('case_number')}
                  >
                    Case Number<span className="sort-icon">{getSortIcon('case_number')}</span>
                  </th>
                  <th
                    className={`sortable ${sort.field === 'defendant_name' ? 'sorted' : ''}`}
                    onClick={() => handleSort('defendant_name')}
                  >
                    Defendant<span className="sort-icon">{getSortIcon('defendant_name')}</span>
                  </th>
                  <th
                    className={`sortable ${sort.field === 'amount_claimed' ? 'sorted' : ''}`}
                    onClick={() => handleSort('amount_claimed')}
                  >
                    Amount Claimed<span className="sort-icon">{getSortIcon('amount_claimed')}</span>
                  </th>
                  <th
                    className={`sortable ${sort.field === 'current_stage' ? 'sorted' : ''}`}
                    onClick={() => handleSort('current_stage')}
                  >
                    Stage<span className="sort-icon">{getSortIcon('current_stage')}</span>
                  </th>
                  <th>Status</th>
                  <th
                    className={`sortable ${sort.field === 'date_opened' ? 'sorted' : ''}`}
                    onClick={() => handleSort('date_opened')}
                  >
                    Date Opened<span className="sort-icon">{getSortIcon('date_opened')}</span>
                  </th>
                  {!isLocalCounsel && <th>Assigned Counsel</th>}
                </tr>
              </thead>
              <tbody>
                {cases.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td>
                      <Link to={`/cases/${caseItem.id}`} className="table-link">
                        {caseItem.case_number}
                      </Link>
                    </td>
                    <td>
                      <div>{caseItem.defendant_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        {caseItem.defendant_entity_type}
                      </div>
                    </td>
                    <td>{formatCurrency(caseItem.amount_claimed)}</td>
                    <td>
                      <span className="badge badge-stage">{caseItem.current_stage}</span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(caseItem.resolution_status)}`}>
                        {caseItem.resolution_status}
                      </span>
                    </td>
                    <td>{formatDate(caseItem.date_opened)}</td>
                    {!isLocalCounsel && (
                      <td>
                        <span style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                          {caseItem.assigned_counsel || '-'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--gray-500)' }}>
          Showing {cases.length} case{cases.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
