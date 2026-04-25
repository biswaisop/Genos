import { useMemo, useState } from 'react'

const ROLE_OPTIONS = [
  { value: 'admin',    label: 'Admin',    desc: 'Manage members & servers' },
  { value: 'operator', label: 'Operator', desc: 'Read/write, no destructive' },
  { value: 'viewer',   label: 'Viewer',   desc: 'Read-only access' },
]

function RolePill({ role }) {
  const cls = {
    owner:    'bg-brand-yellow/15 text-brand-yellow  border-brand-yellow/30',
    admin:    'bg-purple-500/15   text-purple-300     border-purple-500/30',
    operator: 'bg-blue-500/15    text-blue-300        border-blue-500/30',
    viewer:   'bg-white/8        text-white/40        border-white/15',
  }[role] || 'bg-white/8 text-white/40 border-white/15'
  return <span className={`pill text-[10px] capitalize ${cls}`}>{role}</span>
}

function initials(name, email, id) {
  const src = name || email || String(id)
  return src.slice(0, 2).toUpperCase()
}

export default function MemberRow({
  member, availableServers, canManage, isOwner, isSelf, onUpdate, onRemove,
}) {
  const [editing, setEditing]     = useState(false)
  const [role, setRole]           = useState(member.role)
  const [selectedServers, setSel] = useState(member.server_ids || [])
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  const serverLabels = useMemo(() => {
    const m = new Map()
    for (const s of availableServers || []) m.set(s.server_id, s.name || s.server_id)
    return m
  }, [availableServers])

  function toggleServer(id) {
    setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setBusy(true); setError('')
    try {
      await onUpdate({ role, server_ids: selectedServers })
      setEditing(false)
    } catch (err) {
      setError(err?.message || 'Failed to update member')
    } finally { setBusy(false) }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${member.name || member.email || 'this member'} from the team?`)) return
    setBusy(true); setError('')
    try { await onRemove() }
    catch (err) { setError(err?.message || 'Failed to remove'); setBusy(false) }
  }

  const canEdit = canManage && !isOwner

  return (
    <div className={`flex flex-col gap-3 p-4 border-b border-white/5 last:border-0
                     ${busy ? 'opacity-60' : ''}`}>
      {/* Top row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10
                          flex items-center justify-center text-xs font-semibold text-white/60 shrink-0">
            {initials(member.name, member.email, member.user_id)}
          </div>
          <div>
            <p className="text-white text-sm font-medium leading-tight">
              {member.name || member.email || member.user_id}
              {isSelf && <span className="text-white/30 ml-1 font-normal">(you)</span>}
            </p>
            {member.email && member.name && (
              <p className="text-white/30 text-xs font-mono">{member.email}</p>
            )}
          </div>
        </div>
        <RolePill role={member.role} />
      </div>

      {/* Server access — view mode */}
      {!editing && (
        <div className="flex flex-wrap gap-1.5 ml-11">
          {(member.server_ids || []).length === 0 ? (
            <span className="text-white/25 text-xs">All team servers</span>
          ) : (
            member.server_ids.map(id => (
              <span key={id} className="pill text-[10px] bg-white/5 text-white/40 border-white/10">
                {serverLabels.get(id) || id}
              </span>
            ))
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="ml-11 flex flex-col gap-4 pt-1">
          {/* Role picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-white/30">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="field-input text-sm w-fit"
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
              ))}
            </select>
          </div>

          {/* Server picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-white/30">
              Server access
            </label>
            {(availableServers || []).length === 0 ? (
              <p className="text-white/25 text-xs">No team servers yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {availableServers.map(s => (
                  <label key={s.server_id}
                    className="flex items-center gap-2.5 cursor-pointer group">
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
                  Leave all unchecked to grant access to every team server.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 ml-11 flex-wrap">
        {canEdit && (
          editing ? (
            <>
              <button onClick={handleSave} disabled={busy} className="btn-yellow text-xs px-3 py-1.5">
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setRole(member.role); setSel(member.server_ids || []); setError('') }}
                disabled={busy}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-ghost text-xs px-3 py-1.5">
              Edit
            </button>
          )
        )}

        {((canManage && !isOwner) || isSelf) && (
          <button
            onClick={handleRemove}
            disabled={busy}
            className="text-xs text-red-400/70 hover:text-red-400 border border-red-500/20
                       hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors
                       disabled:opacity-40"
          >
            {isSelf ? 'Leave team' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  )
}
