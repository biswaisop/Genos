import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addTeamServer, deleteTeam, getTeam,
  removeTeamMember, removeTeamServer, updateTeamMember,
} from '../../lib/teamsApi'
import { listServers } from '../../lib/serverApi'
import InviteMemberModal from './InviteMemberModal'
import MemberRow from './MemberRow'

function RolePill({ role }) {
  const cls = {
    owner:    'bg-brand-yellow/15 text-brand-yellow  border-brand-yellow/30',
    admin:    'bg-purple-500/15   text-purple-300     border-purple-500/30',
    operator: 'bg-blue-500/15    text-blue-300        border-blue-500/30',
    viewer:   'bg-white/8        text-white/40        border-white/15',
  }[role] || 'bg-white/8 text-white/40 border-white/15'
  return <span className={`pill text-[10px] capitalize ${cls}`}>{role}</span>
}

export default function TeamDetailPage({ teamId, currentUser, onBack }) {
  const [team, setTeam]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [allServers, setAllServers] = useState([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingServer, setPendingServer] = useState('')
  const [actionError, setActionError]     = useState('')

  const token = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null),
    [],
  )

  const refresh = useCallback(async () => {
    if (!token || !teamId) return
    try {
      setLoading(true)
      const [teamData, servers] = await Promise.all([
        getTeam(token, teamId),
        listServers(token).catch(() => []),
      ])
      setTeam(teamData)
      setAllServers(Array.isArray(servers) ? servers : [])
      setError('')
    } catch (err) {
      setError(err?.message || 'Failed to load team')
    } finally { setLoading(false) }
  }, [token, teamId])

  useEffect(() => { refresh() }, [refresh])

  const myRole   = team?.my_role
  const canManage = myRole === 'owner' || myRole === 'admin'
  const isOwner   = myRole === 'owner'

  const teamServers = useMemo(() => {
    if (!team) return []
    const ids = new Set(team.server_ids || [])
    return allServers.filter(s => ids.has(s.server_id))
  }, [team, allServers])

  const shareableServers = useMemo(() => {
    if (!team) return []
    const teamIds = new Set(team.server_ids || [])
    return allServers.filter(s => !teamIds.has(s.server_id) && (s.role === 'personal' || s.role === 'owner'))
  }, [team, allServers])

  async function handleMemberUpdate(userId, payload) {
    setActionError('')
    await updateTeamMember(token, teamId, userId, payload)
    await refresh()
  }

  async function handleMemberRemove(userId) {
    setActionError('')
    try {
      await removeTeamMember(token, teamId, userId)
      if (String(userId) === String(currentUser?.id) && onBack) { onBack(); return }
      await refresh()
    } catch (err) { setActionError(err?.message || 'Failed to remove member') }
  }

  async function handleAddServer(e) {
    e.preventDefault()
    if (!pendingServer) return
    setActionError('')
    try {
      await addTeamServer(token, teamId, pendingServer)
      setPendingServer('')
      await refresh()
    } catch (err) { setActionError(err?.message || 'Failed to share server') }
  }

  async function handleRemoveServer(serverId) {
    if (!window.confirm('Unshare this server from the team?')) return
    setActionError('')
    try { await removeTeamServer(token, teamId, serverId); await refresh() }
    catch (err) { setActionError(err?.message || 'Failed to unshare server') }
  }

  async function handleDeleteTeam() {
    if (!window.confirm('Delete this team? Shared servers will be unlinked.')) return
    try { await deleteTeam(token, teamId); onBack?.() }
    catch (err) { setActionError(err?.message || 'Failed to delete team') }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading && !team) return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-10">
      <div className="flex flex-col gap-4">
        {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-white/5 animate-shimmer" />)}
      </div>
    </main>
  )

  if (error && !team) return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-white">Team unavailable</h1>
      <p className="text-red-400">{error}</p>
      {onBack && <button onClick={onBack} className="btn-ghost text-sm px-4 py-2 w-fit">← Back to teams</button>}
    </main>
  )

  if (!team) return null

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-10 text-left animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-yellow/10 border border-brand-yellow/20
                          flex items-center justify-center text-brand-yellow font-bold text-xl shrink-0">
            {team.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{team.name}</h1>
              <RolePill role={myRole} />
            </div>
            <p className="text-white/35 text-sm mt-0.5">
              {team.members.length} member{team.members.length !== 1 ? 's' : ''} ·{' '}
              {team.server_ids.length} server{team.server_ids.length !== 1 ? 's' : ''} shared
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button onClick={onBack} className="btn-ghost text-sm px-4 py-2">← Back</button>
          )}
          {canManage && (
            <button onClick={() => setInviteOpen(true)} className="btn-yellow text-sm px-4 py-2">
              + Invite member
            </button>
          )}
          {isOwner && (
            <button
              onClick={handleDeleteTeam}
              className="text-sm text-red-400/70 hover:text-red-400 border border-red-500/20
                         hover:border-red-500/40 px-4 py-2 rounded-lg transition-colors"
            >
              Delete team
            </button>
          )}
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      {/* Members */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Members — {team.members.length}
        </h2>
        <div className="glow-card overflow-hidden divide-y divide-white/5">
          {team.members.map(member => (
            <MemberRow
              key={member.user_id}
              member={member}
              availableServers={teamServers}
              canManage={canManage}
              isOwner={String(member.user_id) === String(team.owner_id)}
              isSelf={String(member.user_id) === String(currentUser?.id)}
              onUpdate={payload => handleMemberUpdate(member.user_id, payload)}
              onRemove={() => handleMemberRemove(member.user_id)}
            />
          ))}
        </div>
      </section>

      {/* Shared servers */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Shared servers — {teamServers.length}
        </h2>

        {/* Add server form */}
        {canManage && shareableServers.length > 0 && (
          <form onSubmit={handleAddServer} className="flex gap-3">
            <select
              value={pendingServer}
              onChange={e => setPendingServer(e.target.value)}
              className="field-input flex-1 text-sm"
            >
              <option value="">Select one of your servers to share…</option>
              {shareableServers.map(s => (
                <option key={s.server_id} value={s.server_id}>
                  {s.name || s.server_id}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!pendingServer} className="btn-yellow text-sm px-4 py-2 shrink-0">
              Share
            </button>
          </form>
        )}

        {teamServers.length === 0 ? (
          <div className="glow-card p-8 flex flex-col items-center gap-3 text-center">
            <div className="text-3xl">🖥️</div>
            <p className="text-white/40 text-sm">
              No servers shared yet.
              {canManage ? ' Pick one above to share with the team.' : ''}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {teamServers.map(server => (
              <div key={server.server_id} className="glow-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-white font-semibold text-sm">{server.name || server.server_id}</p>
                    <p className="text-white/30 text-xs font-mono mt-0.5">{server.host || 'No host'}</p>
                  </div>
                  <span className={`pill text-[10px] shrink-0 ${
                    server.status === 'connected'
                      ? 'bg-green-500/12 text-green-400 border-green-500/25'
                      : 'bg-white/8 text-white/35 border-white/15'
                  }`}>
                    {server.status || 'unknown'}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemoveServer(server.server_id)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors text-left"
                  >
                    Unshare
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <InviteMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        teamId={teamId}
        teamServers={teamServers}
        onInvited={refresh}
      />
    </main>
  )
}
