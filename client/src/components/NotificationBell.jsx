import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    loadNotifications()

    // Poll for new notifications every minute
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadNotifications = async () => {
    try {
      const data = await api.get('/notifications?limit=10')
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch (error) {
      console.error('Error loading notifications:', error)
    }
  }

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`)
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    setLoading(true)
    try {
      await api.put('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_assigned':
      case 'task_reminder':
      case 'task_overdue':
        return '📋'
      case 'stage_change':
        return '🔄'
      case 'document_upload':
        return '📄'
      case 'case_assigned':
        return '📁'
      case 'deadline_reminder':
        return '⏰'
      default:
        return '🔔'
    }
  }

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-btn"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button
                className="mark-all-read"
                onClick={markAllAsRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                No notifications
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.is_read ? '' : 'unread'}`}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                >
                  <span className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-time">{formatTime(notification.created_at)}</div>
                  </div>
                  {notification.case_number && (
                    <Link
                      to={`/cases/${notification.case_id}`}
                      className="notification-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="notification-footer">
            <Link to="/settings/notifications" onClick={() => setShowDropdown(false)}>
              Notification Settings
            </Link>
          </div>
        </div>
      )}

      <style>{`
        .notification-bell {
          position: relative;
        }

        .notification-btn {
          background: transparent;
          border: none;
          padding: 8px;
          cursor: pointer;
          color: var(--gray-600);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.15s ease;
        }

        .notification-btn:hover {
          background: var(--gray-100);
          color: var(--gray-800);
        }

        .notification-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          background: var(--danger);
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 10px;
          min-width: 16px;
          text-align: center;
        }

        .notification-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          width: 360px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          z-index: 1000;
          overflow: hidden;
        }

        .notification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--gray-200);
        }

        .notification-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .mark-all-read {
          background: none;
          border: none;
          color: var(--primary);
          font-size: 12px;
          cursor: pointer;
          padding: 4px 8px;
        }

        .mark-all-read:hover {
          text-decoration: underline;
        }

        .notification-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .notification-empty {
          padding: 24px;
          text-align: center;
          color: var(--gray-500);
          font-size: 14px;
        }

        .notification-item {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--gray-100);
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .notification-item:hover {
          background: var(--gray-50);
        }

        .notification-item.unread {
          background: rgba(59, 130, 246, 0.05);
        }

        .notification-item.unread .notification-title {
          font-weight: 600;
        }

        .notification-icon {
          font-size: 18px;
        }

        .notification-content {
          flex: 1;
          min-width: 0;
        }

        .notification-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--gray-800);
          margin-bottom: 2px;
        }

        .notification-message {
          font-size: 12px;
          color: var(--gray-600);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .notification-time {
          font-size: 11px;
          color: var(--gray-400);
          margin-top: 4px;
        }

        .notification-link {
          font-size: 12px;
          color: var(--primary);
          text-decoration: none;
          white-space: nowrap;
        }

        .notification-link:hover {
          text-decoration: underline;
        }

        .notification-footer {
          padding: 12px 16px;
          border-top: 1px solid var(--gray-200);
          text-align: center;
        }

        .notification-footer a {
          font-size: 13px;
          color: var(--primary);
          text-decoration: none;
        }

        .notification-footer a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
