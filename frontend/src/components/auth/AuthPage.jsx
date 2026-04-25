import { useState } from 'react'
import { getMe, login, signup } from '../../lib/authApi'

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function LabeledInput({ id, label, type = 'text', value, onChange, placeholder, disabled, className = '' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-white/40">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`field-input ${className}`}
      />
    </div>
  )
}

export default function AuthPage({ mode, onModeChange, onAuthSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [info, setInfo]       = useState('')

  const [signupData, setSignupData] = useState({
    name: '', email: '', password: '', phoneRegion: '+91', phoneNumber: '',
  })
  const [signinData, setSigninData] = useState({ email: '', password: '' })

  const setSignup = (key, val) => setSignupData(p => ({ ...p, [key]: val }))
  const setSignin = (key, val) => setSigninData(p => ({ ...p, [key]: val }))

  const handleSignup = async (e) => {
    e.preventDefault(); setError(''); setInfo('')
    if (!signupData.name.trim())                        return setError('Name is required')
    if (!isValidEmail(signupData.email))                return setError('Enter a valid email')
    if (!signupData.password || signupData.password.length < 6) return setError('Password must be at least 6 characters')
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
      setInfo('Account created — sign in to continue.')
      setSigninData(p => ({ ...p, email: signupData.email.trim() }))
      onModeChange('signin')
    } catch (err) { setError(err.message || 'Failed to sign up') }
    finally { setLoading(false) }
  }

  const handleSignin = async (e) => {
    e.preventDefault(); setError(''); setInfo('')
    if (!isValidEmail(signinData.email)) return setError('Enter a valid email')
    if (!signinData.password)            return setError('Password is required')
    setLoading(true)
    try {
      const res   = await login({ email: signinData.email.trim(), password: signinData.password })
      const token = res.access_token
      localStorage.setItem('genos_access_token', token)
      const profile = await getMe(token)
      onAuthSuccess(profile)
    } catch (err) { setError(err.message || 'Failed to sign in') }
    finally { setLoading(false) }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm animate-fade-in">

        {/* Logo mark */}
        <div className="text-center mb-8">
          <span className="text-3xl font-bold text-white">
            Gen<span className="text-brand-yellow">OS</span>
          </span>
          <p className="text-white/40 text-sm mt-2">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {/* Mode switcher */}
        <div className="flex rounded-lg border border-brand-border bg-brand-black-raised p-1 mb-6">
          {['signup', 'signin'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setError(''); setInfo(''); onModeChange(m) }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                mode === m
                  ? 'bg-brand-yellow text-black shadow'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              {m === 'signup' ? 'Sign up' : 'Sign in'}
            </button>
          ))}
        </div>

        {/* Feedback messages */}
        {error ? (
          <div className="mb-4 text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mb-4 text-sky-400 bg-sky-500/10 border border-sky-500/25 rounded-lg px-3 py-2 text-sm">
            {info}
          </div>
        ) : null}

        {/* Card */}
        <div className="glow-card p-6">
          {mode === 'signup' ? (
            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <LabeledInput id="signup-name"     label="Name"     value={signupData.name}     onChange={e => setSignup('name', e.target.value)}     placeholder="Your name"          disabled={loading} />
              <LabeledInput id="signup-email"    label="Email"    type="email" value={signupData.email}    onChange={e => setSignup('email', e.target.value)}    placeholder="you@example.com"    disabled={loading} />
              <LabeledInput id="signup-password" label="Password" type="password" value={signupData.password} onChange={e => setSignup('password', e.target.value)} placeholder="Min 6 characters"   disabled={loading} />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-white/40">
                  Phone <span className="normal-case text-white/20">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="signup-phone-region"
                    list="phone-region-options"
                    value={signupData.phoneRegion}
                    onChange={e => setSignup('phoneRegion', e.target.value)}
                    className="field-input w-24 shrink-0"
                    placeholder="+91"
                    inputMode="tel"
                    disabled={loading}
                  />
                  <datalist id="phone-region-options">
                    {['+91 IN','+1 US','+44 UK','+61 AU','+81 JP','+49 DE','+33 FR','+65 SG','+971 AE']
                      .map(o => <option key={o} value={o.split(' ')[0]}>{o}</option>)}
                  </datalist>
                  <input
                    id="signup-phone-number"
                    value={signupData.phoneNumber}
                    onChange={e => setSignup('phoneNumber', e.target.value)}
                    placeholder="9876543210"
                    className="field-input flex-1"
                    inputMode="tel"
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-yellow w-full mt-1">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignin} className="flex flex-col gap-4">
              <LabeledInput id="signin-email"    label="Email"    type="email"    value={signinData.email}    onChange={e => setSignin('email', e.target.value)}    placeholder="you@example.com"  disabled={loading} />
              <LabeledInput id="signin-password" label="Password" type="password" value={signinData.password} onChange={e => setSignin('password', e.target.value)} placeholder="Your password"    disabled={loading} />
              <button type="submit" disabled={loading} className="btn-yellow w-full mt-1">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-white/25 text-xs mt-6">
          {mode === 'signup'
            ? <>Already have an account? <button onClick={() => onModeChange('signin')} className="text-brand-yellow hover:underline">Sign in</button></>
            : <>No account? <button onClick={() => onModeChange('signup')} className="text-brand-yellow hover:underline">Sign up free</button></>
          }
        </p>
      </div>
    </main>
  )
}
