import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function Pipeline() {
  const [pipeline, setPipeline] = useState({})
  const [stages, setStages] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [draggingCase, setDraggingCase] = useState(null)
  const [updating, setUpdating] = useState(false)

  const { isAdmin } = useAuth()

  useEffect(() => {
    loadPipeline()
    loadCategories()
  }, [])

  const loadPipeline = async () => {
    try {
      const data = await api.get('/cases/pipeline')
      setPipeline(data.pipeline)
      setStages(data.stages)
    } catch (error) {
      console.error('Error loading pipeline:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const data = await api.get('/categories')
      setCategories(data.categories)
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  // Filter pipeline data by category
  const getFilteredPipeline = () => {
    if (!selectedCategory) return pipeline

    const filtered = {}
    for (const stage of stages) {
      const stageData = pipeline[stage] || { cases: [], count: 0, total_amount: 0 }
      const filteredCases = stageData.cases.filter(
        c => c.category_id && c.category_id.toString() === selectedCategory
      )
      filtered[stage] = {
        cases: filteredCases,
        count: filteredCases.length,
        total_amount: filteredCases.reduce((sum, c) => sum + (c.amount_claimed || 0), 0)
      }
    }
    return filtered
  }

  const filteredPipeline = getFilteredPipeline()

  const calculateDaysInStage = (stageChangedAt) => {
    if (!stageChangedAt) return 0
    const changed = new Date(stageChangedAt)
    const now = new Date()
    const diffTime = Math.abs(now - changed)
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const handleDragStart = (e, caseItem) => {
    if (!isAdmin) return
    setDraggingCase(caseItem)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    if (!isAdmin) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, targetStage) => {
    e.preventDefault()
    if (!isAdmin || !draggingCase || draggingCase.current_stage === targetStage) {
      setDraggingCase(null)
      return
    }

    setUpdating(true)
    try {
      await api.put(`/cases/${draggingCase.id}`, { current_stage: targetStage })
      await loadPipeline()
    } catch (error) {
      console.error('Error updating stage:', error)
      alert('Failed to update stage: ' + error.message)
    } finally {
      setUpdating(false)
      setDraggingCase(null)
    }
  }

  const handleDragEnd = () => {
    setDraggingCase(null)
  }

  if (loading) {
    return <div className="loading">Loading pipeline...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1>Case Pipeline</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ minWidth: '180px' }}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name} ({cat.code})</option>
            ))}
          </select>
          {selectedCategory && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedCategory('')}
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {updating && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '20px 40px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}>
          Updating...
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: '16px',
        overflowX: 'auto',
        paddingBottom: '20px'
      }}>
        {stages.map((stage) => {
          const stageData = filteredPipeline[stage] || { cases: [], count: 0, total_amount: 0 }

          return (
            <div
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              style={{
                minWidth: '280px',
                maxWidth: '280px',
                background: 'var(--gray-100)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 180px)'
              }}
            >
              {/* Column Header */}
              <div style={{
                marginBottom: '12px',
                padding: '8px',
                background: 'var(--primary)',
                color: 'white',
                borderRadius: '4px'
              }}>
                <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>
                  {stage}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {stageData.count} case{stageData.count !== 1 ? 's' : ''} &middot; {formatCurrency(stageData.total_amount)}
                </div>
              </div>

              {/* Cases */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {stageData.cases.length === 0 ? (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--gray-400)',
                    fontSize: '13px'
                  }}>
                    No cases
                  </div>
                ) : (
                  stageData.cases.map((caseItem) => {
                    const daysInStage = calculateDaysInStage(caseItem.stage_changed_at)
                    const hasOverdueTasks = caseItem.overdue_tasks > 0

                    return (
                      <div
                        key={caseItem.id}
                        draggable={isAdmin}
                        onDragStart={(e) => handleDragStart(e, caseItem)}
                        onDragEnd={handleDragEnd}
                        style={{
                          background: 'white',
                          borderRadius: '4px',
                          padding: '12px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          cursor: isAdmin ? 'grab' : 'default',
                          borderLeft: hasOverdueTasks ? '3px solid var(--danger)' : '3px solid transparent',
                          opacity: draggingCase?.id === caseItem.id ? 0.5 : 1
                        }}
                      >
                        <Link
                          to={`/cases/${caseItem.id}`}
                          style={{
                            fontWeight: '600',
                            fontSize: '13px',
                            color: 'var(--accent)',
                            display: 'block',
                            marginBottom: '4px'
                          }}
                        >
                          {caseItem.case_number}
                        </Link>

                        <div style={{
                          fontSize: '14px',
                          color: 'var(--gray-700)',
                          marginBottom: '4px'
                        }}>
                          {caseItem.defendant_name}
                        </div>

                        {caseItem.category_code && (
                          <div style={{
                            fontSize: '10px',
                            color: 'var(--gray-500)',
                            background: 'var(--gray-100)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            display: 'inline-block',
                            marginBottom: '8px'
                          }}>
                            {caseItem.category_code}
                          </div>
                        )}

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px'
                        }}>
                          <span style={{ fontWeight: '600', color: 'var(--gray-600)' }}>
                            {formatCurrency(caseItem.amount_claimed)}
                          </span>
                          <span style={{ color: 'var(--gray-500)' }}>
                            {daysInStage} day{daysInStage !== 1 ? 's' : ''} in stage
                          </span>
                        </div>

                        {hasOverdueTasks && (
                          <div style={{
                            marginTop: '8px',
                            padding: '4px 8px',
                            background: 'var(--danger)',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            display: 'inline-block'
                          }}>
                            {caseItem.overdue_tasks} overdue task{caseItem.overdue_tasks !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: 'var(--gray-50)',
          borderRadius: '4px',
          fontSize: '13px',
          color: 'var(--gray-600)'
        }}>
          Tip: Drag and drop case cards between columns to change their stage.
        </div>
      )}
    </div>
  )
}
