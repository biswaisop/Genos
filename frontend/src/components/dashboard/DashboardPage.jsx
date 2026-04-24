import { useState } from 'react'
import BorderGlow from '../common/BorderGlow'

const mockConnections = [
  {
    name: 'Prod API Server',
    status: 'Online',
    lastSeen: '2 min ago',
    recentCommands: ['docker ps', 'systemctl restart nginx', 'tail -n 100 /var/log/app.log'],
  },
  {
    name: 'Staging Worker',
    status: 'Online',
    lastSeen: '5 min ago',
    recentCommands: ['python worker.py --sync', 'ls -la /srv/jobs', 'journalctl -u worker -n 50'],
  },
  {
    name: 'Analytics Node',
    status: 'Disconnected',
    lastSeen: '12 min ago',
    recentCommands: ['htop', 'df -h', 'python run_etl.py --dry-run'],
  },
]

function DashboardPage() {
  const [expandedCard, setExpandedCard] = useState(null)
  const [actionsOpenFor, setActionsOpenFor] = useState(null)
  const onlineConnections = mockConnections.filter(
    (connection) => connection.status === 'Online',
  )
  const disconnectedConnections = mockConnections.filter(
    (connection) => connection.status !== 'Online',
  )

  return (
    <main className="dashboard-main">
      <section className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Monitor and manage your currently connected servers and execution endpoints.</p>
      </section>

      <section className="dashboard-stats" aria-label="Connection summary">
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Total connections</h2>
          <p>{mockConnections.length}</p>
        </BorderGlow>
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Online</h2>
          <p>{mockConnections.filter((item) => item.status === 'Online').length}</p>
        </BorderGlow>
        <BorderGlow as="article" className="dashboard-stat-card" glowColor="270 100% 75%">
          <h2>Disconnected</h2>
          <p>{mockConnections.filter((item) => item.status !== 'Online').length}</p>
        </BorderGlow>
      </section>

      <section className="dashboard-connections" aria-label="Existing connections">
        <div className="dashboard-connections__heading">
          <h2>Existing connections</h2>
          <button type="button" className="dashboard-add-btn">
            + Add connection
          </button>
        </div>

        <div className="dashboard-connection-group">
          <h3>Online connections</h3>
          <div className="dashboard-grid">
            {onlineConnections.map((connection) => (
              <BorderGlow
                key={connection.name}
                as="article"
                className="dashboard-connection-card"
                glowColor="270 100% 75%"
              >
                <div className="dashboard-connection-top">
                  <h3>{connection.name}</h3>
                  <div className="connection-top-right">
                    <span className="connection-status ok">{connection.status}</span>
                    <div className="connection-actions-menu">
                      <button
                        type="button"
                        className="connection-menu-btn"
                        aria-label="Connection options"
                        onClick={() =>
                          setActionsOpenFor((prev) =>
                            prev === connection.name ? null : connection.name,
                          )
                        }
                      >
                        ...
                      </button>
                      {actionsOpenFor === connection.name ? (
                        <div className="connection-menu-dropdown">
                          <button type="button">Remove connection</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ul className="connection-details">
                  <li>Type: VPS</li>
                </ul>
                <div className="connection-meta-row">
                  <div className="connection-meta-left">
                    <p className="connection-active-since">
                      Active since: {connection.lastSeen}
                    </p>
                    <button type="button" className="connection-action-btn disconnect">
                      Disconnect
                    </button>
                  </div>
                  <button
                    type="button"
                    className="recent-commands-btn"
                    onClick={() =>
                      setExpandedCard((prev) =>
                        prev === connection.name ? null : connection.name,
                      )
                    }
                  >
                    Recent Commands
                  </button>
                </div>
                {expandedCard === connection.name ? (
                  <div className="recent-commands-dropdown">
                    <ul>
                      {connection.recentCommands.slice(0, 3).map((command) => (
                        <li key={command}>
                          <code>{command}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </BorderGlow>
            ))}
          </div>
        </div>

        <div className="dashboard-connection-group">
          <h3>Disconnected connections</h3>
          <div className="dashboard-grid">
            {disconnectedConnections.map((connection) => (
              <BorderGlow
                key={connection.name}
                as="article"
                className="dashboard-connection-card"
                glowColor="270 100% 75%"
              >
                <div className="dashboard-connection-top">
                  <h3>{connection.name}</h3>
                  <div className="connection-top-right">
                    <span className="connection-status warn">{connection.status}</span>
                    <div className="connection-actions-menu">
                      <button
                        type="button"
                        className="connection-menu-btn"
                        aria-label="Connection options"
                        onClick={() =>
                          setActionsOpenFor((prev) =>
                            prev === connection.name ? null : connection.name,
                          )
                        }
                      >
                        ...
                      </button>
                      {actionsOpenFor === connection.name ? (
                        <div className="connection-menu-dropdown">
                          <button type="button">Remove connection</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ul className="connection-details">
                  <li>Type: VPS</li>
                </ul>
                <div className="connection-meta-row">
                  <div className="connection-meta-left">
                    <p className="connection-active-since">
                      Disconnected: {connection.lastSeen}
                    </p>
                    <button type="button" className="connection-action-btn reconnect">
                      Reconnect
                    </button>
                  </div>
                  <button
                    type="button"
                    className="recent-commands-btn"
                    onClick={() =>
                      setExpandedCard((prev) =>
                        prev === connection.name ? null : connection.name,
                      )
                    }
                  >
                    Recent Commands
                  </button>
                </div>
                {expandedCard === connection.name ? (
                  <div className="recent-commands-dropdown">
                    <ul>
                      {connection.recentCommands.slice(0, 3).map((command) => (
                        <li key={command}>
                          <code>{command}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </BorderGlow>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

export default DashboardPage
