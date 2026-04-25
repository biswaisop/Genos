import { useEffect, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import { createTeam, listTeams } from '../../lib/teamsApi'

function TeamsPage({ onOpenTeam, onBack }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [createError, setCreateError] = useState('')
  const token = typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null

  async function refresh() {
    if (!token) {
      setError('Please sign in to view teams.')
      return
    }
    try {
      setLoading(true)
      const data = await listTeams(token)
      setTeams(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err?.message || 'Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    if (!token || !name.trim()) return
    try {
      setCreating(true)
      setCreateError('')
      const team = await createTeam(token, { name: name.trim() })
      setName('')
      await refresh()
      if (team?.id && onOpenTeam) onOpenTeam(team.id)
    } catch (err) {
      setCreateError(err?.message || 'Could not create team')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="dashboard-main">
      <section className="dashboard-header">
        <h1>Teams</h1>
        <p>Group teammates together, share servers, and assign role-based clearance levels.</p>
      </section>

      <section className="teams-create">
        <BorderGlow as="article" className="teams-create-card" glowColor="48 100% 54%">
          <h2>Create a team</h2>
          <form onSubmit={handleCreate} className="teams-create-form">
            <label htmlFor="team-name">Team name</label>
            <input
              id="team-name"
              type="text"
              placeholder="e.g. Platform, Ops, SRE"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" className="dashboard-add-btn" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create team'}
            </button>
          </form>
          {createError ? <p className="dashboard-feedback">{createError}</p> : null}
        </BorderGlow>
      </section>

      <section className="dashboard-connections" aria-label="Teams list">
        <div className="dashboard-connections__heading">
          <h2>Your teams</h2>
          <div className="dashboard-connections-actions">
            {onBack ? (
              <button type="button" className="dashboard-add-btn" onClick={onBack}>
                Back to dashboard
              </button>
            ) : null}
            <button type="button" className="dashboard-add-btn" onClick={refresh}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? <p className="dashboard-feedback">{error}</p> : null}

        {teams.length === 0 && !loading ? (
          <p className="dashboard-feedback">
            You're not in any teams yet. Create one above to start inviting teammates.
          </p>
        ) : null}

        <div className="dashboard-grid">
          {teams.map((team) => (
            <BorderGlow
              key={team.id}
              as="article"
              className="dashboard-connection-card"
              glowColor="48 100% 54%"
            >
              <div className="dashboard-connection-top">
                <h3>{team.name}</h3>
                <div className="connection-top-right">
                  <span className={`connection-status ${team.my_role === 'owner' ? 'ok' : 'warn'}`}>
                    {team.my_role}
                  </span>
                </div>
              </div>
              <ul className="connection-details">
                <li>{team.member_count} member{team.member_count === 1 ? '' : 's'}</li>
                <li>{team.server_count} server{team.server_count === 1 ? '' : 's'} shared</li>
              </ul>
              <div className="connection-meta-row">
                <div className="connection-meta-left">
                  <p className="connection-active-since">
                    Created: {team.created_at ? new Date(team.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  className="recent-commands-btn"
                  onClick={() => onOpenTeam?.(team.id)}
                >
                  Open team
                </button>
              </div>
            </BorderGlow>
          ))}
        </div>
      </section>
    </main>
  )
}

export default TeamsPage
