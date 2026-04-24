import { useEffect, useState } from 'react'
import Navbar from './components/layout/Navbar'
import BorderGlow from './components/common/BorderGlow'
import Section from './components/layout/Section'
import Beams from './components/backgrounds/Beams'
import CursorGlow from './components/backgrounds/CursorGlow'
import GradientText from './components/text/GradientText'
import AuthPage from './components/auth/AuthPage'
import { getMe } from './lib/authApi'
import './App.css'

function getRouteFromPath(pathname) {
  if (pathname === '/signin') return 'signin'
  if (pathname === '/signup') return 'signup'
  return 'home'
}

function App() {
  const [route, setRoute] = useState(getRouteFromPath(window.location.pathname))
  const [currentUser, setCurrentUser] = useState(null)

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
    if (!token) return

    getMe(token)
      .then((user) => setCurrentUser(user))
      .catch(() => {
        localStorage.removeItem('genos_access_token')
      })
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setRoute(getRouteFromPath(path))
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
          currentUser
            ? 'Signed in'
            : route === 'home'
              ? 'Sign up'
              : 'Back home'
        }
        onCtaClick={(event) => {
          event.preventDefault()
          if (currentUser) return
          if (route === 'home') {
            navigateTo('/signup')
            return
          }
          navigateTo('/')
        }}
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
      ) : (
        <AuthPage
          mode={authMode}
          onModeChange={(mode) => navigateTo(mode === 'signin' ? '/signin' : '/signup')}
          onAuthSuccess={(user) => {
            setCurrentUser(user)
            navigateTo('/')
          }}
        />
      )}
    </div>
  )
}

export default App
