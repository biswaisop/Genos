import { useEffect, useState } from 'react'
import { createTeam, listTeams } from '../../lib/teamsApi'

function RolePill({ role }) {
  const cls = {
    owner:    'bg-brand-yellow/15 text-brand-yellow    border-brand-yellow/30',
    admin:    'bg-purple-500/15   text-purple-300       border-purple-500/30',
    operator: 'bg-blue-500/15    text-blue-300          border-blue-500/30',
    viewer:   'bg-white/8        text-white/40          border-white/15',
  }[role] || 'bg-white/8 text-white/40 border-white/15'
  return <span className={`pill text-[10px] capitalize ${cls}`}>{role}</span>
}

function TeamCard({ team, onOpen }) {
  return (
    <article
      className="glow-card p-5 flex flex-col gap-4 hover:shadow-yellow-glow
                 transition-all duration-300 cursor-pointer group"
      onClick={() => onOpen?.(team.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-yellow/10 border border-brand-yellow/20
                        flex items-center justify-center text-brand-yellow font-bold text-lg shrink-0">
          {team.name?.[0]?.toUpperCase() || '?'}
        </div>
        <RolePill role={team.my_role} />
      </div>

      {/* Name */}
      <div>
        <h3 className="text-white font-semibold text-base leading-tight group-hover:text-brand-yellow
                       transition-colors duration-200">
          {team.name}
        </h3>
        <p className="text-white/30 text-xs mt-1">
          Created {team.created_at ? new Date(team.created_at).toLocaleDateString() : '—'}
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-t border-white/5 pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-white font-semibold text-sm">{team.member_count ?? 0}</span>
          <span className="text-white/30 text-[10px] uppercase tracking-widest">Members</span>
        </div>
        <div className="w-px h-6 bg-white/8" />
        <div className="flex flex-col gap-0.5">
          <span className="text-white font-semibold text-sm">{team.server_count ?? 0}</span>
          <span className="text-white/30 text-[10px] uppercase tracking-widest">Servers</span>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onOpen?.(team.id) }}
          className="ml-auto btn-yellow text-xs px-3 py-1.5"
        >
          Open →
        </button>
      </div>
    </article>
  )
}

export default function TeamsPage({ onOpenTeam, onBack }) {
  const [teams, setTeams]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [creating, setCreating]     = useState(false)
  const [name, setName]             = useState('')
  const [createError, setCreateError] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const token = typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null

  async function refresh() {
    if (!token) { setError('Please sign in.'); return }
    try {
      setLoading(true)
      setTeams(Array.isArray(await listTeams(token)) ? await listTeams(token) : [])
      setError('')
    } catch (err) {
      setError(err?.message || 'Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!token || !name.trim()) return
    try {
      setCreating(true); setCreateError('')
      const team = await createTeam(token, { name: name.trim() })
      setName(''); setShowForm(false)
      await refresh()
      if (team?.id && onOpenTeam) onOpenTeam(team.id)
    } catch (err) {
      setCreateError(err?.message || 'Could not create team')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-10 text-left animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Teams</h1>
          <p className="text-white/40 text-sm mt-1">
            Group teammates, share servers, and assign role-based clearance levels.
          </p>
        </div>
        <div className="flex gap-2">
          {onBack && (
            <button onClick={onBack} className="btn-ghost text-sm px-4 py-2">
              ← Dashboard
            </button>
          )}
          <button onClick={() => setShowForm(f => !f)} className="btn-yellow text-sm px-4 py-2">
            {showForm ? '✕ Cancel' : '+ New team'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="glow-card p-6 animate-fade-in">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Create a team
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Platform, Ops, SRE…"
              className="field-input flex-1"
              autoFocus
            />
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="btn-yellow px-6 py-2 shrink-0"
            >
              {creating ? 'Creating…' : 'Create team'}
            </button>
          </form>
          {createError && (
            <p className="text-red-400 text-sm mt-3">{createError}</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Teams grid */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
            Your teams {teams.length > 0 && `— ${teams.length}`}
          </h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs text-white/30 hover:text-white transition-colors"
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {!loading && teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-yellow/8 border border-brand-yellow/15
                            flex items-center justify-center text-2xl">
              👥
            </div>
            <div>
              <p className="text-white font-semibold">No teams yet</p>
              <p className="text-white/35 text-sm mt-1">
                Create a team to start collaborating with teammates.
              </p>
            </div>
            <button onClick={() => setShowForm(true)} className="btn-yellow px-6 py-2">
              + New team
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {teams.map(team => (
              <TeamCard key={team.id} team={team} onOpen={onOpenTeam} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
