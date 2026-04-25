import { useEffect, useMemo, useState } from 'react'
import { inviteTeamMember } from '../../lib/teamsApi'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — manage members and servers' },
  { value: 'operator', label: 'Operator — read/write, no destructive commands' },
  { value: 'viewer', label: 'Viewer — read-only access' },
]

function InviteMemberModal({ isOpen, onClose, teamId, teamServers = [], onInvited }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [selectedServers, setSelectedServers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const token = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null),
    [],
  )

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setRole('viewer')
      setSelectedServers([])
      setError('')
      setBusy(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  function toggleServer(serverId) {
    setSelectedServers((prev) => (
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    ))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!token || !email.trim()) return
    try {
      setBusy(true)
      setError('')
      await inviteTeamMember(token, teamId, {
        email: email.trim(),
        role,
        server_ids: selectedServers,
      })
      onInvited?.()
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Could not send invite')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-panel__header">
          <h3>Invite a teammate</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="invite-form">
          <label>
            Email
            <input
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <div className="invite-form__servers">
            <div className="invite-form__label">Servers shared with this member</div>
            {teamServers.length === 0 ? (
              <p className="invite-form__hint">
                Share servers with the team first, then assign them here.
              </p>
            ) : (
              <>
                {teamServers.map((server) => (
                  <label key={server.server_id} className="invite-form__server">
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(server.server_id)}
                      onChange={() => toggleServer(server.server_id)}
                    />
                    <span>{server.name || server.server_id}</span>
                  </label>
                ))}
                <p className="invite-form__hint">
                  Leave everything unchecked to grant access to all team servers.
                </p>
              </>
            )}
          </div>

          {error ? <p className="invite-form__error">{error}</p> : null}

          <div className="invite-form__actions">
            <button
              type="button"
              className="dashboard-add-btn dashboard-add-btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="dashboard-add-btn"
              disabled={busy || !email.trim()}
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InviteMemberModal
