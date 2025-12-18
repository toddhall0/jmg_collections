import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    default_claim_language: '',
    display_order: 0,
    status: 'Active'
  })
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState([])

  useEffect(() => {
    loadCategories()
    loadStats()
  }, [])

  const loadCategories = async () => {
    try {
      const data = await api.get('/categories?include_inactive=true')
      setCategories(data.categories)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await api.get('/categories/stats/summary')
      setStats(data.stats)
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const openNewModal = () => {
    setEditingCategory(null)
    setFormData({
      name: '',
      code: '',
      description: '',
      default_claim_language: '',
      display_order: categories.length + 1,
      status: 'Active'
    })
    setShowModal(true)
  }

  const openEditModal = (category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      code: category.code,
      description: category.description || '',
      default_claim_language: category.default_claim_language || '',
      display_order: category.display_order,
      status: category.status
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, formData)
      } else {
        await api.post('/categories', formData)
      }
      setShowModal(false)
      loadCategories()
      loadStats()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category) => {
    if (!confirm(`Are you sure you want to delete "${category.name}"? This cannot be undone.`)) {
      return
    }

    try {
      await api.delete(`/categories/${category.id}`)
      loadCategories()
      loadStats()
    } catch (err) {
      alert(err.message)
    }
  }

  const getStatForCategory = (categoryId) => {
    return stats.find(s => s.id === categoryId) || { case_count: 0, open_cases: 0, total_claimed: 0, total_recovered: 0 }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0)
  }

  if (loading) {
    return <div className="loading">Loading categories...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1>Case Categories</h1>
        <button className="btn btn-primary" onClick={openNewModal}>
          + New Category
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Order</th>
              <th>Category</th>
              <th>Code</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Cases</th>
              <th style={{ textAlign: 'right' }}>Open</th>
              <th style={{ textAlign: 'right' }}>Total Claimed</th>
              <th style={{ textAlign: 'right' }}>Recovered</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-500)' }}>
                  No categories found. Create your first category to get started.
                </td>
              </tr>
            ) : (
              categories.map(category => {
                const catStats = getStatForCategory(category.id)
                return (
                  <tr key={category.id}>
                    <td style={{ textAlign: 'center', color: 'var(--gray-500)' }}>
                      {category.display_order}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{category.name}</div>
                      {category.description && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                          {category.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-secondary">{category.code}</span>
                    </td>
                    <td>
                      <span className={`badge ${category.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                        {category.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{catStats.case_count}</td>
                    <td style={{ textAlign: 'right' }}>{catStats.open_cases}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(catStats.total_claimed)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(catStats.total_recovered)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openEditModal(category)}
                        >
                          Edit
                        </button>
                        {catStats.case_count === 0 && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(category)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Category Statistics Summary */}
      {stats.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Category Performance Overview</h3>
          <div className="stats-grid">
            {stats.map(stat => {
              const recoveryRate = stat.total_claimed > 0
                ? ((stat.total_recovered / stat.total_claimed) * 100).toFixed(1)
                : 0
              return (
                <div key={stat.id} className="stat-card">
                  <div className="stat-header">
                    <span className="badge badge-secondary">{stat.code}</span>
                    <span style={{ fontWeight: 500, marginLeft: '8px' }}>{stat.name}</span>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--gray-500)' }}>Total Cases:</span>
                      <span style={{ fontWeight: 500 }}>{stat.case_count}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--gray-500)' }}>Open Cases:</span>
                      <span style={{ fontWeight: 500 }}>{stat.open_cases}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--gray-500)' }}>Recovery Rate:</span>
                      <span style={{ fontWeight: 500, color: recoveryRate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
                        {recoveryRate}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Category' : 'New Category'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">Category Name *</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="e.g., Partner Violation"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="code">Code *</label>
                    <input
                      type="text"
                      id="code"
                      name="code"
                      value={formData.code}
                      onChange={handleChange}
                      required
                      maxLength={10}
                      placeholder="e.g., PV"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <small style={{ color: 'var(--gray-500)' }}>Short code for reports (max 10 chars)</small>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Brief explanation of what this category covers"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="default_claim_language">Default Claim Language</label>
                  <textarea
                    id="default_claim_language"
                    name="default_claim_language"
                    value={formData.default_claim_language}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Boilerplate description text that can be used when creating cases of this type"
                  />
                  <small style={{ color: 'var(--gray-500)' }}>This text will auto-populate the Claim Description when this category is selected</small>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="display_order">Display Order</label>
                    <input
                      type="number"
                      id="display_order"
                      name="display_order"
                      value={formData.display_order}
                      onChange={handleChange}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
        }
        .stat-card {
          background: var(--gray-50);
          border-radius: 8px;
          padding: 16px;
        }
        .stat-header {
          display: flex;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--gray-200);
        }
        .btn-danger {
          background: var(--danger);
          color: white;
        }
        .btn-danger:hover {
          background: #c82333;
        }
        .btn-sm {
          padding: 4px 8px;
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}
