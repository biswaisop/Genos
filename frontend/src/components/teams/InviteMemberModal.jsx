import { useEffect, useMemo, useState } from 'react'
import { inviteTeamMember } from '../../lib/teamsApi'

const ROLE_OPTIONS = [
  { value: 'admin',    label: 'Admin',    desc: 'Manage members & servers' },
  { value: 'operator', label: 'Operator', desc: 'Read/write, no destructive' },
  { value: 'viewer',   label: 'Viewer',   desc: 'Read-only access' },
]

export default function InviteMemberModal({ isOpen, onClose, teamId, teamServers = [], onInvited }) {
  const [email, setEmail]           = useState('')
  const [role, setRole]             = useState('viewer')
  const [selectedServers, setSel]   = useState([])
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')
  const token = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null),
    [],
  )

  useEffect(() => {
    if (!isOpen) { setEmail(''); setRole('viewer'); setSel([]); setError(''); setBusy(false) }
  }, [isOpen])

  if (!isOpen) return null

  function toggleServer(id) {
    setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token || !email.trim()) return
    try {
      setBusy(true); setError('')
      await inviteTeamMember(token, teamId, { email: email.trim(), role, server_ids: selectedServers })
      onInvited?.(); onClose?.()
    } catch (err) {
      setError(err?.message || 'Could not send invite')
    } finally { setBusy(false) }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="glow-card w-full max-w-md animate-fade-in flex flex-col gap-5 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">Invite a teammate</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40
                       hover:bg-white/8 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email"
              className="text-xs font-medium uppercase tracking-wide text-white/30">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="field-input"
            />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-role"
              className="text-xs font-medium uppercase tracking-wide text-white/30">
              Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRole(o.value)}
                  className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left
                              transition-all duration-150 ${
                    role === o.value
                      ? 'border-brand-yellow/50 bg-brand-yellow/10 text-brand-yellow'
                      : 'border-brand-border bg-brand-black-raised text-white/50 hover:border-white/20'
                  }`}
                >
                  <span className="font-semibold text-sm">{o.label}</span>
                  <span className={`text-[10px] leading-snug ${
                    role === o.value ? 'text-brand-yellow/70' : 'text-white/30'
                  }`}>{o.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Server access */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-white/30">
              Server access
            </label>
            {teamServers.length === 0 ? (
              <p className="text-white/25 text-xs py-2">
                Share servers with the team first.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1">
                {teamServers.map(s => (
                  <label key={s.server_id} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(s.server_id)}
                      onChange={() => toggleServer(s.server_id)}
                      className="accent-brand-yellow"
                    />
                    <span className="text-white/60 text-sm group-hover:text-white transition-colors">
                      {s.name || s.server_id}
                    </span>
                  </label>
                ))}
                <p className="text-white/25 text-xs mt-1">
                  Leave all unchecked to grant access to all team servers.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg
                          px-3 py-2 text-sm">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="btn-ghost text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" disabled={busy || !email.trim()} className="btn-yellow text-sm px-5 py-2">
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
