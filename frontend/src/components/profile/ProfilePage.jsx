import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import { getMe, updateMe } from '../../lib/authApi'
import './ProfilePage.css'

function initialsOf(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function TierPill({ tier }) {
  const label = (tier || 'free').toString()
  return (
    <span className={`profile-tier-pill profile-tier-pill--${label}`}>
      {label.toUpperCase()}
    </span>
  )
}

function UsageBar({ used, limit }) {
  const unlimited = limit === -1 || limit === undefined || limit === null
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0
  const safeLimit = unlimited ? 0 : Math.max(0, Number(limit) || 0)
  const pct = unlimited
    ? 100
    : safeLimit > 0
      ? Math.min(100, Math.round((safeUsed / safeLimit) * 100))
      : 0
  return (
    <div className="profile-usage-bar" aria-label="Command usage this month">
      <div
        className="profile-usage-bar__fill"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ProfilePage({ currentUser, onProfileUpdated, onSignOut, onBack }) {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('genos_access_token')
      : null

  const [profile, setProfile] = useState(currentUser || null)
  const [loading, setLoading] = useState(!currentUser)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameDraft, setNameDraft] = useState(currentUser?.name || '')
  const [phoneDraft, setPhoneDraft] = useState(currentUser?.phone || '')
  const statusTimerRef = useRef(null)

  const applyProfile = useCallback((next) => {
    setProfile(next)
    setNameDraft(next?.name || '')
    setPhoneDraft(next?.phone || '')
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getMe(token)
        if (cancelled) return
        applyProfile(data)
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Could not load profile.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, applyProfile])

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  const dirty = useMemo(() => {
    if (!profile) return false
    const name = (nameDraft || '').trim()
    const phone = (phoneDraft || '').trim()
    const currentName = (profile.name || '').trim()
    const currentPhone = (profile.phone || '').trim()
    return name !== currentName || phone !== currentPhone
  }, [profile, nameDraft, phoneDraft])

  const handleSave = useCallback(async () => {
    if (!token || !dirty) return
    const trimmedName = (nameDraft || '').trim()
    if (!trimmedName) {
      setError('Name cannot be empty.')
      return
    }
    const payload = { name: trimmedName }
    const trimmedPhone = (phoneDraft || '').trim()
    payload.phone = trimmedPhone || null
    try {
      setSaving(true)
      setError('')
      const updated = await updateMe(token, payload)
      applyProfile(updated)
      setSaveStatus('Profile saved.')
      if (onProfileUpdated) onProfileUpdated(updated)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      statusTimerRef.current = setTimeout(() => setSaveStatus(''), 2400)
    } catch (err) {
      setError(err?.message || 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }, [token, dirty, nameDraft, phoneDraft, applyProfile, onProfileUpdated])

  const handleCancel = useCallback(() => {
    if (!profile) return
    setNameDraft(profile.name || '')
    setPhoneDraft(profile.phone || '')
    setError('')
  }, [profile])

  if (!token) {
    return (
      <main className="profile-page">
        <div className="profile-page__error">Session expired. Please sign in again.</div>
      </main>
    )
  }

  if (loading && !profile) {
    return (
      <main className="profile-page">
        <div className="profile-page__skeletons">
          <BorderGlow as="div" className="profile-page__skeleton" glowColor="48 100% 54%" />
          <BorderGlow as="div" className="profile-page__skeleton" glowColor="48 100% 54%" />
          <BorderGlow as="div" className="profile-page__skeleton" glowColor="48 100% 54%" />
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="profile-page">
        <div className="profile-page__error">{error || 'Profile unavailable.'}</div>
        <button type="button" className="profile-page__back" onClick={() => onBack && onBack()}>
          ← Back to Dashboard
        </button>
      </main>
    )
  }

  const subscription = profile.subscription || {}
  const usage = profile.usage || {}
  const settings = profile.settings || {}
  const unlimited = usage.commands_limit === -1

  return (
    <main className="profile-page">
      <div className="profile-page__topbar">
        <button
          type="button"
          className="profile-page__back"
          onClick={() => onBack && onBack()}
        >
          ← Back to Dashboard
        </button>
        <button
          type="button"
          className="profile-page__signout"
          onClick={() => onSignOut && onSignOut()}
        >
          Sign out
        </button>
      </div>

      <header className="profile-page__header">
        <div className="profile-avatar" aria-hidden="true">
          {initialsOf(profile.name)}
        </div>
        <div className="profile-page__identity">
          <h1 className="profile-page__name">{profile.name || 'Unnamed user'}</h1>
          <p className="profile-page__email">{profile.email}</p>
        </div>
      </header>

      {error ? <div className="profile-page__error">{error}</div> : null}

      <section className="profile-page__grid">
        <BorderGlow
          as="section"
          className="profile-card"
          glowColor="48 100% 54%"
          aria-label="Account details"
        >
          <header className="profile-card__head">
            <h2>Account</h2>
            {saveStatus ? (
              <span className="profile-card__status">{saveStatus}</span>
            ) : null}
          </header>

          <div className="profile-field">
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              disabled={saving}
              autoComplete="name"
              maxLength={100}
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-phone">Phone</label>
            <input
              id="profile-phone"
              type="tel"
              value={phoneDraft}
              onChange={(event) => setPhoneDraft(event.target.value)}
              disabled={saving}
              placeholder="Add a phone number"
              autoComplete="tel"
              maxLength={32}
            />
          </div>

          <div className="profile-field">
            <label>Email</label>
            <div className="profile-field__readonly">{profile.email}</div>
          </div>

          <div className="profile-field">
            <label>Member since</label>
            <div className="profile-field__readonly">
              {formatDate(profile.created_at)}
            </div>
          </div>

          {dirty ? (
            <div className="profile-card__actions">
              <button
                type="button"
                className="profile-btn profile-btn--ghost"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="profile-btn profile-btn--primary"
                onClick={handleSave}
                disabled={saving || !nameDraft.trim()}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : null}
        </BorderGlow>

        <BorderGlow
          as="section"
          className="profile-card"
          glowColor="48 100% 54%"
          aria-label="Subscription"
        >
          <header className="profile-card__head">
            <h2>Subscription</h2>
            <TierPill tier={subscription.tier} />
          </header>

          <div className="profile-field">
            <label>Status</label>
            <div className="profile-field__readonly profile-field__readonly--capitalize">
              {subscription.status || 'active'}
            </div>
          </div>

          {subscription.current_period_end ? (
            <div className="profile-field">
              <label>Renews</label>
              <div className="profile-field__readonly">
                {formatDate(subscription.current_period_end)}
              </div>
            </div>
          ) : null}

          {subscription.cancel_at_period_end ? (
            <div className="profile-subscription-note">
              Your plan is scheduled to cancel at the end of the period.
            </div>
          ) : null}
        </BorderGlow>

        <BorderGlow
          as="section"
          className="profile-card"
          glowColor="48 100% 54%"
          aria-label="Usage"
        >
          <header className="profile-card__head">
            <h2>Usage this month</h2>
          </header>

          <div className="profile-usage-row">
            <span className="profile-usage-value">
              {usage.commands_this_month ?? 0}
            </span>
            <span className="profile-usage-divider">/</span>
            <span className="profile-usage-limit">
              {unlimited ? 'Unlimited' : usage.commands_limit ?? 0}
            </span>
            <span className="profile-usage-label">commands</span>
          </div>

          <UsageBar used={usage.commands_this_month} limit={usage.commands_limit} />

          <p className="profile-usage-reset">
            Resets {formatDate(usage.reset_date)}
          </p>
        </BorderGlow>

        <BorderGlow
          as="section"
          className="profile-card"
          glowColor="48 100% 54%"
          aria-label="Preferences"
        >
          <header className="profile-card__head">
            <h2>Preferences</h2>
          </header>

          <div className="profile-field">
            <label>Default server</label>
            <div className="profile-field__readonly">
              {settings.default_server_id || 'Not set'}
            </div>
          </div>

          <div className="profile-field">
            <label>Confirm destructive commands</label>
            <div className="profile-field__readonly">
              {settings.confirm_destructive === false ? 'Disabled' : 'Enabled'}
            </div>
          </div>

          <div className="profile-field">
            <label>Response verbosity</label>
            <div className="profile-field__readonly profile-field__readonly--capitalize">
              {settings.response_verbosity || 'normal'}
            </div>
          </div>
        </BorderGlow>
      </section>
    </main>
  )
}

export default ProfilePage
