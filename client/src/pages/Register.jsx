import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

export default function Register() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(true)
  const [inviteData, setInviteData] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  })

  useEffect(() => {
    validateToken()
  }, [token])

  const validateToken = async () => {
    try {
      const response = await fetch(`/api/invites/validate/${token}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invalid invite link')
        setInviteData(null)
      } else {
        setInviteData(data)
        setError('')
      }
    } catch (err) {
      setError('Failed to validate invite link')
    } finally {
      setLoading(false)
      setValidating(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/invites/register/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          full_name: formData.full_name
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Registration failed')
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatRole = (role) => {
    return role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || ''
  }

  if (validating) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Collections Manager</h1>
            <p>Validating invite...</p>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Collections Manager</h1>
            <p>Account Created Successfully!</p>
          </div>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{
              background: 'var(--success)',
              color: 'white',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              Your account has been created. You can now log in with your credentials.
            </div>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!inviteData) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Collections Manager</h1>
            <p>Invalid Invite</p>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="alert alert-error" style={{ marginBottom: '20px' }}>
              {error || 'This invite link is invalid or has expired.'}
            </div>
            <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
              Please contact your administrator for a new invite.
            </p>
            <Link to="/login" className="btn btn-secondary" style={{ width: '100%', marginTop: '16px' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Collections Manager</h1>
          <p>Complete Your Registration</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="alert alert-error">{error}</div>}

          <div style={{
            background: 'var(--gray-50)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>Email</div>
            <div style={{ fontWeight: 500 }}>{inviteData.email}</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '8px' }}>Role</div>
            <div style={{ fontWeight: 500 }}>{formatRole(inviteData.role)}</div>
          </div>

          <div className="form-group">
            <label htmlFor="full_name">Full Name</label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              minLength={3}
              placeholder="Choose a username (min 3 characters)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              placeholder="Create a password (min 6 characters)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Confirm your password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link to="/login" style={{ color: 'var(--gray-600)', fontSize: '14px' }}>
            Already have an account? Log in
          </Link>
        </div>
      </div>
    </div>
  )
}
