import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

export default function GenerateDocument({ caseId, caseData, onGenerated }) {
  const { isAdmin, isInternalCounsel } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [previewContent, setPreviewContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [updateCase, setUpdateCase] = useState(true)

  useEffect(() => {
    if (isAdmin || isInternalCounsel) {
      loadTemplates()
    }
  }, [isAdmin, isInternalCounsel])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const data = await api.get('/templates')
      setTemplates(data.templates.filter(t => t.is_active))
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (template) => {
    setSelectedTemplate(template)
    try {
      const data = await api.post(`/templates/preview/${template.id}/case/${caseId}`)
      setPreviewContent(data.content)
      setShowPreview(true)
    } catch (error) {
      alert('Failed to preview: ' + error.message)
    }
  }

  const handleGenerate = async () => {
    if (!selectedTemplate) return

    setGenerating(true)
    try {
      const data = await api.post(`/templates/generate/${selectedTemplate.id}/case/${caseId}`, {
        updateCase
      })
      alert(`Document generated successfully: ${data.file_name}`)
      setShowModal(false)
      setShowPreview(false)
      setSelectedTemplate(null)
      if (onGenerated) onGenerated()
    } catch (error) {
      alert('Failed to generate document: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const getQuickAction = (type) => {
    const template = templates.find(t => t.template_type === type)
    return template
  }

  const quickGenerate = async (type) => {
    const template = getQuickAction(type)
    if (!template) {
      alert(`No active ${type} template found. Please create one in the Templates section.`)
      return
    }
    setSelectedTemplate(template)
    setUpdateCase(true)
    handlePreview(template)
  }

  if (!isAdmin && !isInternalCounsel) {
    return null
  }

  const initialNoticeTemplate = getQuickAction('Initial Notice')
  const secondNoticeTemplate = getQuickAction('Second Notice')

  return (
    <div className="card">
      <h3 style={{ marginBottom: '16px' }}>Generate Documents</h3>

      {loading ? (
        <div>Loading templates...</div>
      ) : templates.length === 0 ? (
        <div style={{ color: 'var(--gray-500)', fontSize: '14px' }}>
          No active templates available. Create templates in the Templates section.
        </div>
      ) : (
        <>
          {/* Quick Actions */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '8px' }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => quickGenerate('Initial Notice')}
                disabled={!initialNoticeTemplate || caseData?.initial_notice_sent_date}
                title={caseData?.initial_notice_sent_date ? 'Initial Notice already sent' : 'Generate Initial Notice'}
              >
                {caseData?.initial_notice_sent_date ? 'Initial Notice Sent' : 'Generate Initial Notice'}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => quickGenerate('Second Notice')}
                disabled={!secondNoticeTemplate || caseData?.second_notice_sent_date || !caseData?.initial_notice_sent_date}
                title={
                  !caseData?.initial_notice_sent_date
                    ? 'Send Initial Notice first'
                    : caseData?.second_notice_sent_date
                      ? 'Second Notice already sent'
                      : 'Generate Second Notice'
                }
              >
                {caseData?.second_notice_sent_date ? 'Second Notice Sent' : 'Generate Second Notice'}
              </button>
            </div>
          </div>

          {/* All Templates */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowModal(true)}
          >
            Browse All Templates
          </button>
        </>
      )}

      {/* Template Selection Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Template</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {templates.length === 0 ? (
                <p>No templates available.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {templates.map(template => (
                    <div
                      key={template.id}
                      style={{
                        padding: '12px',
                        border: '1px solid var(--gray-200)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: selectedTemplate?.id === template.id ? 'var(--primary-light)' : 'white'
                      }}
                      onClick={() => handlePreview(template)}
                    >
                      <div style={{ fontWeight: 500 }}>{template.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        {template.template_type}
                        {template.description && ` - ${template.description}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && selectedTemplate && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Preview: {selectedTemplate.name}</h2>
              <button className="modal-close" onClick={() => setShowPreview(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{
                background: 'var(--gray-50)',
                border: '1px solid var(--gray-200)',
                borderRadius: '8px',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '13px',
                whiteSpace: 'pre-wrap',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                {previewContent}
              </div>

              {(selectedTemplate.template_type === 'Initial Notice' || selectedTemplate.template_type === 'Second Notice') && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={updateCase}
                      onChange={(e) => setUpdateCase(e.target.checked)}
                    />
                    <span>
                      Update case: Set {selectedTemplate.template_type === 'Initial Notice' ? 'Initial' : 'Second'} Notice
                      sent date to today and advance stage to "{selectedTemplate.template_type} Sent"
                    </span>
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPreview(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Generate & Save Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
