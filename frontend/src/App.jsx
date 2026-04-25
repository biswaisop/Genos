import { useEffect, useState } from 'react'
import AuthPage from './components/auth/AuthPage'
import DashboardPage from './components/dashboard/DashboardPage'
import CreateConnectionPage from './components/connections/CreateConnectionPage'
import ChatPage from './components/chat/ChatPage'
import NotificationBell from './components/notifications/NotificationBell'
import TeamsPage from './components/teams/TeamsPage'
import TeamDetailPage from './components/teams/TeamDetailPage'
import ServerDashboardPage from './components/server/ServerDashboardPage'
import ProfilePage from './components/profile/ProfilePage'
import { getMe } from './lib/authApi'
import './index.css'

// ── Route helpers ─────────────────────────────────────────────────────────────

function getRouteFromPath(pathname) {
  if (pathname === '/signin') return 'signin'
  if (pathname === '/signup') return 'signup'
  if (pathname === '/dashboard') return 'dashboard'
  if (pathname === '/create-connection') return 'create-connection'
  if (pathname === '/chat') return 'chat'
  if (pathname === '/teams') return 'teams'
  if (pathname.startsWith('/teams/')) return 'team-detail'
  if (pathname.startsWith('/server/')) return 'server'
  if (pathname === '/profile') return 'profile'
  return 'home'
}

function getTeamIdFromPath(pathname) {
  if (!pathname.startsWith('/teams/')) return null
  return pathname.slice('/teams/'.length).replace(/\/+$/, '') || null
}

function getServerIdFromPath(pathname) {
  if (!pathname.startsWith('/server/')) return null
  const slug = pathname.slice('/server/'.length).replace(/\/+$/, '')
  if (!slug) return null
  try { return decodeURIComponent(slug) } catch { return slug }
}

// ── Minimal Navbar ────────────────────────────────────────────────────────────

function Navbar({ route, currentUser, onCta, onProfile, trailing }) {
  const ctaLabel = (() => {
    if (['server', 'profile', 'teams', 'team-detail'].includes(route)) return 'Dashboard'
    if (route === 'dashboard') return currentUser ? 'Teams' : ''
    if (['create-connection', 'chat'].includes(route)) return ''
    return currentUser ? 'Dashboard' : route === 'home' ? 'Sign up' : 'Back home'
  })()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-6
                        px-6 md:px-10 py-4 border-b border-brand-border bg-brand-black/90 backdrop-blur-md">
      <a href="/" className="text-white font-bold text-xl tracking-tight hover:text-brand-yellow transition-colors">
        Gen<span className="text-brand-yellow">OS</span>
      </a>

      {route === 'home' && (
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/60">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#use-cases"    className="hover:text-white transition-colors">Use cases</a>
        </nav>
      )}

      <div className="flex items-center gap-3 ml-auto">
        {trailing}
        {ctaLabel && (
          <button onClick={onCta} className="btn-yellow text-sm px-4 py-2">
            {ctaLabel}
          </button>
        )}
        <button
          onClick={onProfile}
          aria-label="Profile"
          className="w-9 h-9 rounded-full border border-brand-border bg-brand-black-raised
                     flex items-center justify-center hover:border-brand-yellow/40 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white/70">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z"/>
          </svg>
        </button>
      </div>
    </header>
  )
}

// ── Landing page ──────────────────────────────────────────────────────────────

const capabilities = [
  { title: 'Multi-agent routing',       desc: 'Route each task to a specialist agent with role-aware orchestration.' },
  { title: 'Tool execution support',    desc: 'Connect Python, shell, and network tooling for real end-to-end operations.' },
  { title: 'Queue-based reliability',   desc: 'Durable queues and worker isolation for long-running workflows.' },
  { title: 'Execution visibility',      desc: 'Track traces and outcomes so teams can review, debug, and improve runs.' },
  { title: 'Memory + data integration', desc: 'Persist context across runs for consistent automation.' },
  { title: 'Human-in-the-loop control', desc: 'Checkpoints for approvals before sensitive high-impact actions.' },
]

const useCases = [
  { title: 'Incident triage automation',         desc: 'Automate intake, enrichment, and escalation flows to cut response time.' },
  { title: 'Compliance workflow acceleration',   desc: 'Coordinate evidence collection and policy checks with audit trails.' },
  { title: 'Ops task orchestration',             desc: 'Run repetitive sequences through pipelines instead of brittle scripts.' },
]

function LandingPage({ onSignUp }) {
  return (
    <main className="flex-1 text-left">
      {/* Hero */}
      <section className="min-h-[calc(100svh-65px)] flex flex-col items-center justify-center
                           text-center px-6 py-24 border-b border-brand-border">
        <p className="pill border-brand-yellow/30 text-brand-yellow mb-6 animate-fade-in">
          AI-Powered Server Management
        </p>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-tight max-w-4xl animate-fade-in">
          Ops Without <span className="text-brand-yellow">Commands</span>
        </h1>
        <p className="mt-6 text-white/50 text-lg max-w-xl animate-fade-in">
          GenOS turns natural language into real system actions. Intelligent agents handle
          execution so you don't have to.
        </p>
        <div className="mt-10 flex gap-3 animate-fade-in">
          <button onClick={onSignUp} className="btn-yellow text-base px-6 py-3">
            Get started free
          </button>
          <a href="#how-it-works" className="btn-ghost text-base px-6 py-3">
            See how it works
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-24 border-b border-brand-border">
        <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-3">Process</p>
        <h2 className="text-3xl font-bold text-white mb-2">How GenOS works</h2>
        <p className="text-white/50 mb-12 max-w-lg">A simple 3-step flow transforms every request from input to audited outcome.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { n: '01', title: 'Ingest request',     desc: 'Accept user or API input with context, priorities, and guardrails.' },
            { n: '02', title: 'Orchestrate agents',  desc: 'Route tasks through the agent registry and trigger required tools per step.' },
            { n: '03', title: 'Deliver output',      desc: 'Store results, emit traces, and return actionable outputs for review.' },
          ].map(s => (
            <div key={s.n} className="glow-card p-6 group hover:shadow-yellow-glow transition-all duration-300">
              <span className="font-mono text-brand-yellow text-xs tracking-widest">{s.n}</span>
              <h3 className="text-white font-semibold mt-3 mb-2">{s.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="max-w-5xl mx-auto px-6 py-24 border-b border-brand-border">
        <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-3">Features</p>
        <h2 className="text-3xl font-bold text-white mb-2">Core capabilities</h2>
        <p className="text-white/50 mb-12 max-w-lg">Built to scale reliable automation while keeping teams in control.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map(c => (
            <div key={c.title} className="glow-card p-5 hover:shadow-yellow-glow transition-all duration-300">
              <div className="w-8 h-8 rounded-lg bg-brand-yellow/10 flex items-center justify-center mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-brand-yellow" />
              </div>
              <h3 className="text-white font-semibold text-sm mb-2">{c.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="max-w-5xl mx-auto px-6 py-24">
        <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-3">Use cases</p>
        <h2 className="text-3xl font-bold text-white mb-2">Where GenOS shines</h2>
        <p className="text-white/50 mb-12 max-w-lg">Practical workflows where orchestration speed and visibility matter most.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {useCases.map(u => (
            <div key={u.title} className="glow-card p-6 hover:shadow-yellow-glow transition-all duration-300">
              <h3 className="text-white font-semibold mb-2">{u.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{u.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-brand-border px-6 py-6 flex justify-between items-center text-sm text-white/30 max-w-5xl mx-auto w-full">
        <span>GenOS © {new Date().getFullYear()}</span>
        <a href="#" className="hover:text-brand-yellow transition-colors">Back to top ↑</a>
      </footer>
    </main>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [route, setRoute]       = useState(getRouteFromPath(window.location.pathname))
  const [teamId, setTeamId]     = useState(getTeamIdFromPath(window.location.pathname))
  const [serverId, setServerId] = useState(getServerIdFromPath(window.location.pathname))
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady]     = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('genos_access_token')
    if (!token) { setAuthReady(true); return }
    getMe(token)
      .then(setCurrentUser)
      .catch(() => localStorage.removeItem('genos_access_token'))
      .finally(() => setAuthReady(true))
  }, [])

  useEffect(() => {
    if (!authReady) return
    const gated = ['dashboard', 'teams', 'team-detail', 'server', 'profile']
    if (!gated.includes(route)) return
    if (currentUser) return
    navigate('/signin')
  }, [authReady, route, currentUser])

  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname
      setRoute(getRouteFromPath(p))
      setTeamId(getTeamIdFromPath(p))
      setServerId(getServerIdFromPath(p))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (path) => {
    const current = `${window.location.pathname}${window.location.search}`
    if (current !== path) window.history.pushState({}, '', path)
    const p = new URL(path, window.location.origin).pathname
    setRoute(getRouteFromPath(p))
    setTeamId(getTeamIdFromPath(p))
    setServerId(getServerIdFromPath(p))
  }

  const handleCtaClick = () => {
    if (route === 'dashboard') { if (currentUser) navigate('/teams'); return }
    if (['create-connection', 'chat'].includes(route)) return
    if (['server', 'profile', 'teams', 'team-detail'].includes(route)) { navigate('/dashboard'); return }
    if (currentUser) { navigate('/dashboard'); return }
    if (route === 'home') { navigate('/signup'); return }
    navigate('/')
  }

  const authMode = route === 'signin' ? 'signin' : route === 'signup' ? 'signup' : null

  return (
    <div className="min-h-screen bg-brand-black flex flex-col">
      <Navbar
        route={route}
        currentUser={currentUser}
        onCta={handleCtaClick}
        onProfile={() => navigate(currentUser ? '/profile' : '/signin')}
        trailing={
          currentUser ? (
            <NotificationBell onOpenTeam={(id) => navigate(`/teams/${id}`)} />
          ) : null
        }
      />

      {route === 'home' ? (
        <LandingPage onSignUp={() => navigate('/signup')} />
      ) : route === 'dashboard' && currentUser ? (
        <DashboardPage
          onAddConnection={() => navigate('/create-connection')}
          onOpenServer={(id) => navigate(`/server/${encodeURIComponent(id)}`)}
        />
      ) : route === 'teams' && currentUser ? (
        <TeamsPage
          onOpenTeam={(id) => navigate(`/teams/${id}`)}
          onBack={() => navigate('/dashboard')}
        />
      ) : route === 'team-detail' && currentUser && teamId ? (
        <TeamDetailPage
          teamId={teamId}
          currentUser={currentUser}
          onBack={() => navigate('/teams')}
        />
      ) : route === 'server' && currentUser && serverId ? (
        <ServerDashboardPage
          serverId={serverId}
          onOpenChat={(id) => navigate(`/chat?serverId=${encodeURIComponent(id)}`)}
          onBack={() => navigate('/dashboard')}
        />
      ) : route === 'profile' && currentUser ? (
        <ProfilePage
          currentUser={currentUser}
          onProfileUpdated={setCurrentUser}
          onSignOut={() => {
            localStorage.removeItem('genos_access_token')
            setCurrentUser(null)
            navigate('/')
          }}
          onBack={() => navigate('/dashboard')}
        />
      ) : route === 'create-connection' ? (
        <CreateConnectionPage />
      ) : route === 'chat' ? (
        <ChatPage />
      ) : (
        <AuthPage
          mode={authMode}
          onModeChange={(m) => navigate(m === 'signin' ? '/signin' : '/signup')}
          onAuthSuccess={(user) => { setCurrentUser(user); navigate('/dashboard') }}
        />
      )}
    </div>
  )
}

export default App
