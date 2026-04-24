import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import {
  listServers,
} from '../../lib/serverApi'
import { API_BASE_URL } from '../../lib/authApi'

const BUBBLE_ROLE_LABEL = {
  user: 'You',
  output: 'GenOS',
  message: 'GenOS',
  assistant: 'GenOS',
  history: 'History',
  confirm: 'GenOS · Needs approval',
  error: 'Error',
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

function normalizeServerId(serverId) {
  if (!serverId) return ''
  try {
    return decodeURIComponent(serverId)
  } catch {
    return serverId
  }
}

function ChatPage() {
  const token = localStorage.getItem('genos_access_token')
  const requestedServerId = normalizeServerId(new URLSearchParams(window.location.search).get('serverId') || '')
  const wsRef = useRef(null)
  const connectSocketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const [selectedServerId, setSelectedServerId] = useState(requestedServerId)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([])
  const [traceMessages, setTraceMessages] = useState([])
  const [socketState, setSocketState] = useState('idle')
  const messagesEndRef = useRef(null)
  const traceEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [traceMessages])

  const pushMessage = useCallback((type, content) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, content }])
  }, [])

  const pushTrace = useCallback((content) => {
    setTraceMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, content }])
  }, [])

  useEffect(() => {
    return () => {
      manualCloseRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const refreshServers = useCallback(async () => {
    if (!token) {
      pushMessage('error', 'Please sign in first.')
      return
    }
    try {
      const data = await listServers(token)
      if (requestedServerId && Array.isArray(data)) {
        const matched = data.find((item) => item.server_id === requestedServerId)
        if (matched?.server_id) {
          setSelectedServerId(matched.server_id)
          return
        }
        if (data[0]?.server_id) {
          setSelectedServerId(data[0].server_id)
          pushTrace(`Requested server ${requestedServerId} was not found. Connected to ${data[0].server_id} instead.`)
          return
        }
      }
      if (!selectedServerId && !requestedServerId && Array.isArray(data) && data[0]?.server_id) {
        setSelectedServerId(data[0].server_id)
      }
    } catch (error) {
      pushMessage('error', error.message || 'Failed to load servers.')
    }
  }, [token, requestedServerId, selectedServerId, pushMessage, pushTrace])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      refreshServers()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [refreshServers])

  const connectSocket = useCallback(() => {
    if (!token || !selectedServerId) return
    manualCloseRef.current = false
    if (wsRef.current) wsRef.current.close()

    const wsUrl = buildWsUrl(selectedServerId, token)
    pushTrace(`Connecting socket to ${wsUrl}`)
    setSocketState('connecting')
    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0
      setSocketState('connected')
      pushTrace('Connected to GenOS agent socket.')
    }

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'history' && Array.isArray(payload.items)) {
          payload.items.forEach((item) => {
            pushMessage(item.role || 'history', item.content || JSON.stringify(item))
          })
          return
        }
        if (payload.type === 'thinking') {
          const stage = payload.stage ? `[${payload.stage}] ` : ''
          if (payload.proposed_command) {
            pushTrace(`${stage}Proposed command: ${payload.proposed_command}`)
            return
          }
          if (payload.verdict) {
            pushTrace(`${stage}Critic verdict: ${JSON.stringify(payload.verdict)}`)
            return
          }
          pushTrace(`${stage}${JSON.stringify(payload)}`)
          return
        }
        if (payload.type === 'info') {
          pushTrace(payload.content || 'Agent status updated.')
          return
        }
        if (payload.type === 'confirm') {
          pushMessage(
            'confirm',
            `${payload.message || 'Confirmation required.'} ${payload.command ? `Command: ${payload.command}` : ''}`,
          )
          return
        }
        pushMessage(payload.type || 'message', payload.content || payload.message || JSON.stringify(payload))
      } catch {
        pushMessage('message', event.data)
      }
    }

    socket.onerror = () => {
      setSocketState('error')
      pushTrace('WebSocket error.')
    }
    socket.onclose = (event) => {
      setSocketState('closed')
      const details = event?.reason
        ? `WebSocket closed (${event.code}): ${event.reason}`
        : `WebSocket closed (${event.code}).`
      pushTrace(details)
      if (event.code === 4401) {
        pushMessage('error', 'Session expired or invalid token. Please sign in again.')
      }
      if (event.code === 4404) {
        pushMessage('error', 'Selected server was not found. Please reconnect the server from dashboard.')
      }
      if (event.code === 4403) {
        pushMessage('error', 'You are not authorized to access this server.')
      }

      const shouldRetry = !manualCloseRef.current && ![4401, 4403, 4404].includes(event.code)
      if (shouldRetry && reconnectAttemptsRef.current < 3) {
        reconnectAttemptsRef.current += 1
        const waitMs = 1000 * reconnectAttemptsRef.current
        pushTrace(`Reconnecting in ${waitMs}ms (attempt ${reconnectAttemptsRef.current}/3).`)
        reconnectTimerRef.current = window.setTimeout(() => {
          connectSocketRef.current?.()
        }, waitMs)
      }
    }
  }, [token, selectedServerId, pushTrace, pushMessage])

  useEffect(() => {
    connectSocketRef.current = connectSocket
  }, [connectSocket])

  useEffect(() => {
    if (!selectedServerId) return undefined
    const timerId = window.setTimeout(() => {
      connectSocket()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [selectedServerId, connectSocket])

  function sendChatMessage(event) {
    event.preventDefault()
    const input = chatInput.trim()
    if (!input) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectSocket()
      pushMessage('error', 'Socket is reconnecting. Please retry in a moment.')
      return
    }
    if (input.toLowerCase() === 'yes' || input.toLowerCase() === 'no') {
      wsRef.current.send(JSON.stringify({ resume: input }))
      pushMessage('user', `[resume] ${input}`)
    } else {
      wsRef.current.send(JSON.stringify({ message: input }))
      pushMessage('user', input)
    }
    setChatInput('')
  }

  const socketBadge = useMemo(() => {
    if (socketState === 'connected') return { label: 'Connected', tone: 'ok' }
    if (socketState === 'connecting') return { label: 'Connecting...', tone: 'warn' }
    if (socketState === 'error') return { label: 'Connection error', tone: 'err' }
    if (socketState === 'closed') return { label: 'Disconnected', tone: 'warn' }
    return { label: 'Idle', tone: 'warn' }
  }, [socketState])

  return (
    <main className="chat-main">
      <section className="chat-header">
        <h1>GenOS Chat Console</h1>
        <div className="chat-header-meta">
          <span className={`chat-status-badge chat-status-badge--${socketBadge.tone}`}>
            <span className="chat-status-dot" />
            {socketBadge.label}
          </span>
          {selectedServerId ? (
            <span className="chat-server-pill">{selectedServerId}</span>
          ) : null}
          <button
            type="button"
            className="chat-btn chat-btn--ghost"
            onClick={() => setMessages([])}
            disabled={messages.length === 0}
          >
            Clear
          </button>
        </div>
      </section>

      <section className="chat-layout">
        <BorderGlow as="section" className="chat-panel chat-panel--trace" glowColor="270 100% 75%">
          <h2>Execution Trace</h2>
          <div className="chat-trace-messages">
            {traceMessages.length === 0 ? <p className="chat-muted">Thinking will appear here.</p> : null}
            {traceMessages.map((item) => (
              <article key={item.id} className="chat-trace-item">
                <p>{item.content}</p>
              </article>
            ))}
            <div ref={traceEndRef} />
          </div>
        </BorderGlow>

        <BorderGlow as="section" className="chat-panel" glowColor="270 100% 75%">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <p className="chat-muted">No messages yet. Type a command below to get started.</p>
            ) : null}
            {messages.map((item) => {
              const role = BUBBLE_ROLE_LABEL[item.type] || 'GenOS'
              const isUser = item.type === 'user'
              const isTerminal =
                !isUser && item.type !== 'confirm' && item.type !== 'error' && isLikelyCommandOutput(item.content)
              const bubbleClasses = [
                'chat-bubble',
                `chat-bubble--${item.type}`,
                isUser ? 'chat-bubble--align-right' : 'chat-bubble--align-left',
                isTerminal ? 'chat-bubble--terminal' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <article key={item.id} className={bubbleClasses}>
                  <span className="chat-bubble-role">{role}</span>
                  {isTerminal ? (
                    <pre className="chat-bubble-terminal">{item.content}</pre>
                  ) : (
                    <p>{item.content}</p>
                  )}
                </article>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-send-form" onSubmit={sendChatMessage}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={
                socketState === 'connected'
                  ? 'Type a command for GenOS (yes / no to respond to confirmations)...'
                  : 'Waiting for socket connection...'
              }
            />
            <button type="submit" className="chat-btn" disabled={socketState !== 'connected'}>
              Send
            </button>
          </form>
        </BorderGlow>
      </section>
    </main>
  )
}

export default ChatPage
