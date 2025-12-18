import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const data = await api.get('/notifications/preferences')
      setPreferences(data.preferences)
    } catch (error) {
      console.error('Error loading preferences:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (field) => {
    const newValue = !preferences[field]
    setPreferences(prev => ({ ...prev, [field]: newValue ? 1 : 0 }))

    setSaving(true)
    try {
      await api.put('/notifications/preferences', { [field]: newValue })
    } catch (error) {
      console.error('Error saving preference:', error)
      // Revert on error
      setPreferences(prev => ({ ...prev, [field]: !newValue ? 1 : 0 }))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading preferences...</div>
  }

  const emailSettings = [
    { field: 'email_task_assigned', label: 'Task Assigned', description: 'When someone assigns you a new task' },
    { field: 'email_task_reminder', label: 'Task Reminders', description: 'Reminders for upcoming task due dates' },
    { field: 'email_task_overdue', label: 'Overdue Tasks', description: 'When your tasks become overdue' },
    { field: 'email_stage_change', label: 'Case Stage Changes', description: 'When a case moves to a new stage' },
    { field: 'email_document_upload', label: 'Document Uploads', description: 'When documents are uploaded to your cases' },
    { field: 'email_case_assigned', label: 'Case Assignments', description: 'When you are assigned to a new case' },
    { field: 'email_deadline_reminder', label: 'Deadline Reminders', description: 'Reminders for upcoming case deadlines' }
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Notification Settings</h1>
          <p style={{ color: 'var(--gray-500)', marginTop: '4px' }}>
            Manage how you receive notifications
          </p>
        </div>
        <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>In-App Notifications</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: '16px', fontSize: '14px' }}>
          Control whether you see notifications within the application.
        </p>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Enable In-App Notifications</div>
            <div className="setting-description">
              Show notification bell and in-app alerts
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={preferences?.in_app_enabled === 1}
              onChange={() => handleToggle('in_app_enabled')}
              disabled={saving}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Email Notifications</h3>
        <p style={{ color: 'var(--gray-500)', marginBottom: '24px', fontSize: '14px' }}>
          Choose which events trigger email notifications. Emails are sent to your registered email address.
        </p>

        {emailSettings.map(setting => (
          <div key={setting.field} className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{setting.label}</div>
              <div className="setting-description">{setting.description}</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={preferences?.[setting.field] === 1}
                onChange={() => handleToggle(setting.field)}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        ))}
      </div>

      <style>{`
        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid var(--gray-100);
        }

        .setting-row:last-child {
          border-bottom: none;
        }

        .setting-info {
          flex: 1;
        }

        .setting-label {
          font-weight: 500;
          color: var(--gray-800);
          margin-bottom: 4px;
        }

        .setting-description {
          font-size: 13px;
          color: var(--gray-500);
        }

        .toggle {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
          margin-left: 16px;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--gray-300);
          border-radius: 26px;
          transition: 0.3s;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: 0.3s;
        }

        .toggle input:checked + .toggle-slider {
          background-color: var(--primary);
        }

        .toggle input:checked + .toggle-slider:before {
          transform: translateX(22px);
        }

        .toggle input:disabled + .toggle-slider {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
