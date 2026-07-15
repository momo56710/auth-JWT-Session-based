/**
 * SessionAuth — demonstrates the cookie-based session flow.
 *
 * Key fetch option: credentials: 'include'
 *   Without this the browser will NOT send or accept cookies cross-origin.
 *   The backend's CORS middleware must also have allow_credentials=True.
 *
 * What to watch in the demo:
 *   1. After login the browser receives a Set-Cookie header — inspect it in DevTools.
 *   2. Every subsequent request in this panel automatically includes that cookie.
 *   3. The server-side store shows the session entry existing on the server.
 *   4. On logout the entry is deleted; the cookie becomes worthless immediately.
 */

import { useState } from 'react'

const API = 'http://localhost:8000'

function formatTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString()
}

export default function SessionAuth() {
  const [username, setUsername] = useState('alice')
  const [password, setPassword] = useState('password123')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loginInfo, setLoginInfo] = useState(null)
  const [protectedData, setProtectedData] = useState(null)
  const [serverState, setServerState] = useState(null)
  const [userTable, setUserTable] = useState(null)
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)

  function addLog(message, type = 'info') {
    setLog(prev => [...prev.slice(-19), { message, type, time: new Date().toLocaleTimeString() }])
  }

  // ---------- API calls ----------

  async function login() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/session/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // credentials: 'include' tells the browser to send and store cookies
        // across this cross-origin request (frontend port 5173 → backend port 8000)
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (res.ok) {
        setIsLoggedIn(true)
        setLoginInfo(data)
        addLog('Logged in. Server created a session and set an httpOnly cookie.', 'success')
        addLog(`Session ID (first 8 chars): ${data.session_id_preview}`, 'info')
        addLog('Check DevTools → Application → Cookies to see the cookie!', 'info')
        fetchServerState()
        fetchUserTable()
      } else {
        addLog(`Login failed: ${data.detail}`, 'error')
      }
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  async function fetchProtected() {
    setLoading(true)
    try {
      // The browser automatically attaches the session_id cookie here.
      // The frontend writes NO auth-specific header — the browser handles it.
      const res = await fetch(`${API}/session/protected`, {
        credentials: 'include',
      })
      const data = await res.json()

      if (res.ok) {
        setProtectedData(data)
        addLog('Protected resource accessed. Server looked up session in its memory store.', 'success')
      } else {
        setProtectedData(null)
        setIsLoggedIn(false)
        addLog(`Access denied: ${data.detail}`, 'error')
      }
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  async function fetchServerState() {
    try {
      const res = await fetch(`${API}/session/session-store`, { credentials: 'include' })
      if (res.ok) setServerState(await res.json())
    } catch (_) {}
  }

  async function fetchUserTable() {
    try {
      const res = await fetch(`${API}/session/users`, { credentials: 'include' })
      if (res.ok) setUserTable(await res.json())
    } catch (_) {}
  }

  async function logout() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/session/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      setIsLoggedIn(false)
      setLoginInfo(null)
      setProtectedData(null)
      addLog(`Logged out. ${data.message}`, 'success')
      addLog(`Sessions remaining on server: ${data.remaining_sessions}`, 'info')
      addLog('Any copy of that cookie is now worthless — immediate revocation!', 'success')
      fetchServerState()
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  // ---------- Render ----------

  return (
    <div className="auth-panel session-panel">
      <div className="panel-header">
        <h2>Session Auth</h2>
        <span className={`status-badge ${isLoggedIn ? 'logged-in' : 'logged-out'}`}>
          {isLoggedIn ? '● Logged In' : '○ Logged Out'}
        </span>
      </div>

      {!isLoggedIn ? (
        <div className="login-form">
          <p className="form-hint">
            Users from <code>data/users.json</code>:
            alice/password123 · bob/secret456 · charlie/charlie789
          </p>
          {/* Quick-fill buttons — click a user to pre-fill the form */}
          <div className="user-quick-fill">
            {['alice', 'bob', 'charlie'].map(u => (
              <button
                key={u}
                className="btn-user-chip"
                onClick={() => {
                  setUsername(u)
                  setPassword({ alice: 'password123', bob: 'secret456', charlie: 'charlie789' }[u])
                }}
              >
                {u}
              </button>
            ))}
          </div>
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button onClick={login} disabled={loading} className="btn btn-session">
            Login
          </button>
        </div>
      ) : (
        <div className="logged-in-section">
          {/* What the client has */}
          <div className="info-box">
            <h4>What the client holds</h4>
            <p className="box-note">
              An <strong>httpOnly cookie</strong>. JavaScript cannot read it —
              the browser manages it invisibly. Try <code>document.cookie</code>{' '}
              in DevTools console: the session_id won't appear.
            </p>
            {loginInfo && (
              <div className="data-display">
                <div className="data-row">
                  <span>Session ID (partial):</span>
                  <code>{loginInfo.session_id_preview}</code>
                </div>
                <div className="data-row note">
                  The full ID exists only as a cookie — not in JavaScript memory.
                </div>
              </div>
            )}
          </div>

          {/* What the server has */}
          {serverState && (
            <div className="info-box server-box">
              <h4>What the server stores</h4>
              <div className="data-display">
                <div className="data-row">
                  <span>Active sessions:</span>
                  <code>{serverState.active_sessions}</code>
                </div>
                {Object.entries(serverState.sessions).map(([id, s]) => (
                  <div key={id} className="session-entry">
                    <code>{id}</code> → user: <strong>{s.username}</strong>,
                    expires: {formatTime(s.expires_at)}
                  </div>
                ))}
              </div>
              <button onClick={fetchServerState} className="btn btn-small">
                Refresh Server State
              </button>
            </div>
          )}

          {/* User table — shows data/users.json so you can see the "DB" */}
          {userTable && (
            <div className="info-box">
              <h4>User table — <code>data/users.json</code></h4>
              <table className="mini-table">
                <thead>
                  <tr><th>Username</th><th>Role</th><th>Email</th></tr>
                </thead>
                <tbody>
                  {Object.entries(userTable.users).map(([u, d]) => (
                    <tr key={u} className={u === loginInfo?.session_data_written_to_file?.username ? 'active-row' : ''}>
                      <td><code>{u}</code></td>
                      <td><span className={`role-badge role-${d.role}`}>{d.role}</span></td>
                      <td>{d.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="action-buttons">
            <button onClick={fetchProtected} disabled={loading} className="btn btn-secondary btn-session-secondary">
              Fetch Protected Resource
            </button>
            <button onClick={logout} disabled={loading} className="btn btn-danger">
              Logout
            </button>
          </div>

          {protectedData && (
            <div className="result-box">
              <h4>Server Response</h4>
              <pre>{JSON.stringify(protectedData, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <div className="activity-log">
        <h4>Activity Log</h4>
        {log.length === 0 && <p className="log-empty">No activity yet. Log in to start!</p>}
        {log.map((entry, i) => (
          <div key={i} className={`log-entry log-${entry.type}`}>
            <span className="log-time">{entry.time}</span> {entry.message}
          </div>
        ))}
      </div>

      {/* ── Educational section — always visible, designed for teaching ── */}
      <div className="edu-section session-edu">
        <h3 className="edu-title">How session auth works in production</h3>

        {/* Request lifecycle */}
        <div className="edu-block">
          <h4 className="edu-block-title">Request lifecycle — what happens on every protected route</h4>
          <div className="flow-diagram">
            <div className="flow-node">
              <div className="flow-node-title">Browser</div>
              <div className="flow-node-sub">sends cookie automatically</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node">
              <div className="flow-node-title">Server</div>
              <div className="flow-node-sub">reads session_id from cookie</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node cost-node">
              <div className="flow-node-title">Redis / DB</div>
              <div className="flow-node-sub">lookup session data</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node">
              <div className="flow-node-title">Response</div>
              <div className="flow-node-sub">user data returned</div>
            </div>
          </div>
          <p className="edu-note cost-note">
            The store lookup happens on <strong>every single request</strong>.
            This is the main performance cost — and why all server instances
            must share the same store.
          </p>
        </div>

        {/* Redis */}
        <div className="edu-block">
          <h4 className="edu-block-title">Production storage — Option 1: Redis <span className="tag tag-recommended">Recommended</span></h4>
          <p className="edu-desc">Sub-millisecond reads, built-in TTL, used by GitHub, Stripe, Twitter. The industry standard for session storage.</p>
          <pre className="code-block">{`# Login — write session data with automatic expiry (EX = seconds)
SET session:a3f7b2c1 '{"username":"alice","role":"admin","email":"alice@example.com"}' EX 3600

# Protected request — one lookup, no join needed
GET session:a3f7b2c1
→ returns the JSON object if valid, nil if expired or deleted

# Logout — delete instantly (this is why revocation is trivial)
DEL session:a3f7b2c1`}</pre>
        </div>

        {/* DB schema */}
        <div className="edu-block">
          <h4 className="edu-block-title">Production storage — Option 2: Database table</h4>
          <p className="edu-desc">Simpler stack (no Redis), but slower and needs a cleanup job to remove expired rows.</p>
          <pre className="code-block">{`CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,           -- role, email, preferences, etc.
  ip_address INET,                     -- for security audit logs
  user_agent TEXT,                     -- "Chrome 120 on Windows"
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Needed for fast session lookups (UUID PK is already indexed)
-- Also needed for a cleanup cron job: DELETE WHERE expires_at < now()
CREATE INDEX ON sessions (expires_at);`}</pre>
        </div>

        {/* Scaling callout */}
        <div className="edu-callout warning-callout">
          <strong>Horizontal scaling challenge</strong><br />
          Every server instance must reach the <em>same</em> session store.
          If you run 10 instances behind a load balancer, they must all share one Redis or DB —
          because any instance can receive any user's request, and all must be able
          to look up that session ID. You cannot just add servers without also
          configuring the shared store.
        </div>

        {/* Cookie security flags */}
        <div className="edu-block">
          <h4 className="edu-block-title">Cookie security flags — what they do and why</h4>
          <div className="flags-list">
            <div className="flag-item">
              <code className="flag-name">HttpOnly</code>
              <div className="flag-desc">
                JavaScript <strong>cannot</strong> read this cookie.
                <code>document.cookie</code> won't show it.
                Blocks XSS attacks from stealing the session ID.
              </div>
            </div>
            <div className="flag-item">
              <code className="flag-name">SameSite=Lax</code>
              <div className="flag-desc">
                Browser only sends the cookie on <strong>same-site</strong> navigations and GET requests.
                Blocks CSRF attacks where a malicious site tricks the browser into making requests.
              </div>
            </div>
            <div className="flag-item">
              <code className="flag-name">Secure</code>
              <div className="flag-desc">
                Cookie is <strong>only sent over HTTPS</strong>.
                Prevents the session ID being intercepted on plain HTTP.
                Always enable in production.
              </div>
            </div>
          </div>
        </div>

        {/* Logout advantage */}
        <div className="edu-callout info-callout">
          <strong>Revocation advantage over JWT</strong><br />
          Logout is <em>immediate and complete</em>.
          The moment <code>DEL session:id</code> runs, that session ID is worthless —
          even if someone kept a copy of the cookie.
          There is no "grace period" like with JWT access tokens.
        </div>
      </div>
    </div>
  )
}
