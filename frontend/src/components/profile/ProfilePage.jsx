import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getMe, updateMe } from '../../lib/authApi'
import { generateTelegramToken, getTelegramStatus, unlinkTelegram } from '../../lib/telegramApi'

function initialsOf(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return '—' }
}

function TierPill({ tier }) {
  const label = (tier || 'free').toString()
  const cls = label === 'pro'
    ? 'border-brand-yellow/40 bg-brand-yellow/10 text-brand-yellow'
    : label === 'team'
      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
      : 'border-brand-border text-white/40'
  return (
    <span className={`pill ${cls}`}>{label.toUpperCase()}</span>
  )
}

function UsageBar({ used, limit }) {
  const unlimited = limit === -1 || limit == null
  const pct = unlimited ? 100 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="w-full h-2 bg-white/5 border border-brand-border rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-brand-yellow to-yellow-300 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function Card({ label, children }) {
  return (
    <section className="glow-card p-6 flex flex-col gap-5 animate-fade-in">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-white/40">{label}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium tracking-wide uppercase text-white/30">{label}</label>
      {children}
    </div>
  )
}

export default function ProfilePage({ currentUser, onProfileUpdated, onSignOut, onBack }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null

  const [profile, setProfile]       = useState(currentUser || null)
  const [loading, setLoading]       = useState(!currentUser)
  const [error, setError]           = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [saving, setSaving]         = useState(false)
  const [nameDraft, setNameDraft]   = useState(currentUser?.name || '')
  const [phoneDraft, setPhoneDraft] = useState(currentUser?.phone || '')
  const statusTimer = useRef(null)

  // Telegram state
  const [tgLinked, setTgLinked]         = useState(false)
  const [tgUsername, setTgUsername]     = useState(null)
  const [tgConnecting, setTgConnecting] = useState(false)
  const [tgUnlinking, setTgUnlinking]   = useState(false)
  const [tgMessage, setTgMessage]       = useState('')
  const tgPollRef = useRef(null)

  const applyProfile = useCallback((next) => {
    setProfile(next)
    setNameDraft(next?.name || '')
    setPhoneDraft(next?.phone || '')
  }, [])

  // Load profile
  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    getMe(token)
      .then(d => { if (!cancelled) applyProfile(d) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Could not load profile.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, applyProfile])

  // Cleanup
  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current)
    if (tgPollRef.current) clearInterval(tgPollRef.current)
  }, [])

  // Telegram initial status
  useEffect(() => {
    if (!token) return
    getTelegramStatus(token)
      .then(s => { setTgLinked(s.linked); setTgUsername(s.username) })
      .catch(() => {})
  }, [token])

  const dirty = useMemo(() => {
    if (!profile) return false
    return (nameDraft || '').trim() !== (profile.name || '').trim() ||
           (phoneDraft || '').trim() !== (profile.phone || '').trim()
  }, [profile, nameDraft, phoneDraft])

  const handleSave = useCallback(async () => {
    if (!token || !dirty) return
    const name = (nameDraft || '').trim()
    if (!name) { setError('Name cannot be empty.'); return }
    try {
      setSaving(true); setError('')
      const updated = await updateMe(token, { name, phone: (phoneDraft || '').trim() || null })
      applyProfile(updated)
      setSaveStatus('Saved!')
      if (onProfileUpdated) onProfileUpdated(updated)
      if (statusTimer.current) clearTimeout(statusTimer.current)
      statusTimer.current = setTimeout(() => setSaveStatus(''), 2400)
    } catch (e) { setError(e?.message || 'Could not save.') }
    finally { setSaving(false) }
  }, [token, dirty, nameDraft, phoneDraft, applyProfile, onProfileUpdated])

  const handleCancel = useCallback(() => {
    if (!profile) return
    setNameDraft(profile.name || '')
    setPhoneDraft(profile.phone || '')
    setError('')
  }, [profile])

  const handleTgConnect = useCallback(async () => {
    if (!token || tgConnecting) return
    setTgConnecting(true); setTgMessage('')
    try {
      const { deep_link } = await generateTelegramToken(token)
      window.open(deep_link, '_blank', 'noopener,noreferrer')
      setTgMessage('Telegram opened — click START in the bot to complete linking.')
      let elapsed = 0
      tgPollRef.current = setInterval(async () => {
        elapsed += 3
        try {
          const s = await getTelegramStatus(token)
          if (s.linked) {
            setTgLinked(true); setTgUsername(s.username); setTgMessage('')
            clearInterval(tgPollRef.current); setTgConnecting(false)
          }
        } catch { /* ignore */ }
        if (elapsed >= 120) { clearInterval(tgPollRef.current); setTgConnecting(false); setTgMessage('Timed out. Try again.') }
      }, 3000)
    } catch (e) { setTgMessage(e?.message || 'Failed to start linking.'); setTgConnecting(false) }
  }, [token, tgConnecting])

  const handleTgUnlink = useCallback(async () => {
    if (!token || tgUnlinking) return
    setTgUnlinking(true); setTgMessage('')
    try {
      await unlinkTelegram(token)
      setTgLinked(false); setTgUsername(null)
      setTgMessage('Telegram disconnected.')
      setTimeout(() => setTgMessage(''), 2400)
    } catch (e) { setTgMessage(e?.message || 'Failed to disconnect.') }
    finally { setTgUnlinking(false) }
  }, [token, tgUnlinking])

  if (!token) return (
    <main className="flex-1 flex items-center justify-center">
      <p className="text-white/40">Session expired. Please sign in again.</p>
    </main>
  )

  if (loading && !profile) return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-48 rounded-xl bg-white/5 animate-shimmer" />
        ))}
      </div>
    </main>
  )

  const subscription = profile?.subscription || {}
  const usage        = profile?.usage || {}
  const settings     = profile?.settings || {}
  const unlimited    = usage.commands_limit === -1

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-6 py-8 flex flex-col gap-6">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => onBack?.()} className="btn-ghost text-sm px-3 py-1.5">
          ← Dashboard
        </button>
        <button onClick={() => onSignOut?.()} className="text-sm text-red-400/80 border border-red-500/30
                                                          px-3 py-1.5 rounded-full hover:bg-red-500/10 transition-colors">
          Sign out
        </button>
      </div>

      {/* Avatar + name */}
      <header className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-brand-yellow flex items-center justify-center
                        text-black font-bold text-2xl font-mono shadow-yellow-glow shrink-0">
          {initialsOf(profile?.name)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{profile?.name || 'Unnamed user'}</h1>
          <p className="text-white/40 text-sm font-mono">{profile?.email}</p>
        </div>
      </header>

      {error ? (
        <div className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Account */}
        <Card label="Account">
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-xs uppercase tracking-widest">Details</span>
            {saveStatus ? <span className="text-green-400 text-xs">{saveStatus}</span> : null}
          </div>

          <Field label="Name">
            <input
              id="profile-name"
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              disabled={saving}
              className="field-input"
              maxLength={100}
            />
          </Field>

          <Field label="Phone">
            <input
              id="profile-phone"
              type="tel"
              value={phoneDraft}
              onChange={e => setPhoneDraft(e.target.value)}
              disabled={saving}
              placeholder="Add a phone number"
              className="field-input"
            />
          </Field>

          <Field label="Email">
            <p className="text-white font-mono text-sm">{profile?.email}</p>
          </Field>

          <Field label="Member since">
            <p className="text-white/60 text-sm">{formatDate(profile?.created_at)}</p>
          </Field>

          {dirty ? (
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={handleCancel} disabled={saving} className="btn-ghost text-sm px-3 py-1.5">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !nameDraft.trim()} className="btn-yellow text-sm px-4 py-1.5">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : null}
        </Card>

        {/* Subscription */}
        <Card label="Subscription">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold capitalize">{subscription.status || 'Active'}</span>
            <TierPill tier={subscription.tier} />
          </div>
          {subscription.current_period_end ? (
            <Field label="Renews">
              <p className="text-white/60 text-sm">{formatDate(subscription.current_period_end)}</p>
            </Field>
          ) : null}
          {subscription.cancel_at_period_end ? (
            <div className="text-yellow-400/80 bg-yellow-400/8 border border-yellow-400/25 rounded-lg px-3 py-2 text-xs">
              Plan scheduled to cancel at period end.
            </div>
          ) : null}
        </Card>

        {/* Usage */}
        <Card label="Usage this month">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold font-mono text-white">{usage.commands_this_month ?? 0}</span>
            <span className="text-white/30">/</span>
            <span className="text-white/50 text-lg font-mono">{unlimited ? '∞' : usage.commands_limit ?? 0}</span>
            <span className="text-white/30 text-xs uppercase tracking-widest ml-1">commands</span>
          </div>
          <UsageBar used={usage.commands_this_month} limit={usage.commands_limit} />
          <p className="text-white/30 text-xs">Resets {formatDate(usage.reset_date)}</p>
        </Card>

        {/* Preferences */}
        <Card label="Preferences">
          <Field label="Default server">
            <p className="text-white/60 text-sm font-mono">{settings.default_server_id || '—'}</p>
          </Field>
          <Field label="Confirm destructive">
            <p className="text-white/60 text-sm">{settings.confirm_destructive === false ? 'Disabled' : 'Enabled'}</p>
          </Field>
          <Field label="Response verbosity">
            <p className="text-white/60 text-sm capitalize">{settings.response_verbosity || 'normal'}</p>
          </Field>
        </Card>

        {/* Telegram integration — spans full width */}
        <div className="md:col-span-2">
          <Card label="Integrations">
            <div className="flex items-start gap-5 p-1">
              {/* Telegram icon */}
              <div className="w-12 h-12 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/25
                              flex items-center justify-center shrink-0 text-2xl">
                ✈️
              </div>

              <div className="flex-1 flex flex-col gap-3">
                <div>
                  <h3 className="text-white font-semibold text-sm">Telegram</h3>
                  {tgLinked ? (
                    <p className="text-green-400 text-sm mt-0.5">
                      ✅ Connected{tgUsername ? ` as ${tgUsername}` : ''}
                    </p>
                  ) : (
                    <p className="text-white/40 text-sm mt-0.5">
                      Receive alerts and chat with your servers via Telegram bot.
                    </p>
                  )}
                </div>

                {tgLinked && (
                  <p className="text-white/30 text-xs">
                    Send <code>/servers</code> to your bot to get started.
                  </p>
                )}

                {tgMessage && (
                  <div className="text-yellow-400/80 bg-yellow-400/8 border border-yellow-400/20
                                  rounded-lg px-3 py-2 text-xs leading-relaxed">
                    {tgMessage}
                  </div>
                )}

                <div className="flex gap-2">
                  {tgLinked ? (
                    <button
                      id="telegram-disconnect-btn"
                      onClick={handleTgUnlink}
                      disabled={tgUnlinking}
                      className="btn-ghost text-sm px-4 py-1.5"
                    >
                      {tgUnlinking ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      id="telegram-connect-btn"
                      onClick={handleTgConnect}
                      disabled={tgConnecting}
                      className="btn-yellow text-sm px-5 py-1.5"
                    >
                      {tgConnecting ? 'Waiting for link…' : 'Connect Telegram'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </main>
  )
}
