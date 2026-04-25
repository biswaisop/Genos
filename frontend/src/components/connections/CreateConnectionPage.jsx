import { useMemo, useState } from 'react'
import { createServer, testServer } from '../../lib/serverApi'
import elasticIpImg from '../../../demo-images/elastic-ip-img.png'

function normalizeServerId(id) {
  if (!id) return ''
  try { return decodeURIComponent(id) } catch { return id }
}

function isValidPublicIpv4(ip) {
  const t = ip.trim()
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(t)) return false
  const parts = t.split('.').map(Number)
  if (parts.some(p => isNaN(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  return true
}

// ── Step progress indicator ───────────────────────────────────────────────────

function StepBar({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                           border transition-all duration-300 ${
            n < current  ? 'bg-brand-yellow border-brand-yellow text-black' :
            n === current ? 'bg-brand-yellow/20 border-brand-yellow text-brand-yellow' :
                           'bg-transparent border-white/20 text-white/30'
          }`}>
            {n < current ? '✓' : n}
          </div>
          {n < total && (
            <div className={`h-px flex-1 w-10 transition-colors duration-300 ${
              n < current ? 'bg-brand-yellow' : 'bg-white/10'
            }`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Code/command block ────────────────────────────────────────────────────────

function Cmd({ children }) {
  return (
    <code className="block w-full bg-brand-black-raised border border-white/10 rounded-lg
                     px-4 py-2.5 font-mono text-sm text-brand-yellow select-all">
      {children}
    </code>
  )
}

// ── Numbered instruction list ─────────────────────────────────────────────────

function Steps({ items, start = 1 }) {
  return (
    <ol className="flex flex-col gap-3" start={start}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-white/5 border border-white/10 text-white/30
                           text-xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
            {start + i}
          </span>
          <div className="flex-1 text-white/60 text-sm leading-relaxed">{item}</div>
        </li>
      ))}
    </ol>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateConnectionPage() {
  const [step, setStep]               = useState(1)
  const [elasticIp, setElasticIp]     = useState('')
  const [username, setUsername]       = useState('')
  const [showImg, setShowImg]         = useState(false)
  const [copied, setCopied]           = useState(false)
  const [publicKey, setPublicKey]     = useState('')
  const [serverId, setServerId]       = useState('')
  const [creating, setCreating]       = useState(false)
  const [verifying, setVerifying]     = useState(false)
  const [error, setError]             = useState('')

  const validIp      = useMemo(() => isValidPublicIpv4(elasticIp), [elasticIp])
  const step1Ready   = useMemo(() => elasticIp.trim() && username.trim(), [elasticIp, username])

  async function handleCreate() {
    const token = localStorage.getItem('genos_access_token')
    if (!token) { setError('Please sign in first.'); return }
    try {
      setCreating(true); setError('')
      const host = elasticIp.trim(), user = username.trim()
      const res = await createServer(token, { name: `${user}@${host}`, host, username: user, port: 22 })
      if (!res?.public_key) throw new Error('No public SSH key returned.')
      setPublicKey(res.public_key)
      setServerId(normalizeServerId(res.server_id || ''))
      setStep(2)
    } catch (err) {
      setError(err.message || 'Could not generate SSH key.')
    } finally { setCreating(false) }
  }

  async function handleCopy() {
    if (!publicKey) return
    try {
      await navigator.clipboard.writeText(publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { setCopied(false) }
  }

  async function handleVerify() {
    const token = localStorage.getItem('genos_access_token')
    if (!token) { setError('Please sign in first.'); return }
    if (!serverId) { setError('Connection ID missing. Please re-create this connection.'); return }
    try {
      setVerifying(true); setError('')
      const result = await testServer(token, serverId)
      if (result?.success === true) {
        window.history.pushState({}, '', `/chat?serverId=${encodeURIComponent(serverId)}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }
      setError(result?.message || 'Connection test failed.')
    } catch (err) {
      setError(err.message || 'Could not verify connection.')
    } finally { setVerifying(false) }
  }

  return (
    <main className="flex-1 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl animate-fade-in">

        {/* Card */}
        <div className="glow-card p-8">
          <StepBar current={step} total={3} />

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div>
                <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-2">
                  Step 1 of 3
                </p>
                <h1 className="text-2xl font-bold text-white">Assign Elastic IP</h1>
                <p className="text-white/40 text-sm mt-2 leading-relaxed">
                  First, allocate an Elastic IP in AWS and attach it to the EC2 instance
                  you want GenOS to connect to.
                </p>
              </div>

              <Steps items={[
                'Open AWS Console and go to EC2.',
                <span key="2" className="flex items-center gap-2 flex-wrap">
                  From the left sidebar, open <strong className="text-white/80">Elastic IPs</strong>.
                  <button
                    type="button"
                    onClick={() => setShowImg(p => !p)}
                    className="pill text-[10px] border-brand-yellow/30 text-brand-yellow bg-brand-yellow/8 cursor-pointer hover:bg-brand-yellow/15 transition-colors"
                  >
                    {showImg ? 'Hide screenshot' : 'Show screenshot'}
                  </button>
                </span>,
                'Click Allocate Elastic IP address → Allocate.',
                'Select the new IP → Actions → Associate Elastic IP Address.',
                'Choose your EC2 instance and the private IP in the dropdown, then click Associate.',
                'Once associated, paste that Elastic IP below.',
              ]} />

              {showImg && (
                <img
                  src={elasticIpImg}
                  alt="AWS EC2 sidebar — Elastic IPs"
                  className="rounded-xl border border-white/10 w-full"
                />
              )}

              {/* Inputs */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="elastic-ip-input"
                    className="text-xs font-medium uppercase tracking-wide text-white/30">
                    Elastic IP
                  </label>
                  <input
                    id="elastic-ip-input"
                    value={elasticIp}
                    onChange={e => setElasticIp(e.target.value)}
                    placeholder="e.g. 3.110.25.19"
                    className="field-input font-mono"
                  />
                  {elasticIp.trim() && (
                    <p className={`text-xs ${validIp ? 'text-green-400' : 'text-red-400/80'}`}>
                      {validIp ? '✓ Valid public IP' : '✗ Enter a valid public IPv4 address'}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="username-input"
                    className="text-xs font-medium uppercase tracking-wide text-white/30">
                    Username <span className="normal-case text-white/20">(run <code className="text-[11px]">whoami</code> in your instance)</span>
                  </label>
                  <input
                    id="username-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="e.g. ubuntu"
                    className="field-input font-mono"
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!step1Ready || creating}
                  className="btn-yellow px-8 py-2"
                >
                  {creating ? 'Generating key…' : 'Next →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div>
                <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-2">
                  Step 2 of 3
                </p>
                <h1 className="text-2xl font-bold text-white">Add SSH Public Key</h1>
                <p className="text-white/40 text-sm mt-2 leading-relaxed">
                  Paste this key into <code>~/.ssh/authorized_keys</code> on your instance.
                </p>
              </div>

              <Steps items={[
                <span key="1">SSH into your instance, then run: <Cmd>cd ~/.ssh</Cmd></span>,
                <span key="2">Open or create the authorized_keys file: <Cmd>nano authorized_keys</Cmd></span>,
              ]} />

              {/* Key display */}
              <div className="flex flex-col gap-2">
                <label htmlFor="genos-public-key"
                  className="text-xs font-medium uppercase tracking-wide text-white/30">
                  GenOS Public SSH Key
                </label>
                <textarea
                  id="genos-public-key"
                  readOnly
                  value={publicKey}
                  rows={4}
                  className="w-full bg-brand-black-raised border border-white/10 rounded-xl
                             px-4 py-3 font-mono text-xs text-brand-yellow resize-none
                             focus:outline-none select-all leading-relaxed"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!publicKey}
                  className={`btn-yellow text-sm px-5 py-2 w-fit transition-all ${copied ? 'bg-green-400 text-black' : ''}`}
                >
                  {copied ? '✓ Copied!' : 'Copy key'}
                </button>
              </div>

              <Steps items={[
                'Paste the public key into the file, then save and exit (Ctrl+X → Y → Enter).',
              ]} start={3} />

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="btn-ghost text-sm px-4 py-2">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!publicKey}
                  className="btn-yellow px-8 py-2"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div>
                <p className="text-brand-yellow text-xs font-semibold tracking-widest uppercase mb-2">
                  Step 3 of 3
                </p>
                <h1 className="text-2xl font-bold text-white">Set Permissions</h1>
                <p className="text-white/40 text-sm mt-2">
                  Fix SSH directory and file permissions, then verify the connection.
                </p>
              </div>

              <Steps items={[
                <span key="1">Set folder permissions: <Cmd>chmod 700 ~/.ssh</Cmd></span>,
                <span key="2">Set file permissions: <Cmd>chmod 600 ~/.ssh/authorized_keys</Cmd></span>,
              ]} />

              {error && (
                <p className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              {verifying && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-brand-yellow animate-shimmer"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-white/40 text-sm">Verifying connection…</span>
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="btn-ghost text-sm px-4 py-2">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={!serverId || verifying}
                  className="btn-yellow px-8 py-2"
                >
                  {verifying ? 'Verifying…' : 'Done — Test connection'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-white/20 text-xs mt-6">
          Your SSH key is securely stored and never shared.
        </p>
      </div>
    </main>
  )
}
