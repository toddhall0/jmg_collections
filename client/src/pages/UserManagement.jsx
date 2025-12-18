import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatDateTime } from '../utils/format'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('users')

  // User modal state
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [savingUser, setSavingUser] = useState(false)
  const [userError, setUserError] = useState('')
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'local_counsel',
    active: true
  })

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [savingInvite, setSavingInvite] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteFormData, setInviteFormData] = useState({
    email: '',
    role: 'local_counsel'
  })
  const [createdInvite, setCreatedInvite] = useState(null)

  useEffect(() => {
    loadUsers()
    loadInvites()
  }, [])

  const loadUsers = async () => {
    try {
      const data = await api.get('/users')
      setUsers(data.users)
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadInvites = async () => {
    try {
      const data = await api.get('/invites')
      setInvites(data.invites)
    } catch (err) {
      console.error('Error loading invites:', err)
    }
  }

  // User form handlers
  const resetUserForm = () => {
    setUserFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role: 'local_counsel',
      active: true
    })
    setEditingUser(null)
    setUserError('')
  }

  const openCreateUserModal = () => {
    resetUserForm()
    setShowUserModal(true)
  }

  const openEditUserModal = (user) => {
    setEditingUser(user)
    setUserFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      password: '',
      role: user.role,
      active: Boolean(user.active)
    })
    setShowUserModal(true)
  }

  const closeUserModal = () => {
    setShowUserModal(false)
    resetUserForm()
  }

  const handleUserChange = (e) => {
    const { name, value, type, checked } = e.target
    setUserFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleUserSubmit = async (e) => {
    e.preventDefault()
    setUserError('')
    setSavingUser(true)

    try {
      const payload = { ...userFormData }
      if (editingUser && !payload.password) {
        delete payload.password
      }

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload)
      } else {
        await api.post('/users', payload)
      }

      await loadUsers()
      closeUserModal()
    } catch (err) {
      setUserError(err.message)
    } finally {
      setSavingUser(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      await api.delete(`/users/${userId}`)
      await loadUsers()
    } catch (err) {
      alert('Failed to delete user: ' + err.message)
    }
  }

  // Invite form handlers
  const resetInviteForm = () => {
    setInviteFormData({ email: '', role: 'local_counsel' })
    setInviteError('')
    setCreatedInvite(null)
  }

  const openInviteModal = () => {
    resetInviteForm()
    setShowInviteModal(true)
  }

  const closeInviteModal = () => {
    setShowInviteModal(false)
    resetInviteForm()
  }

  const handleInviteChange = (e) => {
    const { name, value } = e.target
    setInviteFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleInviteSubmit = async (e) => {
    e.preventDefault()
    setInviteError('')
    setSavingInvite(true)

    try {
      const data = await api.post('/invites', inviteFormData)
      setCreatedInvite(data.invite)
      await loadInvites()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setSavingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId) => {
    if (!confirm('Revoke this invite?')) return

    try {
      await api.delete(`/invites/${inviteId}`)
      await loadInvites()
    } catch (err) {
      alert('Failed to revoke invite: ' + err.message)
    }
  }

  const handleResendInvite = async (inviteId) => {
    try {
      const data = await api.post(`/invites/${inviteId}/resend`)
      setCreatedInvite(data.invite)
      setShowInviteModal(true)
      await loadInvites()
    } catch (err) {
      alert('Failed to resend invite: ' + err.message)
    }
  }

  const getInviteLink = (token) => {
    return `${window.location.origin}/register/${token}`
  }

  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(getInviteLink(token))
    alert('Invite link copied to clipboard!')
  }

  const getRoleBadgeClass = (role) => {
    const classes = {
      admin: 'badge-judgment',
      internal_counsel: 'badge-info',
      client: 'badge-open',
      local_counsel: 'badge-settled'
    }
    return classes[role] || 'badge-stage'
  }

  const formatRole = (role) => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  const pendingInvites = invites.filter(i => !i.is_expired)
  const expiredInvites = invites.filter(i => i.is_expired)

  return (
    <div>
      <div className="page-header">
        <h1>User Management</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={openInviteModal}>
            Invite User
          </button>
          <button className="btn btn-primary" onClick={openCreateUserModal}>
            + New User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 0 0 8px' }}
          onClick={() => setActiveTab('users')}
        >
          Users ({users.length})
        </button>
        <button
          className={`btn ${activeTab === 'invites' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '0 8px 8px 0' }}
          onClick={() => setActiveTab('invites')}
        >
          Pending Invites ({pendingInvites.length})
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card">
          {users.length === 0 ? (
            <div className="empty-state">
              <h3>No users found</h3>
              <p>Create your first user or send an invite.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                          {formatRole(user.role)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${user.active ? 'badge-open' : 'badge-dismissed'}`}>
                          {user.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{formatDateTime(user.created_at)}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditUserModal(user)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteUser(user.id)}
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
      )}

      {/* Invites Tab */}
      {activeTab === 'invites' && (
        <div className="card">
          {pendingInvites.length === 0 ? (
            <div className="empty-state">
              <h3>No pending invites</h3>
              <p>Send an invite to add new users.</p>
              <button className="btn btn-primary" onClick={openInviteModal}>
                Invite User
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Invited By</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map(invite => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>
                        <span className={`badge ${getRoleBadgeClass(invite.role)}`}>
                          {formatRole(invite.role)}
                        </span>
                      </td>
                      <td>{invite.invited_by_name}</td>
                      <td>{formatDateTime(invite.expires_at)}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => copyInviteLink(invite.invite_token)}
                          >
                            Copy Link
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleResendInvite(invite.id)}
                          >
                            Resend
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRevokeInvite(invite.id)}
                          >
                            Revoke
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
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="modal-overlay" onClick={closeUserModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'New User'}</h2>
              <button className="modal-close" onClick={closeUserModal}>&times;</button>
            </div>

            <form onSubmit={handleUserSubmit}>
              <div className="modal-body">
                {userError && <div className="alert alert-error">{userError}</div>}

                <div className="form-group">
                  <label htmlFor="full_name">Full Name *</label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={userFormData.full_name}
                    onChange={handleUserChange}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="username">Username *</label>
                    <input
                      type="text"
                      id="username"
                      name="username"
                      value={userFormData.username}
                      onChange={handleUserChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={userFormData.email}
                      onChange={handleUserChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="password">
                      Password {editingUser ? '(leave blank to keep current)' : '*'}
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={userFormData.password}
                      onChange={handleUserChange}
                      required={!editingUser}
                      minLength={6}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="role">Role *</label>
                    <select
                      id="role"
                      name="role"
                      value={userFormData.role}
                      onChange={handleUserChange}
                      required
                    >
                      <option value="admin">Admin</option>
                      <option value="internal_counsel">Internal Counsel</option>
                      <option value="client">Client</option>
                      <option value="local_counsel">Local Counsel</option>
                    </select>
                  </div>
                </div>

                {editingUser && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        name="active"
                        checked={userFormData.active}
                        onChange={handleUserChange}
                      />
                      User is active
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeUserModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingUser}>
                  {savingUser ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={closeInviteModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{createdInvite ? 'Invite Created' : 'Invite User'}</h2>
              <button className="modal-close" onClick={closeInviteModal}>&times;</button>
            </div>

            {createdInvite ? (
              <div className="modal-body">
                <div style={{
                  background: 'var(--success)',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  textAlign: 'center'
                }}>
                  Invite created successfully!
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <div style={{ padding: '8px 0', fontWeight: 500 }}>{createdInvite.email}</div>
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <div style={{ padding: '8px 0' }}>
                    <span className={`badge ${getRoleBadgeClass(createdInvite.role)}`}>
                      {formatRole(createdInvite.role)}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Invite Link</label>
                  <div style={{
                    background: 'var(--gray-100)',
                    padding: '12px',
                    borderRadius: '4px',
                    wordBreak: 'break-all',
                    fontSize: '13px',
                    marginBottom: '8px'
                  }}>
                    {getInviteLink(createdInvite.invite_token)}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => copyInviteLink(createdInvite.invite_token)}
                  >
                    Copy Invite Link
                  </button>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '16px' }}>
                  Share this link with the user. It expires in 7 days.
                </p>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit}>
                <div className="modal-body">
                  {inviteError && <div className="alert alert-error">{inviteError}</div>}

                  <p style={{ marginBottom: '16px', color: 'var(--gray-600)' }}>
                    Send an invite to allow someone to create their own account.
                    They'll choose their own username and password.
                  </p>

                  <div className="form-group">
                    <label htmlFor="invite_email">Email Address *</label>
                    <input
                      type="email"
                      id="invite_email"
                      name="email"
                      value={inviteFormData.email}
                      onChange={handleInviteChange}
                      required
                      placeholder="user@example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="invite_role">Role *</label>
                    <select
                      id="invite_role"
                      name="role"
                      value={inviteFormData.role}
                      onChange={handleInviteChange}
                      required
                    >
                      <option value="admin">Admin</option>
                      <option value="internal_counsel">Internal Counsel</option>
                      <option value="client">Client</option>
                      <option value="local_counsel">Local Counsel</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeInviteModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingInvite}>
                    {savingInvite ? 'Creating Invite...' : 'Create Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
