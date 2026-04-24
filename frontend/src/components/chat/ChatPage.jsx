import { useEffect, useRef, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import {
  listServers,
} from '../../lib/serverApi'
import { API_BASE_URL } from '../../lib/authApi'

function buildWsUrl(serverId, token) {
  const wsBase = API_BASE_URL
    ? API_BASE_URL.replace(/^http/i, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  return `${wsBase}/api/v1/agents/ws/${encodeURIComponent(serverId)}?token=${encodeURIComponent(token)}`
}

function ChatPage() {
  const token = localStorage.getItem('genos_access_token')
  const wsRef = useRef(null)
  const [servers, setServers] = useState([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([])
  const [traceMessages, setTraceMessages] = useState([])
  const requestedServerId = new URLSearchParams(window.location.search).get('serverId') || ''

  useEffect(() => {
    if (requestedServerId) {
      setSelectedServerId(requestedServerId)
    }
  }, [requestedServerId])

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  async function refreshServers() {
    if (!token) {
      pushMessage('error', 'Please sign in first.')
      return
    }
    try {
      const data = await listServers(token)
      setServers(Array.isArray(data) ? data : [])
      if (requestedServerId && Array.isArray(data)) {
        const matched = data.find((item) => item.server_id === requestedServerId)
        if (matched?.server_id) {
          setSelectedServerId(matched.server_id)
          return
        }
      }
      if (!selectedServerId && !requestedServerId && Array.isArray(data) && data[0]?.server_id) {
        setSelectedServerId(data[0].server_id)
      }
    } catch (error) {
      pushMessage('error', error.message || 'Failed to load servers.')
    }
  }

  useEffect(() => {
    refreshServers()
  }, [])

  useEffect(() => {
    if (selectedServerId) {
      connectSocket()
    }
  }, [selectedServerId])

  function pushMessage(type, content) {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, content }])
  }

  function pushTrace(content) {
    setTraceMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, content }])
  }

  function connectSocket() {
    if (!token || !selectedServerId) return
    if (wsRef.current) wsRef.current.close()

    const socket = new WebSocket(buildWsUrl(selectedServerId, token))
    wsRef.current = socket

    socket.onopen = () => {
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

    socket.onerror = () => pushTrace('WebSocket error.')
    socket.onclose = () => pushTrace('WebSocket closed.')
  }

  function sendChatMessage(event) {
    event.preventDefault()
    const input = chatInput.trim()
    if (!input) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      pushMessage('error', 'Socket is not connected yet. Please wait a moment and retry.')
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

  return (
    <main className="chat-main">
      <section className="chat-header">
        <h1>GenOS Chat Console</h1>
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
          </div>
        </BorderGlow>

        <BorderGlow as="section" className="chat-panel" glowColor="270 100% 75%">
          <div className="chat-messages">
            {messages.length === 0 ? <p className="chat-muted">No messages yet.</p> : null}
            {messages.map((item) => (
              <article key={item.id} className={`chat-bubble chat-bubble--${item.type}`}>
                <p>{item.content}</p>
              </article>
            ))}
          </div>

          <form className="chat-send-form" onSubmit={sendChatMessage}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Type command for GenOS..."
            />
            <button type="submit" className="chat-btn">
              Send
            </button>
          </form>
        </BorderGlow>
      </section>
    </main>
  )
}

export default ChatPage
