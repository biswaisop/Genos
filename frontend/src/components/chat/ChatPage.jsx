import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listServers } from '../../lib/serverApi'
import { API_BASE_URL } from '../../lib/authApi'
import { generateTelegramToken, getTelegramStatus } from '../../lib/telegramApi'

// ── Constants ─────────────────────────────────────────────────────────────────

const BUBBLE_ROLE = {
  user:      'You',
  output:    'GenOS',
  message:   'GenOS',
  assistant: 'GenOS',
  history:   'History',
  confirm:   'GenOS · Needs approval',
  error:     'Error',
}

function isLikelyCommandOutput(content) {
  if (!content) return false
  if (content.includes('\n')) return true
  return /[\s]{2,}|\$\s|^\//.test(content)
}

function buildWsUrl(serverId, token) {
  const wsBase = API_BASE_URL
    ? API_BASE_URL.replace(/^http/i, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  return `${wsBase}/api/v1/agents/ws/${encodeURIComponent(serverId)}?token=${encodeURIComponent(token)}`
}

function normalizeServerId(id) {
  if (!id) return ''
  try { return decodeURIComponent(id) } catch { return id }
}

// ── Telegram tab ──────────────────────────────────────────────────────────────

function TelegramChatPanel({ serverId }) {
  const token    = localStorage.getItem('genos_access_token')
  const [linked, setLinked]         = useState(null)  // null = loading
  const [username, setUsername]     = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg]               = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    if (!token) return
    getTelegramStatus(token)
      .then(s => { setLinked(s.linked); setUsername(s.username) })
      .catch(() => setLinked(false))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [token])

  async function handleConnect() {
    if (!token || connecting) return
    setConnecting(true); setMsg('')
    try {
      const { deep_link } = await generateTelegramToken(token)
      window.open(deep_link, '_blank', 'noopener,noreferrer')
      setMsg('Telegram opened — click START in the bot to link your account.')
      let elapsed = 0
      pollRef.current = setInterval(async () => {
        elapsed += 3
        try {
          const s = await getTelegramStatus(token)
          if (s.linked) {
            setLinked(true); setUsername(s.username); setMsg('')
            clearInterval(pollRef.current); setConnecting(false)
          }
        } catch { /* ignore */ }
        if (elapsed >= 120) {
          clearInterval(pollRef.current); setConnecting(false)
          setMsg('Timed out. Try again.')
        }
      }, 3000)
    } catch (err) {
      setMsg(err?.message || 'Failed to open Telegram.'); setConnecting(false)
    }
  }

  const serverShortName = serverId?.split('@').pop()?.split('.')[0] || serverId || 'your server'

  if (linked === null) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-brand-yellow animate-shimmer"
            style={{ animationDelay: `${i*0.2}s` }} />
        ))}
      </div>
    </div>
  )

  if (!linked) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#229ED9]/10 border border-[#229ED9]/20
                      flex items-center justify-center text-4xl">
        ✈️
      </div>
      <div>
        <h2 className="text-white font-semibold text-lg">Chat via Telegram</h2>
        <p className="text-white/40 text-sm mt-2 max-w-sm">
          Link your Telegram account to chat with GenOS agent directly
          from your phone, without opening the browser.
        </p>
      </div>
      {msg && (
        <div className="text-brand-yellow/80 bg-brand-yellow/8 border border-brand-yellow/20
                        rounded-lg px-4 py-2 text-sm max-w-sm">
          {msg}
        </div>
      )}
      <button onClick={handleConnect} disabled={connecting} className="btn-yellow px-8 py-2.5">
        {connecting ? 'Waiting for link…' : 'Connect Telegram'}
      </button>
    </div>
  )

  // ── Linked state ─────────────────────────────────────────────────────────

  const commands = [
    { cmd: `/use ${serverShortName}`, desc: 'Select this server in the bot' },
    { cmd: '/status',                 desc: 'Show live CPU / memory / disk' },
    { cmd: '/help',                   desc: 'All available bot commands' },
  ]

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">

      {/* Status banner */}
      <div className="glow-card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#229ED9]/12 border border-[#229ED9]/25
                        flex items-center justify-center text-2xl shrink-0">
          ✈️
        </div>
        <div className="flex-1">
          <p className="text-green-400 font-semibold text-sm">
            ✅ Telegram connected{username ? ` as ${username}` : ''}
          </p>
          <p className="text-white/40 text-xs mt-0.5">
            You can now chat with the GenOS agent from your Telegram app.
          </p>
        </div>
      </div>

      {/* Quick start */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/35">
          Quick start — send these to the bot
        </h3>
        {commands.map(({ cmd, desc }) => (
          <div key={cmd}
            className="flex items-center justify-between gap-4 bg-brand-black-raised
                       border border-brand-border rounded-xl px-4 py-3">
            <div>
              <code className="text-brand-yellow font-mono text-sm">{cmd}</code>
              <p className="text-white/35 text-xs mt-0.5">{desc}</p>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(cmd)}
              className="text-xs text-white/30 hover:text-brand-yellow transition-colors shrink-0"
              title="Copy"
            >
              Copy
            </button>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="glow-card p-5 flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/35">
          How it works
        </h3>
        <div className="flex flex-col gap-2">
          {[
            'Select a server with /use — the bot remembers your session.',
            'Send any plain-English command — the agent handles SSH execution.',
            'Destructive commands require you to reply yes or no for confirmation.',
            'Anomaly alerts are pushed to you automatically when metrics breach thresholds.',
          ].map((s, i) => (
            <div key={i} className="flex gap-3 text-sm text-white/50">
              <span className="w-5 h-5 rounded-full bg-brand-yellow/10 border border-brand-yellow/20
                               text-brand-yellow text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                {i + 1}
              </span>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── WebSocket chat ────────────────────────────────────────────────────────────

function WsChatPanel({ token, selectedServerId, onSelectServer }) {
  const wsRef               = useRef(null)
  const connectSocketRef    = useRef(null)
  const reconnectTimerRef   = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef      = useRef(false)
  const messagesEndRef      = useRef(null)
  const traceEndRef         = useRef(null)
  const inputRef            = useRef(null)

  const [chatInput, setChatInput]     = useState('')
  const [messages, setMessages]       = useState([])
  const [traceMessages, setTraceMessages] = useState([])
  const [socketState, setSocketState] = useState('idle')
  const [showTrace, setShowTrace]     = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    if (showTrace) traceEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [traceMessages, showTrace])

  const pushMessage = useCallback((type, content) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type, content }])
  }, [])

  const pushTrace = useCallback((content) => {
    setTraceMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, content }])
  }, [])

  useEffect(() => () => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    if (wsRef.current) wsRef.current.close()
  }, [])

  const connectSocket = useCallback(() => {
    if (!token || !selectedServerId) return
    manualCloseRef.current = false
    if (wsRef.current) wsRef.current.close()

    const url = buildWsUrl(selectedServerId, token)
    pushTrace(`Connecting to ${url}`)
    setSocketState('connecting')
    const socket = new WebSocket(url)
    wsRef.current = socket

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0
      setSocketState('connected')
      pushTrace('Connected to GenOS agent.')
    }

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'history' && Array.isArray(payload.items)) {
          payload.items.forEach(item => pushMessage(item.role || 'history', item.content || JSON.stringify(item)))
          return
        }
        if (payload.type === 'thinking') {
          const stage = payload.stage ? `[${payload.stage}] ` : ''
          if (payload.proposed_command) { pushTrace(`${stage}Proposed: ${payload.proposed_command}`); return }
          if (payload.verdict) { pushTrace(`${stage}Critic: ${JSON.stringify(payload.verdict)}`); return }
          pushTrace(`${stage}${JSON.stringify(payload)}`); return
        }
        if (payload.type === 'info') { pushTrace(payload.content || 'Status updated.'); return }
        if (payload.type === 'confirm') {
          pushMessage('confirm', `${payload.message || 'Confirmation required.'} ${payload.command ? `Command: ${payload.command}` : ''}`)
          return
        }
        pushMessage(payload.type || 'message', payload.content || payload.message || JSON.stringify(payload))
      } catch { pushMessage('message', event.data) }
    }

    socket.onerror = () => { setSocketState('error'); pushTrace('WebSocket error.') }

    socket.onclose = (event) => {
      setSocketState('closed')
      pushTrace(`Closed (${event.code})${event.reason ? ': ' + event.reason : '.'}`)
      if (event.code === 4401) pushMessage('error', 'Session expired. Please sign in again.')
      if (event.code === 4404) pushMessage('error', 'Server not found. Reconnect from dashboard.')
      if (event.code === 4403) pushMessage('error', 'Not authorized for this server.')
      const shouldRetry = !manualCloseRef.current && ![4401, 4403, 4404].includes(event.code)
      if (shouldRetry && reconnectAttemptsRef.current < 3) {
        reconnectAttemptsRef.current += 1
        const wait = 1000 * reconnectAttemptsRef.current
        pushTrace(`Reconnecting in ${wait}ms (${reconnectAttemptsRef.current}/3)…`)
        reconnectTimerRef.current = window.setTimeout(() => connectSocketRef.current?.(), wait)
      }
    }
  }, [token, selectedServerId, pushTrace, pushMessage])

  useEffect(() => { connectSocketRef.current = connectSocket }, [connectSocket])

  useEffect(() => {
    if (!selectedServerId) return
    const id = window.setTimeout(() => connectSocket(), 0)
    return () => window.clearTimeout(id)
  }, [selectedServerId, connectSocket])

  function sendMessage(e) {
    e.preventDefault()
    const input = chatInput.trim()
    if (!input) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectSocket()
      pushMessage('error', 'Socket reconnecting — please retry.')
      return
    }
    if (input.toLowerCase() === 'yes' || input.toLowerCase() === 'no') {
      wsRef.current.send(JSON.stringify({ resume: input }))
      pushMessage('user', `[confirm] ${input}`)
    } else {
      wsRef.current.send(JSON.stringify({ message: input }))
      pushMessage('user', input)
    }
    setChatInput('')
    inputRef.current?.focus()
  }

  const badge = useMemo(() => ({
    connected: { label: 'Connected',    cls: 'bg-green-500/12 text-green-400 border-green-500/25' },
    connecting:{ label: 'Connecting…', cls: 'bg-yellow-500/12 text-yellow-400 border-yellow-500/25' },
    error:     { label: 'Error',        cls: 'bg-red-500/12   text-red-400   border-red-500/25' },
    closed:    { label: 'Disconnected', cls: 'bg-white/8      text-white/40  border-white/15' },
    idle:      { label: 'Idle',         cls: 'bg-white/8      text-white/40  border-white/15' },
  }[socketState] || { label: socketState, cls: 'bg-white/8 text-white/40 border-white/15' }), [socketState])

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Connection bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 shrink-0">
        <span className={`pill text-[10px] ${badge.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full mr-1 inline-block ${
            socketState === 'connected' ? 'bg-green-400' :
            socketState === 'connecting' ? 'bg-yellow-400 animate-pulse' :
            'bg-white/30'
          }`} />
          {badge.label}
        </span>
        {selectedServerId && (
          <span className="text-white/30 text-xs font-mono truncate flex-1">{selectedServerId}</span>
        )}
        <button
          type="button"
          onClick={() => setShowTrace(t => !t)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showTrace
              ? 'border-brand-yellow/40 text-brand-yellow bg-brand-yellow/8'
              : 'border-white/10 text-white/30 hover:text-white'
          }`}
        >
          Trace
        </button>
        <button
          type="button"
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
          className="text-xs text-white/25 hover:text-white/60 transition-colors disabled:opacity-30"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Messages */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                <div className="text-4xl">💬</div>
                <p className="text-white/30 text-sm">
                  {selectedServerId
                    ? 'Type a command in plain English — the agent handles the rest.'
                    : 'No server selected. Choose one from the dropdown above.'}
                </p>
              </div>
            )}
            {messages.map(item => {
              const isUser     = item.type === 'user'
              const isError    = item.type === 'error'
              const isConfirm  = item.type === 'confirm'
              const isTerminal = !isUser && !isError && !isConfirm && isLikelyCommandOutput(item.content)
              const role       = BUBBLE_ROLE[item.type] || 'GenOS'

              return (
                <article key={item.id} className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-[10px] text-white/30 px-1">{role}</span>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-brand-yellow text-black font-medium rounded-br-sm'
                    : isError
                      ? 'bg-red-500/12 border border-red-500/25 text-red-400 rounded-bl-sm'
                    : isConfirm
                      ? 'bg-brand-yellow/8 border border-brand-yellow/30 text-brand-yellow rounded-bl-sm'
                    : isTerminal
                      ? 'bg-brand-black-raised border border-white/10 text-green-300 rounded-bl-sm w-full max-w-none'
                    : 'bg-brand-black-raised border border-white/8 text-white/80 rounded-bl-sm'
                  }`}>
                    {isTerminal
                      ? <pre className="font-mono text-xs whitespace-pre-wrap break-all">{item.content}</pre>
                      : <p>{item.content}</p>
                    }
                  </div>
                </article>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage}
            className="shrink-0 flex gap-2 px-4 py-3 border-t border-white/5">
            <input
              ref={inputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={
                socketState === 'connected'
                  ? 'Ask GenOS anything… (yes / no to confirm)'
                  : 'Waiting for connection…'
              }
              disabled={socketState !== 'connected'}
              className="field-input flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={socketState !== 'connected' || !chatInput.trim()}
              className="btn-yellow text-sm px-4 py-2 shrink-0"
            >
              Send
            </button>
          </form>
        </div>

        {/* Trace sidebar */}
        {showTrace && (
          <div className="w-64 shrink-0 border-l border-white/5 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                Execution Trace
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
              {traceMessages.length === 0
                ? <p className="text-white/20 text-xs px-1">Trace will appear here.</p>
                : traceMessages.map(item => (
                  <div key={item.id}
                    className="text-[10px] text-white/40 font-mono bg-white/3 rounded px-2 py-1.5
                               border border-white/5 leading-relaxed break-all">
                    {item.content}
                  </div>
                ))
              }
              <div ref={traceEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

export default function ChatPage() {
  const token = localStorage.getItem('genos_access_token')
  const requestedServerId = normalizeServerId(
    new URLSearchParams(window.location.search).get('serverId') || ''
  )

  const [servers, setServers]               = useState([])
  const [selectedServerId, setSelectedServerId] = useState(requestedServerId)
  const [chatMode, setChatMode]             = useState('ws')   // 'ws' | 'telegram'
  const [loadingServers, setLoadingServers] = useState(true)

  // Load server list
  useEffect(() => {
    if (!token) return
    listServers(token)
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setServers(list)
        if (!selectedServerId && list[0]?.server_id) {
          setSelectedServerId(list[0].server_id)
        } else if (selectedServerId) {
          const matched = list.find(s => s.server_id === selectedServerId)
          if (!matched && list[0]?.server_id) setSelectedServerId(list[0].server_id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingServers(false))
  }, [token])

  return (
    <main className="flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full px-4 md:px-8 py-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Chat Console</h1>
          <p className="text-white/40 text-sm mt-0.5">
            Command your servers in plain English.
          </p>
        </div>

        {/* Server selector */}
        {servers.length > 0 && (
          <select
            value={selectedServerId}
            onChange={e => setSelectedServerId(e.target.value)}
            className="field-input text-sm w-auto min-w-[180px]"
          >
            <option value="">Select server…</option>
            {servers.map(s => (
              <option key={s.server_id} value={s.server_id}>
                {s.name || s.server_id}
                {s.status !== 'connected' ? ' (offline)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Mode tabs + chat panel */}
      <div className="flex-1 flex flex-col min-h-0 glow-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-white/8 shrink-0">
          {[
            { id: 'ws',       label: '⚡ Web Console' },
            { id: 'telegram', label: '✈️ Telegram Bot' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setChatMode(tab.id)}
              className={`px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
                chatMode === tab.id
                  ? 'border-brand-yellow text-brand-yellow'
                  : 'border-transparent text-white/40 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        {chatMode === 'ws' ? (
          <WsChatPanel
            token={token}
            selectedServerId={selectedServerId}
            onSelectServer={setSelectedServerId}
          />
        ) : (
          <TelegramChatPanel serverId={selectedServerId} />
        )}
      </div>
    </main>
  )
}
