import { useEffect, useMemo, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import { connectServer, deleteServer, disconnectServer, listServers } from '../../lib/serverApi'

function DashboardPage({ onAddConnection, onOpenChat }) {
  const [actionsOpenFor, setActionsOpenFor] = useState(null)
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const token = localStorage.getItem('genos_access_token')

  const onlineConnections = useMemo(
    () => connections.filter((connection) => connection.status === 'connected'),
    [connections],
  )
  const disconnectedConnections = useMemo(
    () => connections.filter((connection) => connection.status !== 'connected'),
    [connections],
  )

  async function refreshConnections() {
    if (!token) {
      setFeedback('Please sign in to view connections.')
      return
    }
    try {
      setLoading(true)
      const data = await listServers(token)
      setConnections(Array.isArray(data) ? data : [])
      setFeedback('')
    } catch (error) {
      setFeedback(error.message || 'Could not load connections.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(action, serverId) {
    if (!token) {
      setFeedback('Session expired. Please sign in again.')
      return
    }
    if (!serverId) {
      setFeedback('This connection is missing a server ID, so this action cannot run.')
      return
    }
    try {
      setActionLoading(`${action}:${serverId}`)
      setFeedback('')
      if (action === 'connect') {
        await connectServer(token, serverId)
        setFeedback(`Reconnected ${serverId}.`)
      } else if (action === 'disconnect') {
        await disconnectServer(token, serverId)
        setFeedback(`Disconnected ${serverId}.`)
      } else if (action === 'delete') {
        await deleteServer(token, serverId)
        setFeedback(`Removed ${serverId}.`)
      }
      setActionsOpenFor(null)
      await refreshConnections()
    } catch (error) {
      const detail = error?.payload?.detail || error.message
      setFeedback(detail || `Failed to ${action} connection.`)
    } finally {
      setActionLoading('')
    }
  }

  useEffect(() => {
    refreshConnections()
  }, [])

  return (
    <main className="dashboard-main">
      <section className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Monitor and manage your currently connected servers and execution endpoints.</p>
      </section>

      <section className="dashboard-stats" aria-label="Connection summary">
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Total connections</h2>
          <p>{connections.length}</p>
        </BorderGlow>
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Online</h2>
          <p>{onlineConnections.length}</p>
        </BorderGlow>
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Disconnected</h2>
          <p>{disconnectedConnections.length}</p>
        </BorderGlow>
      </section>

      <section className="dashboard-connections" aria-label="Existing connections">
        <div className="dashboard-connections__heading">
          <h2>Existing connections</h2>
          <div className="dashboard-connections-actions">
            <button type="button" className="dashboard-add-btn" onClick={refreshConnections}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="dashboard-add-btn" onClick={onAddConnection}>
              + Add connection
            </button>
          </div>
        </div>
        {feedback ? <p className="dashboard-feedback">{feedback}</p> : null}

        <div className="dashboard-connection-group">
          <h3>Online connections</h3>
          <div className="dashboard-grid">
            {onlineConnections.map((connection) => (
              <BorderGlow
                key={connection.server_id || connection.name}
                as="article"
                className="dashboard-connection-card"
                glowColor="270 100% 75%"
              >
                <div className="dashboard-connection-top">
                  <h3>{connection.name || connection.server_id}</h3>
                  <div className="connection-top-right">
                    <span className="connection-status ok">Online</span>
                    <div className="connection-actions-menu">
                      <button
                        type="button"
                        className="connection-menu-btn"
                        aria-label="Connection options"
                        onClick={() =>
                          setActionsOpenFor((prev) =>
                            prev === connection.server_id ? null : connection.server_id,
                          )
                        }
                      >
                        ...
                      </button>
                      {actionsOpenFor === connection.server_id ? (
                        <div className="connection-menu-dropdown">
                          <button
                            type="button"
                            disabled={actionLoading === `disconnect:${connection.server_id}`}
                            onClick={() => handleAction('disconnect', connection.server_id)}
                          >
                            {actionLoading === `disconnect:${connection.server_id}`
                              ? 'Disconnecting...'
                              : 'Disconnect'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === `delete:${connection.server_id}`}
                            onClick={() => handleAction('delete', connection.server_id)}
                          >
                            {actionLoading === `delete:${connection.server_id}`
                              ? 'Removing...'
                              : 'Remove connection'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ul className="connection-details">
                  <li>Host: {connection.host || 'N/A'}</li>
                </ul>
                <div className="connection-meta-row">
                  <div className="connection-meta-left">
                    <p className="connection-active-since">
                      Active since: {connection.last_connected_at || 'Recently'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="recent-commands-btn"
                    disabled={!connection.server_id}
                    onClick={() => onOpenChat(connection.server_id)}
                  >
                    Open chat
                  </button>
                </div>
              </BorderGlow>
            ))}
          </div>
        </div>

        <div className="dashboard-connection-group">
          <h3>Disconnected connections</h3>
          <div className="dashboard-grid">
            {disconnectedConnections.map((connection) => (
              <BorderGlow
                key={connection.server_id || connection.name}
                as="article"
                className="dashboard-connection-card"
                glowColor="270 100% 75%"
              >
                <div className="dashboard-connection-top">
                  <h3>{connection.name || connection.server_id}</h3>
                  <div className="connection-top-right">
                    <span className="connection-status warn">Disconnected</span>
                    <div className="connection-actions-menu">
                      <button
                        type="button"
                        className="connection-menu-btn"
                        aria-label="Connection options"
                        onClick={() =>
                          setActionsOpenFor((prev) =>
                            prev === connection.server_id ? null : connection.server_id,
                          )
                        }
                      >
                        ...
                      </button>
                      {actionsOpenFor === connection.server_id ? (
                        <div className="connection-menu-dropdown">
                          <button
                            type="button"
                            disabled={actionLoading === `connect:${connection.server_id}`}
                            onClick={() => handleAction('connect', connection.server_id)}
                          >
                            {actionLoading === `connect:${connection.server_id}`
                              ? 'Reconnecting...'
                              : 'Reconnect'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === `delete:${connection.server_id}`}
                            onClick={() => handleAction('delete', connection.server_id)}
                          >
                            {actionLoading === `delete:${connection.server_id}`
                              ? 'Removing...'
                              : 'Remove connection'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ul className="connection-details">
                  <li>Host: {connection.host || 'N/A'}</li>
                </ul>
                <div className="connection-meta-row">
                  <div className="connection-meta-left">
                    <p className="connection-active-since">
                      Disconnected: {connection.last_connected_at || 'Unknown'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="recent-commands-btn"
                    disabled={!connection.server_id}
                    onClick={() => onOpenChat(connection.server_id)}
                  >
                    Open chat
                  </button>
                </div>
              </BorderGlow>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

export default DashboardPage
