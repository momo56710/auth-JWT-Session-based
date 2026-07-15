/**
 * JwtAuth — demonstrates the JWT + refresh token flow.
 *
 * Differences from SessionAuth you should notice:
 *   • No credentials: 'include' in fetch — cookies are not used at all.
 *   • Tokens arrive in the response body and are stored in React state.
 *   • Protected requests carry an "Authorization: Bearer <token>" header.
 *   • A countdown timer shows the access token expiring after 30 seconds.
 *   • After expiry, "Fetch Protected" returns 401; "Refresh Token" gets a new one.
 *   • Logout revokes the refresh token but the access token lives until expiry.
 *
 * JWT structure (header.payload.signature):
 *   Header   — algorithm + type (base64url-encoded JSON)
 *   Payload  — claims: sub, exp, iat, jti, type (base64url-encoded JSON)
 *   Signature — HMAC-SHA256(header + "." + payload, secret)
 *   All three parts are in the token string — the server needs no DB to read them.
 */

import { useEffect, useRef, useState } from 'react'

const API = 'http://localhost:8000'

/**
 * JWT payload is just base64url-encoded JSON — no secret needed to READ it.
 * (The secret is only needed to VERIFY the signature.)
 * This function decodes it client-side for display purposes.
 */
function decodeJwtPayload(token) {
  try {
    // Replace URL-safe chars, pad to multiple of 4, then decode
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export default function JwtAuth() {
  const [username, setUsername] = useState('alice')
  const [password, setPassword] = useState('password123')
  const [accessToken, setAccessToken] = useState(null)
  const [refreshToken, setRefreshToken] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [protectedData, setProtectedData] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  function addLog(message, type = 'info') {
    setLog(prev => [...prev.slice(-19), { message, type, time: new Date().toLocaleTimeString() }])
  }

  // Start a countdown whenever we receive a new access token
  useEffect(() => {
    if (!accessToken) return

    const payload = decodeJwtPayload(accessToken)
    if (!payload) return

    // Clear any previous timer before starting a new one
    clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      const remaining = payload.exp - Math.floor(Date.now() / 1000)
      setSecondsLeft(remaining > 0 ? remaining : 0)

      if (remaining <= 0) {
        clearInterval(timerRef.current)
        addLog('Access token expired! Protected requests will now return 401.', 'warning')
        addLog('Click "Refresh Token" to get a new access token without re-logging in.', 'info')
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [accessToken])

  // ---------- API calls ----------

  async function login() {
    setLoading(true)
    try {
      // No credentials: 'include' — JWT login doesn't set cookies
      const res = await fetch(`${API}/jwt/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (res.ok) {
        setAccessToken(data.access_token)
        setRefreshToken(data.refresh_token)
        setIsLoggedIn(true)
        addLog(
          `Logged in. Access token (${data.access_expires_in}s) + refresh token (${data.refresh_expires_in}s) received.`,
          'success'
        )
        addLog('Tokens stored in React state. Server stored NO session data.', 'info')
        addLog('Watch the countdown — access token expires in 30 seconds!', 'warning')
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
      // Client MUST manually attach the token in the Authorization header.
      // Unlike cookies, the browser does NOT do this automatically.
      const res = await fetch(`${API}/jwt/protected`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await res.json()

      if (res.ok) {
        setProtectedData(data)
        addLog('Access granted. Server verified JWT signature — zero DB lookups!', 'success')
        addLog(`Token has ${data.seconds_until_expiry}s remaining.`, 'info')
      } else {
        setProtectedData(null)
        addLog(`Access denied: ${data.detail}`, 'error')
        if (res.status === 401) {
          addLog('Token expired. Use "Refresh Token" to get a new access token.', 'warning')
        }
      }
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  async function refreshAccessToken() {
    setLoading(true)
    try {
      // The refresh token is sent to the dedicated /refresh endpoint.
      // In production this call would be made automatically by an HTTP interceptor
      // (e.g. axios interceptors) when any request returns 401, then the original
      // request is retried transparently.
      const res = await fetch(`${API}/jwt/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const data = await res.json()

      if (res.ok) {
        // Replace the old access token; the refresh token stays the same
        setAccessToken(data.access_token)
        addLog('Access token refreshed! New 30-second token issued without re-login.', 'success')
        addLog('The refresh token was reused (it is not rotated in this demo).', 'info')
      } else {
        addLog(`Refresh failed: ${data.detail}`, 'error')
        if (res.status === 401) {
          // Refresh token also expired or was revoked — full re-login required
          setIsLoggedIn(false)
          setAccessToken(null)
          setRefreshToken(null)
          setSecondsLeft(null)
          addLog('Refresh token invalid. Must log in again.', 'error')
        }
      }
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  async function logout() {
    setLoading(true)
    try {
      // We send the refresh token so the server can revoke it (remove its JTI).
      // The access token CANNOT be revoked — it will remain valid until expiry.
      const res = await fetch(`${API}/jwt/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const data = await res.json()

      clearInterval(timerRef.current)
      setIsLoggedIn(false)
      setAccessToken(null)
      setRefreshToken(null)
      setProtectedData(null)
      setSecondsLeft(null)

      addLog(`Logged out. Refresh token revoked on server.`, 'success')
      addLog(`Caveat: ${data.caveat}`, 'warning')
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  // ---------- Derived display values ----------

  const accessPayload = accessToken ? decodeJwtPayload(accessToken) : null
  const isExpired = secondsLeft !== null && secondsLeft <= 0
  const isUrgent = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 10

  return (
    <div className="auth-panel jwt-panel">
      <div className="panel-header">
        <h2>JWT + Refresh Token</h2>
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
          <button onClick={login} disabled={loading} className="btn btn-jwt">
            Login
          </button>
        </div>
      ) : (
        <div className="logged-in-section">
          {/* Access token info */}
          <div className="info-box">
            <h4>What the client holds</h4>
            <div className="token-display">
              {/* Access token card */}
              <div className={`token-card ${isExpired ? 'expired' : ''}`}>
                <div className="token-card-header">
                  <span className="token-label">Access Token</span>
                  {secondsLeft !== null && (
                    <span
                      className={`token-timer ${isExpired ? 'timer-expired' : isUrgent ? 'timer-urgent' : ''}`}
                    >
                      {isExpired ? 'EXPIRED' : `${secondsLeft}s`}
                    </span>
                  )}
                </div>

                {/* Show the decoded payload — anyone can do this without the secret */}
                {accessPayload && (
                  <div className="token-payload">
                    <div className="data-row">
                      <span>sub (user):</span>
                      <code>{accessPayload.sub}</code>
                    </div>
                    <div className="data-row">
                      <span>type:</span>
                      <code>{accessPayload.type}</code>
                    </div>
                    <div className="data-row">
                      <span>exp:</span>
                      <code>{new Date(accessPayload.exp * 1000).toLocaleTimeString()}</code>
                    </div>
                    <div className="data-row">
                      <span>jti:</span>
                      <code>{accessPayload.jti?.slice(0, 12)}...</code>
                    </div>
                    <div className="data-row note">
                      This payload is embedded in the token — server reads it without any DB lookup.
                    </div>
                  </div>
                )}

                {/* Show a truncated raw token to emphasise it's just text */}
                <div className="raw-token">
                  <span className="raw-token-label">Raw JWT:</span>
                  <code className="raw-token-value">{accessToken.slice(0, 40)}...</code>
                </div>
              </div>

              {/* Refresh token card */}
              <div className="token-card">
                <div className="token-card-header">
                  <span className="token-label">Refresh Token</span>
                  <span className="token-note">Long-lived (5 min in demo)</span>
                </div>
                <div className="token-payload">
                  <div className="data-row note">
                    Sent only to <code>/jwt/refresh</code>. Server tracks its JTI for revocation.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Server state contrast */}
          <div className="info-box server-box">
            <h4>What the server stores</h4>
            <div className="data-display">
              <div className="data-row">
                <span>Access token:</span>
                <code>NOT STORED — stateless!</code>
              </div>
              <div className="data-row">
                <span>Refresh token JTI:</span>
                <code>Tracked in a Set for revocation</code>
              </div>
              <div className="data-row note">
                Any server instance with the same secret can verify the access token independently.
              </div>
            </div>
          </div>

          <div className="action-buttons">
            <button
              onClick={fetchProtected}
              disabled={loading}
              className="btn btn-secondary btn-jwt-secondary"
            >
              Fetch Protected Resource
            </button>

            {/* Refresh button pulses when the token is expired to prompt action */}
            <button
              onClick={refreshAccessToken}
              disabled={loading}
              className={`btn ${isExpired ? 'btn-refresh-needed' : 'btn-refresh-idle'}`}
            >
              {isExpired ? '↺ Refresh Token (needed!)' : '↺ Refresh Token'}
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
      <div className="edu-section jwt-edu">
        <h3 className="edu-title">How JWT auth works in production</h3>

        {/* JWT anatomy */}
        <div className="edu-block">
          <h4 className="edu-block-title">JWT anatomy — three base64url parts joined by dots</h4>
          <div className="jwt-anatomy-display">
            <span className="jwt-seg jwt-header-seg">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</span>
            <span className="jwt-dot-sep">.</span>
            <span className="jwt-seg jwt-payload-seg">eyJzdWIiOiJhbGljZSIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcwMDAwMDB9</span>
            <span className="jwt-dot-sep">.</span>
            <span className="jwt-seg jwt-sig-seg">SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c</span>
          </div>
          <div className="jwt-legend">
            <span className="legend-item"><span className="legend-dot dot-header"></span>Header — algorithm &amp; token type</span>
            <span className="legend-item"><span className="legend-dot dot-payload"></span>Payload — your data (readable by ANYONE, not encrypted!)</span>
            <span className="legend-item"><span className="legend-dot dot-sig"></span>Signature — HMAC proves it hasn't been tampered with</span>
          </div>
          <p className="edu-note">
            Paste any JWT at <strong>jwt.io</strong> to decode the payload instantly —
            no secret needed to <em>read</em>, only to <em>verify</em>.
            Never put passwords or sensitive data in the payload.
          </p>
        </div>

        {/* Access token request lifecycle */}
        <div className="edu-block">
          <h4 className="edu-block-title">Access token — request lifecycle (zero database I/O)</h4>
          <div className="flow-diagram">
            <div className="flow-node">
              <div className="flow-node-title">Browser</div>
              <div className="flow-node-sub">Authorization: Bearer eyJ...</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node good-node">
              <div className="flow-node-title">Server</div>
              <div className="flow-node-sub">verify HMAC signature</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node good-node">
              <div className="flow-node-title">Decode payload</div>
              <div className="flow-node-sub">read sub, role, exp</div>
            </div>
            <div className="flow-arrow-h">→</div>
            <div className="flow-node">
              <div className="flow-node-title">Response</div>
              <div className="flow-node-sub">no DB touched</div>
            </div>
          </div>
          <p className="edu-note good-note">
            No Redis. No database. Any server with the same secret key can verify any token independently —
            this is why JWT scales horizontally without shared state.
          </p>
        </div>

        {/* Refresh token flow */}
        <div className="edu-block">
          <h4 className="edu-block-title">Refresh token — lifecycle when access token expires</h4>
          <div className="flow-diagram flow-vertical">
            <div className="flow-row">
              <div className="flow-node expired-node"><div className="flow-node-title">Access token expires</div></div>
              <div className="flow-arrow-h">→</div>
              <div className="flow-node"><div className="flow-node-title">Client sends refresh token to <code>/refresh</code></div></div>
            </div>
            <div className="flow-down-arrow">↓</div>
            <div className="flow-row">
              <div className="flow-node cost-node"><div className="flow-node-title">Server checks DB</div><div className="flow-node-sub">is the JTI in refresh_tokens table?</div></div>
              <div className="flow-arrow-h">→</div>
              <div className="flow-node good-node"><div className="flow-node-title">New access token issued</div><div className="flow-node-sub">no re-login needed</div></div>
            </div>
          </div>
          <p className="edu-note">
            In production, HTTP clients (axios, fetch wrappers) do this automatically:
            intercept any 401 response → call <code>/refresh</code> → retry the original request.
            The user never sees it happen.
          </p>
        </div>

        {/* Production DB schema */}
        <div className="edu-block">
          <h4 className="edu-block-title">Refresh token — production database schema</h4>
          <pre className="code-block">{`CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,  -- SHA-256(token), NEVER store the raw token
  device_info TEXT,                  -- "Chrome 120 on Mac", "iPhone 15 Safari"
  ip_address  INET,                  -- for security audit / anomaly detection
  issued_at   TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,  -- typically 7–30 days in production
  revoked_at  TIMESTAMPTZ            -- NULL = still valid; SET on logout/rotation
);

-- Fast lookup by token hash on every /refresh call
CREATE UNIQUE INDEX ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;`}</pre>
        </div>

        {/* Three approaches */}
        <div className="edu-block">
          <h4 className="edu-block-title">Three ways to store refresh tokens in production</h4>
          <div className="approaches-grid">

            <div className="approach-card">
              <div className="approach-num">1</div>
              <div className="approach-body">
                <div className="approach-title">Hash the full token <span className="tag tag-secure">Most secure</span></div>
                <pre className="code-block-sm">{`# On login — store SHA-256 of the token, never the raw value
token_hash = SHA256(refresh_token)
db.insert(token_hash=token_hash, user_id=user.id)

# On /refresh — hash the incoming token and compare
incoming_hash = SHA256(request.refresh_token)
row = db.find(token_hash=incoming_hash)
if row: issue_new_access_token()`}</pre>
                <p className="approach-note">
                  Even if the DB is breached, attackers can't use the hashes
                  to impersonate users (can't reverse SHA-256 to get the token).
                </p>
              </div>
            </div>

            <div className="approach-card">
              <div className="approach-num">2</div>
              <div className="approach-body">
                <div className="approach-title">Store only the JTI <span className="tag tag-demo">What this demo does</span></div>
                <pre className="code-block-sm">{`# On login — extract the JTI claim from the JWT payload
jti = decode_jwt(refresh_token).jti   # a UUID in the token
db.insert(jti=jti, user_id=user.id)

# On /refresh — decode and check the JTI
jti = decode_jwt(incoming_token).jti
row = db.find(jti=jti)
if row: issue_new_access_token()`}</pre>
                <p className="approach-note">
                  Simpler — no hashing step. Works well when you trust your
                  DB access controls. JTI is already inside the JWT.
                </p>
              </div>
            </div>

            <div className="approach-card">
              <div className="approach-num">3</div>
              <div className="approach-body">
                <div className="approach-title">Opaque refresh token <span className="tag tag-oauth">OAuth 2.0 style</span></div>
                <pre className="code-block-sm">{`# Refresh token is NOT a JWT — just a random secret string
refresh_token = secrets.token_hex(64)   # 128 random chars
db.insert(token=refresh_token, user_id=user.id)

# Access token is still a JWT (stateless verification)
# Refresh token is a plain exact-match DB lookup
row = db.find(token=incoming_refresh_token)`}</pre>
                <p className="approach-note">
                  Used by Google, GitHub, Stripe OAuth flows.
                  Completely opaque to the client — no decodable payload.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Revocation limitation */}
        <div className="edu-callout warning-callout">
          <strong>Access token revocation — the fundamental JWT trade-off</strong><br />
          Access tokens are stateless. Once issued, they <em>cannot</em> be revoked before
          their <code>exp</code> timestamp — even after logout.
          If stolen post-logout, they work until expiry. Common mitigations:
          <ul className="callout-list">
            <li>Keep access token TTL short — <strong>15 minutes</strong> is the industry standard</li>
            <li>Maintain a <strong>Redis blocklist</strong> of revoked JTIs — but now you have server state again</li>
            <li>Accept the trade-off: short TTL is usually good enough for most apps</li>
          </ul>
        </div>

        {/* Token rotation */}
        <div className="edu-callout info-callout">
          <strong>Token rotation — security best practice (not in this demo)</strong><br />
          On every <code>/refresh</code> call: issue a <em>new</em> refresh token and
          immediately revoke the old one. If a refresh token is stolen and used first,
          the real user's next refresh fails (old token gone) — alerting you to a breach.
          This demo skips rotation to keep the flow simple, but you should implement it in production.
        </div>

        {/* Client-side storage */}
        <div className="edu-block">
          <h4 className="edu-block-title">Where to store tokens on the client — security trade-offs</h4>
          <div className="storage-options">
            <div className="storage-option">
              <div className="storage-header">
                <div className="storage-name">JavaScript memory</div>
                <span className="tag tag-secure">Most secure</span>
              </div>
              <div className="storage-note">
                A plain variable or React state. Lost on page refresh.
                XSS cannot access it. Use for <strong>access tokens</strong> in SPAs.
              </div>
            </div>
            <div className="storage-option">
              <div className="storage-header">
                <div className="storage-name">localStorage / sessionStorage</div>
                <span className="tag tag-warn">XSS risk</span>
              </div>
              <div className="storage-note">
                Survives page refresh. But any JavaScript on the page can read it —
                dangerous with third-party scripts (ads, analytics, CDNs).
                Avoid for tokens if possible.
              </div>
            </div>
            <div className="storage-option">
              <div className="storage-header">
                <div className="storage-name">httpOnly cookie</div>
                <span className="tag tag-ok">Best for refresh tokens</span>
              </div>
              <div className="storage-note">
                JavaScript cannot read it (XSS-safe).
                Requires CSRF protection (SameSite flag or CSRF token).
                The recommended place to store <strong>refresh tokens</strong>.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
