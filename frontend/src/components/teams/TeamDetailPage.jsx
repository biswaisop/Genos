import { useCallback, useEffect, useMemo, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import {
  addTeamServer,
  deleteTeam,
  getTeam,
  removeTeamMember,
  removeTeamServer,
  updateTeamMember,
} from '../../lib/teamsApi'
import { listServers } from '../../lib/serverApi'
import InviteMemberModal from './InviteMemberModal'
import MemberRow from './MemberRow'

function TeamDetailPage({ teamId, currentUser, onBack }) {
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [allServers, setAllServers] = useState([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingServer, setPendingServer] = useState('')
  const [actionError, setActionError] = useState('')

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
    } finally {
      setLoading(false)
    }
  }, [token, teamId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const myRole = team?.my_role
  const canManage = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'

  const teamServers = useMemo(() => {
    if (!team) return []
    const ids = new Set(team.server_ids || [])
    return allServers.filter((s) => ids.has(s.server_id))
  }, [team, allServers])

  const shareableServers = useMemo(() => {
    if (!team) return []
    const teamIds = new Set(team.server_ids || [])
    return allServers.filter(
      (s) => !teamIds.has(s.server_id) && (s.role === 'personal' || s.role === 'owner'),
    )
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
      if (String(userId) === String(currentUser?.id) && onBack) {
        onBack()
        return
      }
      await refresh()
    } catch (err) {
      setActionError(err?.message || 'Failed to remove member')
    }
  }

  async function handleAddServer(event) {
    event.preventDefault()
    if (!pendingServer) return
    setActionError('')
    try {
      await addTeamServer(token, teamId, pendingServer)
      setPendingServer('')
      await refresh()
    } catch (err) {
      setActionError(err?.message || 'Failed to share server')
    }
  }

  async function handleRemoveServer(serverId) {
    if (!window.confirm('Unshare this server from the team?')) return
    setActionError('')
    try {
      await removeTeamServer(token, teamId, serverId)
      await refresh()
    } catch (err) {
      setActionError(err?.message || 'Failed to unshare server')
    }
  }

  async function handleDeleteTeam() {
    if (!window.confirm('Delete this team? Shared servers will be unlinked.')) return
    try {
      await deleteTeam(token, teamId)
      onBack?.()
    } catch (err) {
      setActionError(err?.message || 'Failed to delete team')
    }
  }

  if (loading && !team) {
    return (
      <main className="dashboard-main">
        <section className="dashboard-header">
          <h1>Loading team…</h1>
        </section>
      </main>
    )
  }

  if (error && !team) {
    return (
      <main className="dashboard-main">
        <section className="dashboard-header">
          <h1>Team unavailable</h1>
          <p>{error}</p>
          {onBack ? (
            <button type="button" className="dashboard-add-btn" onClick={onBack}>
              Back to teams
            </button>
          ) : null}
        </section>
      </main>
    )
  }

  if (!team) return null

  return (
    <main className="dashboard-main">
      <section className="dashboard-header team-detail-header">
        <div>
          <h1>{team.name}</h1>
          <p>
            {team.members.length} member{team.members.length === 1 ? '' : 's'} ·{' '}
            {team.server_ids.length} server{team.server_ids.length === 1 ? '' : 's'} shared
          </p>
        </div>
        <div className="team-detail-header__actions">
          {onBack ? (
            <button type="button" className="dashboard-add-btn dashboard-add-btn--ghost" onClick={onBack}>
              Back
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="dashboard-add-btn" onClick={() => setInviteOpen(true)}>
              + Invite member
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="dashboard-add-btn dashboard-add-btn--danger" onClick={handleDeleteTeam}>
              Delete team
            </button>
          ) : null}
        </div>
      </section>

      {actionError ? <p className="dashboard-feedback">{actionError}</p> : null}

      <section className="dashboard-connections" aria-label="Team members">
        <div className="dashboard-connections__heading">
          <h2>Members</h2>
        </div>

        <BorderGlow as="div" className="team-members-card" glowColor="48 100% 54%">
          {team.members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              availableServers={teamServers}
              canManage={canManage}
              isOwner={String(member.user_id) === String(team.owner_id)}
              isSelf={String(member.user_id) === String(currentUser?.id)}
              onUpdate={(payload) => handleMemberUpdate(member.user_id, payload)}
              onRemove={() => handleMemberRemove(member.user_id)}
            />
          ))}
        </BorderGlow>
      </section>

      <section className="dashboard-connections" aria-label="Team servers">
        <div className="dashboard-connections__heading">
          <h2>Shared servers</h2>
        </div>

        {canManage ? (
          <form className="team-add-server" onSubmit={handleAddServer}>
            <select
              value={pendingServer}
              onChange={(event) => setPendingServer(event.target.value)}
            >
              <option value="">Select a server you own…</option>
              {shareableServers.map((server) => (
                <option key={server.server_id} value={server.server_id}>
                  {server.name || server.server_id}
                </option>
              ))}
            </select>
            <button type="submit" className="dashboard-add-btn" disabled={!pendingServer}>
              Share with team
            </button>
          </form>
        ) : null}

        {teamServers.length === 0 ? (
          <p className="dashboard-feedback">
            No servers shared yet. {canManage ? 'Pick one above to share it with the team.' : ''}
          </p>
        ) : (
          <div className="dashboard-grid">
            {teamServers.map((server) => (
              <BorderGlow
                key={server.server_id}
                as="article"
                className="dashboard-connection-card"
                glowColor="48 100% 54%"
              >
                <div className="dashboard-connection-top">
                  <h3>{server.name || server.server_id}</h3>
                  {canManage ? (
                    <button
                      type="button"
                      className="dashboard-add-btn dashboard-add-btn--ghost dashboard-add-btn--sm"
                      onClick={() => handleRemoveServer(server.server_id)}
                    >
                      Unshare
                    </button>
                  ) : null}
                </div>
                <ul className="connection-details">
                  <li>Host: {server.host || 'N/A'}</li>
                  <li>Status: {server.status}</li>
                </ul>
              </BorderGlow>
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

export default TeamDetailPage
