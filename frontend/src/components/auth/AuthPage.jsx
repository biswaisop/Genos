import { useState } from 'react'
import { getMe, login, signup } from '../../lib/authApi'

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function AuthPage({ mode, onModeChange, onAuthSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    phoneRegion: '+91',
    phoneNumber: '',
  })
  const [signinData, setSigninData] = useState({
    email: '',
    password: '',
  })

  const setField = (type, key, value) => {
    if (type === 'signup') {
      setSignupData((prev) => ({ ...prev, [key]: value }))
      return
    }
    setSigninData((prev) => ({ ...prev, [key]: value }))
  }

  const validateSignup = () => {
    if (!signupData.name.trim()) return 'Name is required'
    if (!isValidEmail(signupData.email)) return 'Enter a valid email'
    if (!signupData.password || signupData.password.length < 6) {
      return 'Password must be at least 6 characters'
    }
    return ''
  }

  const validateSignin = () => {
    if (!isValidEmail(signinData.email)) return 'Enter a valid email'
    if (!signinData.password) return 'Password is required'
    return ''
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    const validationError = validateSignup()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      await signup({
        name: signupData.name.trim(),
        email: signupData.email.trim(),
        password: signupData.password,
        phone: signupData.phoneNumber.trim()
          ? `${signupData.phoneRegion}${signupData.phoneNumber.trim()}`
          : undefined,
      })
      setInfo('Account created. Sign in to continue.')
      setSigninData((prev) => ({ ...prev, email: signupData.email.trim() }))
      onModeChange('signin')
    } catch (err) {
      setError(err.message || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  const handleSignin = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    const validationError = validateSignin()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const tokenResponse = await login({
        email: signinData.email.trim(),
        password: signinData.password,
      })
      const token = tokenResponse.access_token
      localStorage.setItem('genos_access_token', token)
      const profile = await getMe(token)
      onAuthSuccess(profile)
    } catch (err) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const signupPlaceholders = {
    name: 'Your name',
    email: 'you@example.com',
    password: 'At least 6 characters',
    phoneNumber: '9876543210',
  }

  const signinPlaceholders = {
    email: 'you@example.com',
    password: 'Your password',
  }

  return (
    <main className="auth-page-main">
      <section className="auth-page-card">
        <h1>{mode === 'signup' ? 'Create your GenOS account' : 'Sign in to GenOS'}</h1>

        <div className="auth-switch">
          <button
            type="button"
            className={mode === 'signup' ? 'is-active' : ''}
            onClick={() => onModeChange('signup')}
          >
            Sign up
          </button>
          <button
            type="button"
            className={mode === 'signin' ? 'is-active' : ''}
            onClick={() => onModeChange('signin')}
          >
            Sign in
          </button>
        </div>

        {error ? <p className="auth-message auth-message--error">{error}</p> : null}
        {info ? <p className="auth-message auth-message--info">{info}</p> : null}

        {mode === 'signup' ? (
          <form className="auth-form" onSubmit={handleSignup}>
            <label htmlFor="signup-name">Name</label>
            <input
              id="signup-name"
              value={signupData.name}
              onChange={(event) => setField('signup', 'name', event.target.value)}
              placeholder={signupPlaceholders.name}
            />
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              value={signupData.email}
              onChange={(event) => setField('signup', 'email', event.target.value)}
              placeholder={signupPlaceholders.email}
            />
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={signupData.password}
              onChange={(event) => setField('signup', 'password', event.target.value)}
              placeholder={signupPlaceholders.password}
            />
            <label htmlFor="signup-phone-number">Phone (optional)</label>
            <div className="phone-row">
              <input
                id="signup-phone-region"
                list="phone-region-options"
                value={signupData.phoneRegion}
                onChange={(event) => setField('signup', 'phoneRegion', event.target.value)}
                placeholder="+91"
                inputMode="tel"
              />
              <datalist id="phone-region-options">
                <option value="+91">India (IN)</option>
                <option value="+1">United States (US)</option>
                <option value="+44">United Kingdom (UK)</option>
                <option value="+61">Australia (AU)</option>
                <option value="+81">Japan (JP)</option>
                <option value="+49">Germany (DE)</option>
                <option value="+33">France (FR)</option>
                <option value="+65">Singapore (SG)</option>
                <option value="+971">UAE (AE)</option>
              </datalist>
              <input
                id="signup-phone-number"
                value={signupData.phoneNumber}
                onChange={(event) => setField('signup', 'phoneNumber', event.target.value)}
                placeholder={signupPlaceholders.phoneNumber}
                inputMode="tel"
              />
            </div>
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignin}>
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              type="email"
              value={signinData.email}
              onChange={(event) => setField('signin', 'email', event.target.value)}
              placeholder={signinPlaceholders.email}
            />
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              type="password"
              value={signinData.password}
              onChange={(event) => setField('signin', 'password', event.target.value)}
              placeholder={signinPlaceholders.password}
            />
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default AuthPage
