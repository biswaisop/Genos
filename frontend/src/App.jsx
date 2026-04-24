import { useEffect, useState } from 'react'
import Navbar from './components/layout/Navbar'
import BorderGlow from './components/common/BorderGlow'
import Section from './components/layout/Section'
import Beams from './components/backgrounds/Beams'
import CursorGlow from './components/backgrounds/CursorGlow'
import GradientText from './components/text/GradientText'
import AuthPage from './components/auth/AuthPage'
import DashboardPage from './components/dashboard/DashboardPage'
import CreateConnectionPage from './components/connections/CreateConnectionPage'
import ChatPage from './components/chat/ChatPage'
import NotificationBell from './components/notifications/NotificationBell'
import TeamsPage from './components/teams/TeamsPage'
import TeamDetailPage from './components/teams/TeamDetailPage'
import ServerDashboardPage from './components/server/ServerDashboardPage'
import { getMe } from './lib/authApi'
import './App.css'

function getRouteFromPath(pathname) {
  if (pathname === '/signin') return 'signin'
  if (pathname === '/signup') return 'signup'
  if (pathname === '/dashboard') return 'dashboard'
  if (pathname === '/create-connection') return 'create-connection'
  if (pathname === '/chat') return 'chat'
  if (pathname === '/teams') return 'teams'
  if (pathname.startsWith('/teams/')) return 'team-detail'
  if (pathname.startsWith('/server/')) return 'server'
  return 'home'
}

function getTeamIdFromPath(pathname) {
  if (!pathname.startsWith('/teams/')) return null
  const slug = pathname.slice('/teams/'.length)
  const trimmed = slug.replace(/\/+$/, '')
  return trimmed || null
}

function getServerIdFromPath(pathname) {
  if (!pathname.startsWith('/server/')) return null
  const slug = pathname.slice('/server/'.length)
  const trimmed = slug.replace(/\/+$/, '')
  if (!trimmed) return null
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

function App() {
  const [route, setRoute] = useState(getRouteFromPath(window.location.pathname))
  const [teamId, setTeamId] = useState(getTeamIdFromPath(window.location.pathname))
  const [serverId, setServerId] = useState(getServerIdFromPath(window.location.pathname))
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Use cases', href: '#use-cases' },
  ]

  const capabilities = [
    {
      title: 'Multi-agent routing',
      description:
        'Route each task to a specialist agent with role-aware orchestration and fewer manual handoffs.',
    },
    {
      title: 'Tool execution support',
      description:
        'Connect Python, shell, and network tooling so agents can execute real operations end to end.',
    },
    {
      title: 'Queue-based reliability',
      description:
        'Use durable queues and worker isolation to process long-running workflows without dropped steps.',
    },
    {
      title: 'Execution visibility',
      description:
        'Track execution traces and outcomes so teams can review, debug, and improve each workflow run.',
    },
    {
      title: 'Memory + data integration',
      description:
        'Persist context and outputs across runs for consistent automation and better decision continuity.',
    },
    {
      title: 'Human-in-the-loop control',
      description:
        'Keep people in control with checkpoints for approvals before sensitive or high-impact actions.',
    },
  ]

  const useCases = [
    {
      title: 'Incident triage automation',
      description:
        'Automate intake, enrichment, and escalation flows to reduce response time during active incidents.',
    },
    {
      title: 'Compliance workflow acceleration',
      description:
        'Coordinate repeated evidence collection and policy checks with auditable execution trails.',
    },
    {
      title: 'Ops task orchestration',
      description:
        'Run repetitive operational sequences through reusable pipelines instead of brittle scripts.',
    },
  ]

  useEffect(() => {
    const token = localStorage.getItem('genos_access_token')
    if (!token) {
      setAuthReady(true)
      return
    }

    getMe(token)
      .then((user) => setCurrentUser(user))
      .catch(() => {
        localStorage.removeItem('genos_access_token')
      })
      .finally(() => {
        setAuthReady(true)
      })
  }, [])

  useEffect(() => {
    if (!authReady) return
    const authGated = ['dashboard', 'teams', 'team-detail', 'server']
    if (!authGated.includes(route)) return
    if (currentUser) return
    navigateTo('/signin')
  }, [authReady, route, currentUser])

  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname
      setRoute(getRouteFromPath(pathname))
      setTeamId(getTeamIdFromPath(pathname))
      setServerId(getServerIdFromPath(pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (path) => {
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== path) {
      window.history.pushState({}, '', path)
    }
    const pathname = new URL(path, window.location.origin).pathname
    setRoute(getRouteFromPath(pathname))
    setTeamId(getTeamIdFromPath(pathname))
    setServerId(getServerIdFromPath(pathname))
  }

  const authMode = route === 'signin' ? 'signin' : route === 'signup' ? 'signup' : null

  return (
    <div className="landing-page">
      <div className="landing-page__background" aria-hidden="true">
        <Beams
          beamWidth={1}
          beamHeight={24}
          beamNumber={22}
          lightColor="#8b5fb0"
          beamColor="#170f24"
          backgroundColor="#141126"
          speed={2}
          noiseIntensity={0.85}
          scale={0.25}
          rotation={0}
          ambientIntensity={0.5}
          lightIntensity={0.55}
        />
      </div>
      <CursorGlow />
      <Navbar
        brand="GenOS"
        links={route === 'home' ? navLinks : []}
        ctaLabel={
          route === 'dashboard'
            ? currentUser
              ? 'Teams'
              : ''
            : route === 'create-connection'
            ? ''
            : route === 'chat'
            ? ''
            : route === 'server'
            ? 'Dashboard'
            : route === 'teams' || route === 'team-detail'
            ? 'Dashboard'
            : currentUser
              ? 'Dashboard'
              : route === 'home'
                ? 'Sign up'
                : 'Back home'
        }
        onCtaClick={(event) => {
          event.preventDefault()
          if (route === 'dashboard') {
            if (currentUser) navigateTo('/teams')
            return
          }
          if (route === 'create-connection') return
          if (route === 'chat') return
          if (route === 'server') {
            navigateTo('/dashboard')
            return
          }
          if (route === 'teams' || route === 'team-detail') {
            navigateTo('/dashboard')
            return
          }
          if (currentUser) {
            navigateTo(route === 'dashboard' ? '/' : '/dashboard')
            return
          }
          if (route === 'home') {
            navigateTo('/signup')
            return
          }
          navigateTo('/')
        }}
        onProfileClick={() => {
          if (route === 'home' && !currentUser) {
            navigateTo('/signin')
          }
        }}
        trailing={
          currentUser ? (
            <NotificationBell
              onOpenTeam={(teamId) => navigateTo(`/teams/${teamId}`)}
            />
          ) : null
        }
      />

      {route === 'home' ? (
        <main>
        <Section
          id="hero"
          titleNode={
            <h1 className="hero-gradient-title">
              <GradientText
                colors={['#5b1a9b', '#aa3bff', '#f8d4ff']}
                animationSpeed={3.5}
                direction="horizontal"
              >
                Ops Without Commands
              </GradientText>
            </h1>
          }
          description="GenOS turns natural language into real system actions. From files and processes to networks and servers, intelligent agents handle execution so you don’t have to."
          className="hero-section"
        />

        <Section
          id="how-it-works"
          title="How GenOS works"
          description="A simple 3-step flow transforms every request from input to audited outcome."
          className="workflow-section"
        >
          <div className="workflow-visual">
            <p>Workflow architecture preview</p>
          </div>
          <div className="step-grid">
            <BorderGlow as="article" className="step-card" glowColor="270 100% 75%">
              <h3>1. Ingest request</h3>
              <p>Accept user or API input with context, priorities, and guardrails.</p>
            </BorderGlow>
            <BorderGlow as="article" className="step-card" glowColor="270 100% 75%">
              <h3>2. Orchestrate agents</h3>
              <p>Route tasks through the agent registry and trigger required tools per step.</p>
            </BorderGlow>
            <BorderGlow as="article" className="step-card" glowColor="270 100% 75%">
              <h3>3. Deliver output</h3>
              <p>Store results, emit traces, and return actionable outputs for review.</p>
            </BorderGlow>
          </div>
        </Section>

        <Section
          id="capabilities"
          title="Core capabilities"
          description="Built to scale reliable automation while keeping teams in control."
        >
          <div className="card-grid">
            {capabilities.map((capability) => (
              <BorderGlow
                key={capability.title}
                as="article"
                className="info-card"
                glowColor="270 100% 75%"
              >
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </BorderGlow>
            ))}
          </div>
        </Section>

        <Section
          id="use-cases"
          title="Use cases"
          description="Practical workflows where orchestration speed and visibility matter most."
        >
          <div className="card-grid card-grid--three">
            {useCases.map((useCase) => (
              <BorderGlow
                key={useCase.title}
                as="article"
                className="info-card"
                glowColor="270 100% 75%"
              >
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
              </BorderGlow>
            ))}
          </div>
        </Section>

        <footer className="footer">
          <p>GenOS</p>
          <a href="#hero">Back to top</a>
        </footer>
        </main>
      ) : route === 'dashboard' && currentUser ? (
        <DashboardPage
          onAddConnection={() => navigateTo('/create-connection')}
          onOpenServer={(id) => navigateTo(`/server/${encodeURIComponent(id)}`)}
        />
      ) : route === 'teams' && currentUser ? (
        <TeamsPage
          onOpenTeam={(id) => navigateTo(`/teams/${id}`)}
          onBack={() => navigateTo('/dashboard')}
        />
      ) : route === 'team-detail' && currentUser && teamId ? (
        <TeamDetailPage
          teamId={teamId}
          currentUser={currentUser}
          onBack={() => navigateTo('/teams')}
        />
      ) : route === 'server' && currentUser && serverId ? (
        <ServerDashboardPage
          serverId={serverId}
          onOpenChat={(id) =>
            navigateTo(`/chat?serverId=${encodeURIComponent(id)}`)
          }
          onBack={() => navigateTo('/dashboard')}
        />
      ) : route === 'create-connection' ? (
        <CreateConnectionPage />
      ) : route === 'chat' ? (
        <ChatPage />
      ) : (
        <AuthPage
          mode={authMode}
          onModeChange={(mode) => navigateTo(mode === 'signin' ? '/signin' : '/signup')}
          onAuthSuccess={(user) => {
            setCurrentUser(user)
            navigateTo('/dashboard')
          }}
        />
      )}
    </div>
  )
}

export default App
