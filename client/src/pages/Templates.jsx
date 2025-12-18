import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDateTime } from '../utils/format'

const TEMPLATE_TYPES = ['Initial Notice', 'Second Notice', 'Demand Letter', 'Other']

const DEFAULT_TEMPLATES = {
  'Initial Notice': `[YOUR COMPANY LETTERHEAD]

{{today_date}}

{{defendant_contact_name}}
{{defendant_name}}
{{defendant_address}}
{{defendant_city_state}}

Re: Notice of Outstanding Debt
    Case Number: {{case_number}}
    Amount Due: {{amount_claimed}}

Dear {{defendant_contact_name}},

This letter serves as formal notice that our records indicate you have an outstanding balance of {{amount_claimed}} ({{amount_claimed_words}}) that remains unpaid.

This debt relates to: {{claim_description}}

The claim arose on {{date_claim_arose}}.

We request that you remit payment in full within thirty (30) days of the date of this letter. The deadline for response is {{response_deadline}}.

If you believe this debt is in error, or if you wish to discuss payment arrangements, please contact our office immediately.

Failure to respond to this notice may result in additional collection efforts, including but not limited to engagement of legal counsel and formal legal action.

Please remit payment to:
[YOUR PAYMENT ADDRESS]

Sincerely,

[YOUR NAME]
[YOUR TITLE]
[YOUR CONTACT INFORMATION]`,

  'Second Notice': `[YOUR COMPANY LETTERHEAD]

{{today_date}}

{{defendant_contact_name}}
{{defendant_name}}
{{defendant_address}}
{{defendant_city_state}}

Re: SECOND NOTICE - Immediate Attention Required
    Case Number: {{case_number}}
    Amount Due: {{amount_claimed}}

Dear {{defendant_contact_name}},

SECOND AND FINAL NOTICE BEFORE LEGAL ACTION

This is our second and final notice regarding your outstanding debt of {{amount_claimed}} ({{amount_claimed_words}}). Despite our previous correspondence, we have not received payment or any response from you.

Original claim: {{claim_description}}
Date claim arose: {{date_claim_arose}}
Statute of limitations expires: {{statute_of_limitations_date}}

You have until {{response_deadline}} to:
1. Pay the outstanding balance in full, OR
2. Contact us to establish a payment arrangement

IMPORTANT: If we do not receive payment or a response by the deadline above, we will have no choice but to refer this matter to local counsel for formal legal proceedings. This may result in additional costs being added to your balance, including attorney fees and court costs.

To avoid legal action, please contact us immediately or remit payment to:
[YOUR PAYMENT ADDRESS]

This is a serious matter that requires your immediate attention.

Sincerely,

[YOUR NAME]
[YOUR TITLE]
[YOUR CONTACT INFORMATION]`,

  'Demand Letter': `[YOUR COMPANY LETTERHEAD]

{{today_date}}

VIA CERTIFIED MAIL - RETURN RECEIPT REQUESTED

{{defendant_contact_name}}
{{defendant_name}}
{{defendant_address}}
{{defendant_city_state}}

Re: FORMAL DEMAND FOR PAYMENT
    Case Number: {{case_number}}
    Amount Due: {{amount_claimed}}

Dear {{defendant_contact_name}},

FORMAL DEMAND FOR PAYMENT

Please be advised that we represent [CLIENT NAME] in connection with the collection of the debt owed by you in the amount of {{amount_claimed}} ({{amount_claimed_words}}).

This debt arises from: {{claim_description}}

The claim arose on {{date_claim_arose}}, and the statute of limitations for legal action expires on {{statute_of_limitations_date}}.

DEMAND IS HEREBY MADE for immediate payment of the full amount due. Payment must be received within ten (10) days of your receipt of this letter.

If payment is not received by the deadline, we are authorized to commence legal proceedings against you without further notice. Such action may result in a judgment against you, which could include the original debt, interest, attorney fees, and court costs.

To resolve this matter and avoid litigation, please remit payment immediately to:
[YOUR PAYMENT ADDRESS]

This letter is an attempt to collect a debt. Any information obtained will be used for that purpose.

Very truly yours,

[ATTORNEY NAME]
[BAR NUMBER]
[LAW FIRM NAME]
[CONTACT INFORMATION]`
}

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [mergeFields, setMergeFields] = useState([])
  const [showMergeFields, setShowMergeFields] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    template_type: 'Initial Notice',
    content: '',
    description: '',
    is_active: true
  })

  useEffect(() => {
    loadTemplates()
    loadMergeFields()
  }, [])

  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates')
      setTemplates(data.templates)
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMergeFields = async () => {
    try {
      const data = await api.get('/templates/merge-fields/list')
      setMergeFields(data.mergeFields)
    } catch (error) {
      console.error('Error loading merge fields:', error)
    }
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setFormData({
      name: '',
      template_type: 'Initial Notice',
      content: '',
      description: '',
      is_active: true
    })
    setShowEditor(true)
  }

  const handleEdit = (template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      template_type: template.template_type,
      content: template.content,
      description: template.description || '',
      is_active: !!template.is_active
    })
    setShowEditor(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      await api.delete(`/templates/${id}`)
      loadTemplates()
    } catch (error) {
      alert('Failed to delete template: ' + error.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, formData)
      } else {
        await api.post('/templates', formData)
      }
      setShowEditor(false)
      loadTemplates()
    } catch (error) {
      alert('Failed to save template: ' + error.message)
    }
  }

  const handleTemplateTypeChange = (type) => {
    setFormData(prev => ({
      ...prev,
      template_type: type,
      content: !prev.content && DEFAULT_TEMPLATES[type] ? DEFAULT_TEMPLATES[type] : prev.content
    }))
  }

  const loadDefaultTemplate = () => {
    if (DEFAULT_TEMPLATES[formData.template_type]) {
      setFormData(prev => ({
        ...prev,
        content: DEFAULT_TEMPLATES[formData.template_type]
      }))
    }
  }

  const insertMergeField = (field) => {
    const textarea = document.getElementById('template-content')
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newContent = formData.content.substring(0, start) + field + formData.content.substring(end)
    setFormData(prev => ({ ...prev, content: newContent }))
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + field.length, start + field.length)
    }, 0)
  }

  if (loading) {
    return <div className="loading">Loading templates...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1>Document Templates</h1>
        <button className="btn btn-primary" onClick={handleCreate}>
          Create Template
        </button>
      </div>

      {showEditor && (
        <div className="modal-overlay" onClick={() => setShowEditor(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTemplate ? 'Edit Template' : 'Create Template'}</h2>
              <button className="modal-close" onClick={() => setShowEditor(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Template Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Standard Initial Notice"
                    />
                  </div>
                  <div className="form-group">
                    <label>Template Type *</label>
                    <select
                      value={formData.template_type}
                      onChange={(e) => handleTemplateTypeChange(e.target.value)}
                    >
                      {TEMPLATE_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of when to use this template"
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ margin: 0 }}>Template Content *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowMergeFields(!showMergeFields)}
                      >
                        {showMergeFields ? 'Hide' : 'Show'} Merge Fields
                      </button>
                      {DEFAULT_TEMPLATES[formData.template_type] && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={loadDefaultTemplate}
                        >
                          Load Default
                        </button>
                      )}
                    </div>
                  </div>

                  {showMergeFields && (
                    <div style={{
                      background: 'var(--gray-50)',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                      maxHeight: '150px',
                      overflow: 'auto'
                    }}>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '8px' }}>
                        Click a merge field to insert it at cursor position:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {mergeFields.map(mf => (
                          <button
                            key={mf.field}
                            type="button"
                            className="btn btn-sm"
                            style={{
                              fontSize: '11px',
                              padding: '4px 8px',
                              background: 'var(--primary)',
                              color: 'white'
                            }}
                            onClick={() => insertMergeField(mf.field)}
                            title={mf.description}
                          >
                            {mf.field}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    id="template-content"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    required
                    rows={15}
                    style={{ fontFamily: 'monospace', fontSize: '13px' }}
                    placeholder="Enter your template content here. Use merge fields like {{defendant_name}} to insert case data."
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    Active (available for document generation)
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditor(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        {templates.length === 0 ? (
          <div className="empty-state">
            <h3>No templates yet</h3>
            <p>Create your first document template to get started.</p>
            <button className="btn btn-primary" onClick={handleCreate}>Create Template</button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(template => (
                  <tr key={template.id}>
                    <td style={{ fontWeight: 500 }}>{template.name}</td>
                    <td>
                      <span className="badge badge-stage">{template.template_type}</span>
                    </td>
                    <td style={{ color: 'var(--gray-500)', fontSize: '13px' }}>
                      {template.description || '-'}
                    </td>
                    <td>
                      <span className={`badge ${template.is_active ? 'badge-settled' : 'badge-dismissed'}`}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                      {formatDateTime(template.created_at)}
                      {template.created_by_name && (
                        <div style={{ fontSize: '12px' }}>by {template.created_by_name}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEdit(template)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(template.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Available Merge Fields</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: '16px' }}>
          Use these merge fields in your templates. They will be replaced with actual case data when generating documents.
        </p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Merge Field</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {mergeFields.map(mf => (
                <tr key={mf.field}>
                  <td><code style={{ background: 'var(--gray-100)', padding: '2px 6px', borderRadius: '4px' }}>{mf.field}</code></td>
                  <td>{mf.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
