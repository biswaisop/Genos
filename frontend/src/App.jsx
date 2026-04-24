import Navbar from './components/layout/Navbar'
import CtaButton from './components/common/CtaButton'
import Section from './components/layout/Section'
import Beams from './components/backgrounds/Beams'
import CursorGlow from './components/backgrounds/CursorGlow'
import './App.css'

function App() {
  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Use cases', href: '#use-cases' },
    { label: 'FAQ', href: '#faq' },
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

  const faqs = [
    {
      question: 'Who is GenOS for?',
      answer:
        'GenOS is designed for teams managing complex, multi-step workflows that require speed and oversight.',
    },
    {
      question: 'Is a human always in control?',
      answer:
        'Yes. Sensitive actions can be gated behind review checkpoints so humans decide when to approve execution.',
    },
    {
      question: 'What tools can agents use?',
      answer:
        'Agents can be configured to use shell, code execution, network calls, and custom integrations.',
    },
    {
      question: 'When will beta access open?',
      answer:
        'Waitlist users get priority updates and early invitations as private beta slots are released.',
    },
  ]

  return (
    <div className="landing-page">
      <div className="landing-page__background" aria-hidden="true">
        <Beams
          beamWidth={0.4}
          beamHeight={20}
          beamNumber={34}
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
        links={navLinks}
        ctaLabel="Sign up"
        ctaHref="#waitlist"
      />

      <main>
        <Section
          id="hero"
          eyebrow="Hackathon Project"
          title="Run complex workflows with coordinated AI agents"
          description="GenOS orchestrates specialist agents, tools, and data pipelines so teams can route, execute, and review tasks faster with human oversight."
          className="hero-section"
        >
          <div className="hero-actions">
            <CtaButton label="Sign up" href="#waitlist" />
            <CtaButton label="See workflow" href="#how-it-works" variant="secondary" />
          </div>
        </Section>

        <Section
          id="problem-solution"
          title="From fragmented automation to one coordinated system"
          className="problem-solution-section"
        >
          <div className="split-grid">
            <article className="info-card">
              <h3>Current pain</h3>
              <ul>
                <li>Disconnected tools create manual handoffs between teams and systems.</li>
                <li>Brittle scripts fail on edge cases and become hard to maintain quickly.</li>
                <li>Limited traceability makes it difficult to review what happened and why.</li>
              </ul>
            </article>
            <article className="info-card">
              <h3>GenOS approach</h3>
              <ul>
                <li>Agent registry routes each task to the right specialist at runtime.</li>
                <li>Shared tool layer executes actions across code, shell, and network contexts.</li>
                <li>Execution traces and storage layers preserve outcomes for visibility and reuse.</li>
              </ul>
            </article>
          </div>
        </Section>

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
            <article className="step-card">
              <h3>1. Ingest request</h3>
              <p>Accept user or API input with context, priorities, and guardrails.</p>
            </article>
            <article className="step-card">
              <h3>2. Orchestrate agents</h3>
              <p>Route tasks through the agent registry and trigger required tools per step.</p>
            </article>
            <article className="step-card">
              <h3>3. Deliver output</h3>
              <p>Store results, emit traces, and return actionable outputs for review.</p>
            </article>
          </div>
        </Section>

        <Section
          id="capabilities"
          title="Core capabilities"
          description="Built to scale reliable automation while keeping teams in control."
        >
          <div className="card-grid">
            {capabilities.map((capability) => (
              <article key={capability.title} className="info-card">
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
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
              <article key={useCase.title} className="info-card">
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="waitlist"
          title="Get early access"
          description="Join the waitlist for private beta updates and first access to live demos."
          className="waitlist-section"
        >
          <form className="waitlist-form">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@company.com" />
            <CtaButton label="Sign up" type="submit" />
          </form>
        </Section>

        <Section
          id="faq"
          title="Frequently asked questions"
          className="faq-section"
        >
          <div className="faq-list">
            {faqs.map((faq) => (
              <details key={faq.question} className="faq-item">
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        <footer className="footer">
          <p>GenOS</p>
          <a href="#hero">Back to top</a>
        </footer>
      </main>
    </div>
  )
}

export default App
