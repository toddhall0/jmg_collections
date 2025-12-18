import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'

const REPORT_TYPES = [
  { id: 'case-aging', name: 'Case Aging Report', description: 'All open cases with days since opened' },
  { id: 'recovery', name: 'Recovery Report', description: 'Closed cases with recovery metrics' },
  { id: 'by-stage', name: 'Cases by Stage', description: 'Summary by current stage' },
  { id: 'by-jurisdiction', name: 'Cases by Jurisdiction', description: 'Summary by defendant state' }
]

export default function Reports() {
  const [activeReport, setActiveReport] = useState('case-aging')
  const [reportData, setReportData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    loadReport()
  }, [activeReport])

  const loadReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const url = `/reports/${activeReport}${params.toString() ? '?' + params.toString() : ''}`
      const data = await api.get(url)
      setReportData(data.report)
      setSummary(data.summary || null)
    } catch (error) {
      console.error('Error loading report:', error)
      setReportData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    loadReport()
  }

  const clearFilters = () => {
    setFilters({ start_date: '', end_date: '' })
    setTimeout(loadReport, 0)
  }

  const exportToCSV = () => {
    if (!reportData || reportData.length === 0) return

    // Get headers from first row
    const headers = Object.keys(reportData[0])

    // Create CSV content
    const csvRows = [
      headers.join(','),
      ...reportData.map(row =>
        headers.map(header => {
          let value = row[header]
          // Handle values that might contain commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            value = `"${value.replace(/"/g, '""')}"`
          }
          return value ?? ''
        }).join(',')
      )
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${activeReport}-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const renderReport = () => {
    if (loading) {
      return <div className="loading">Loading report...</div>
    }

    if (!reportData || reportData.length === 0) {
      return (
        <div className="empty-state">
          <h3>No data found</h3>
          <p>Try adjusting your date filters.</p>
        </div>
      )
    }

    switch (activeReport) {
      case 'case-aging':
        return <CaseAgingReport data={reportData} />
      case 'recovery':
        return <RecoveryReport data={reportData} summary={summary} />
      case 'by-stage':
        return <StageReport data={reportData} summary={summary} />
      case 'by-jurisdiction':
        return <JurisdictionReport data={reportData} />
      default:
        return null
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
        <button
          className="btn btn-primary"
          onClick={exportToCSV}
          disabled={!reportData || reportData.length === 0}
        >
          Export CSV
        </button>
      </div>

      {/* Report Type Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {REPORT_TYPES.map(report => (
          <button
            key={report.id}
            className={`btn ${activeReport === report.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveReport(report.id)}
          >
            {report.name}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>
            Apply Filters
          </button>
          <button className="btn btn-secondary" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      {/* Report Description */}
      <p style={{ color: 'var(--gray-600)', marginBottom: '16px' }}>
        {REPORT_TYPES.find(r => r.id === activeReport)?.description}
      </p>

      {/* Report Content */}
      <div className="card">
        {renderReport()}
      </div>
    </div>
  )
}

function CaseAgingReport({ data }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Case Number</th>
            <th>Defendant</th>
            <th>State</th>
            <th>Date Opened</th>
            <th>Days Open</th>
            <th>Stage</th>
            <th>Amount Claimed</th>
            <th>Assigned Counsel</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td>{row.case_number}</td>
              <td>{row.defendant_name}</td>
              <td>{row.defendant_state || '-'}</td>
              <td>{formatDate(row.date_opened)}</td>
              <td style={{ fontWeight: 600, color: row.days_open > 90 ? 'var(--danger)' : 'inherit' }}>
                {Math.round(row.days_open)}
              </td>
              <td><span className="badge badge-stage">{row.current_stage}</span></td>
              <td>{formatCurrency(row.amount_claimed)}</td>
              <td>{row.assigned_counsel || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecoveryReport({ data, summary }) {
  return (
    <div>
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--gray-50)',
          borderRadius: '8px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Cases</div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{summary.total_cases}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Claimed</div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{formatCurrency(summary.total_claimed)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Recovered</div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--success)' }}>
              {formatCurrency(summary.total_recovered)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Recovery Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{summary.recovery_rate}%</div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Case Number</th>
              <th>Defendant</th>
              <th>Status</th>
              <th>Date Closed</th>
              <th>Days to Resolve</th>
              <th>Amount Claimed</th>
              <th>Amount Recovered</th>
              <th>Recovery %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.case_number}</td>
                <td>{row.defendant_name}</td>
                <td><span className="badge badge-settled">{row.resolution_status}</span></td>
                <td>{formatDate(row.date_closed)}</td>
                <td>{Math.round(row.days_to_resolution)}</td>
                <td>{formatCurrency(row.amount_claimed)}</td>
                <td style={{ color: 'var(--success)' }}>{formatCurrency(row.amount_recovered)}</td>
                <td style={{ fontWeight: 600 }}>{row.recovery_percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StageReport({ data, summary }) {
  return (
    <div>
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--gray-50)',
          borderRadius: '8px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Cases</div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{summary.total_cases}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Claimed</div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{formatCurrency(summary.total_claimed)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Total Recovered</div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--success)' }}>
              {formatCurrency(summary.total_recovered)}
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Case Count</th>
              <th>Total Claimed</th>
              <th>Total Recovered</th>
              <th>Avg. Claimed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td><span className="badge badge-stage">{row.stage}</span></td>
                <td style={{ fontWeight: 600 }}>{row.case_count}</td>
                <td>{formatCurrency(row.total_claimed)}</td>
                <td style={{ color: 'var(--success)' }}>{formatCurrency(row.total_recovered)}</td>
                <td>{formatCurrency(row.avg_amount_claimed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JurisdictionReport({ data }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Total Cases</th>
            <th>Open Cases</th>
            <th>Closed Cases</th>
            <th>Total Claimed</th>
            <th>Total Recovered</th>
            <th>Recovery %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td style={{ fontWeight: 600 }}>{row.state}</td>
              <td>{row.case_count}</td>
              <td>{row.open_cases}</td>
              <td>{row.closed_cases}</td>
              <td>{formatCurrency(row.total_claimed)}</td>
              <td style={{ color: 'var(--success)' }}>{formatCurrency(row.total_recovered)}</td>
              <td style={{ fontWeight: 600 }}>{row.recovery_percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
