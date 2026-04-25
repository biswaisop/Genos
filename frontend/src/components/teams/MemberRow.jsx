import { useMemo, useState } from 'react'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
]

function MemberRow({
  member,
  availableServers,
  canManage,
  isOwner,
  isSelf,
  onUpdate,
  onRemove,
}) {
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState(member.role)
  const [selectedServers, setSelectedServers] = useState(member.server_ids || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const serverLabels = useMemo(() => {
    const map = new Map()
    for (const server of availableServers || []) {
      map.set(server.server_id, server.name || server.server_id)
    }
    return map
  }, [availableServers])

  function toggleServer(serverId) {
    setSelectedServers((prev) => (
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    ))
  }

  async function handleSave() {
    setBusy(true)
    setError('')
    try {
      await onUpdate({
        role,
        server_ids: selectedServers,
      })
      setEditing(false)
    } catch (err) {
      setError(err?.message || 'Failed to update member')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${member.name || member.email || 'this member'} from the team?`)) return
    setBusy(true)
    setError('')
    try {
      await onRemove()
    } catch (err) {
      setError(err?.message || 'Failed to remove member')
      setBusy(false)
    }
  }

  const canEdit = canManage && !isOwner

  return (
    <div className="team-member-row">
      <div className="team-member-row__info">
        <div className="team-member-row__name">
          {member.name || member.email || member.user_id}
          {isSelf ? <span className="team-member-row__self"> (you)</span> : null}
        </div>
        <div className="team-member-row__meta">
          <span className={`team-role-pill team-role-pill--${member.role}`}>
            {member.role}
          </span>
          {member.email ? <span>{member.email}</span> : null}
        </div>
      </div>

      {!editing ? (
        <div className="team-member-row__servers">
          {(member.server_ids || []).length === 0 ? (
            <span className="team-member-row__all">All team servers</span>
          ) : (
            member.server_ids.map((id) => (
              <span key={id} className="team-server-chip" title={id}>
                {serverLabels.get(id) || id}
              </span>
            ))
          )}
        </div>
      ) : (
        <div className="team-member-row__edit">
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <div className="team-member-row__server-picker">
            <div className="team-member-row__server-picker-label">Servers</div>
            {(availableServers || []).length === 0 ? (
              <div className="team-member-row__empty">No team servers yet.</div>
            ) : (
              (availableServers || []).map((server) => (
                <label key={server.server_id} className="team-member-row__server-opt">
                  <input
                    type="checkbox"
                    checked={selectedServers.includes(server.server_id)}
                    onChange={() => toggleServer(server.server_id)}
                  />
                  {server.name || server.server_id}
                </label>
              ))
            )}
            <p className="team-member-row__hint">
              Leave all unchecked to grant access to every team server.
            </p>
          </div>
          {error ? <div className="team-member-row__error">{error}</div> : null}
        </div>
      )}

      <div className="team-member-row__actions">
        {canEdit ? (
          editing ? (
            <>
              <button
                type="button"
                className="dashboard-add-btn"
                disabled={busy}
                onClick={handleSave}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="dashboard-add-btn dashboard-add-btn--ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(false)
                  setRole(member.role)
                  setSelectedServers(member.server_ids || [])
                  setError('')
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="dashboard-add-btn dashboard-add-btn--ghost"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )
        ) : null}

        {(canManage && !isOwner) || isSelf ? (
          <button
            type="button"
            className="dashboard-add-btn dashboard-add-btn--danger"
            disabled={busy}
            onClick={handleRemove}
          >
            {isSelf ? 'Leave team' : 'Remove'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default MemberRow
