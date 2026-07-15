/**
 * OAuthAuth — demonstrates the OAuth 2.0 Authorization Code flow.
 *
 * Unlike Session/JWT panels (which use fetch() inside the component), OAuth
 * requires full browser redirects: the user leaves the app, authenticates with
 * the provider, then comes back. We detect the return via ?oauth=success in
 * the URL and immediately check the session cookie the backend set.
 *
 * After a successful OAuth login the backend creates a standard session entry
 * in sessions.json — so you can open that file and watch the OAuth user appear
 * exactly like a regular session login.
 */

import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

export default function OAuthAuth() {
  const [sessionData, setSessionData] = useState(null)
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState(null)

  function addLog(message, type = 'info') {
    setLog(prev => [...prev.slice(-19), { message, type, time: new Date().toLocaleTimeString() }])
  }

  // On mount: check if we just returned from an OAuth provider
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') === 'success') {
      const p = params.get('provider') || 'provider'
      setProvider(p)
      addLog(`Returned from ${p} — verifying session cookie…`, 'info')
      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname)
      fetchProtected(p)
    }
  }, [])

  async function fetchProtected(p) {
    setLoading(true)
    try {
      // The backend set a session_id cookie on the redirect — send it back
      const res = await fetch(`${API}/session/protected`, { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setSessionData(data)
        addLog(`Logged in via ${p || 'OAuth'} as ${data.user}.`, 'success')
        addLog('Backend created a session entry in sessions.json — same as a regular session login.', 'info')
      } else {
        addLog(`Session check failed: ${data.detail}`, 'error')
      }
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  async function logout() {
    setLoading(true)
    try {
      await fetch(`${API}/session/logout`, { method: 'POST', credentials: 'include' })
      setSessionData(null)
      setProvider(null)
      addLog('Logged out. Session entry removed from sessions.json.', 'success')
    } catch (e) {
      addLog(`Network error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  const isLoggedIn = !!sessionData

  return (
    <div className="auth-panel oauth-panel">
      <div className="panel-header">
        <h2>OAuth 2.0</h2>
        <span className={`status-badge ${isLoggedIn ? 'logged-in' : 'logged-out'}`}>
          {isLoggedIn ? `● ${provider || 'OAuth'}` : '○ Logged Out'}
        </span>
      </div>

      {!isLoggedIn ? (
        <div className="oauth-login-section">
          <p className="form-hint">
            Click a provider below. You'll be redirected to authenticate there,
            then returned here with a session cookie already set.
          </p>

          <div className="oauth-buttons">
            <a
              href={`${API}/oauth/google/login`}
              className="oauth-btn oauth-btn-google"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
                <path d="M6.3 14.7l7 5.1C15.2 16.5 19.3 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" fill="#FF3D00"/>
                <path d="M24 46c5.5 0 10.5-1.8 14.4-5L31.9 35c-2.2 1.5-5 2.5-7.9 2.5-6.1 0-11.3-4.1-13.1-9.6L3.7 33.5C7.1 40.8 14.9 46 24 46z" fill="#4CAF50"/>
                <path d="M44.5 20H24v8.5h11.8c-.9 2.7-2.7 5-5.1 6.5l6.5 5C41 36 45 31 45 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
              </svg>
              Sign in with Google
              <span className="oauth-btn-tag">Free</span>
            </a>

            <a
              href={`${API}/oauth/github/login`}
              className="oauth-btn oauth-btn-github"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              Sign in with GitHub
              <span className="oauth-btn-tag">Free</span>
            </a>

            <div className="oauth-btn oauth-btn-apple oauth-btn-disabled">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Sign in with Apple
              <span className="oauth-btn-tag oauth-btn-tag-paid">$99/yr required</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="logged-in-section">
          <div className="info-box">
            <h4>OAuth session — what the server stored</h4>
            <p className="box-note">
              After OAuth the backend created a regular session entry in{' '}
              <code>sessions.json</code> — the same format as password-based session login.
              The only difference is the <code>provider</code> field.
            </p>
            <div className="data-display">
              <div className="data-row">
                <span>User:</span><code>{sessionData.user}</code>
              </div>
              <div className="data-row">
                <span>Role:</span><code>{sessionData.role}</code>
              </div>
              <div className="data-row">
                <span>Verified via:</span><code>{sessionData.how_verified}</code>
              </div>
            </div>
          </div>

          <div className="action-buttons">
            <button onClick={() => fetchProtected(provider)} disabled={loading} className="btn btn-secondary btn-oauth-secondary">
              Check Session
            </button>
            <button onClick={logout} disabled={loading} className="btn btn-danger">
              Logout
            </button>
          </div>
        </div>
      )}

      <div className="activity-log">
        <h4>Activity Log</h4>
        {log.length === 0 && <p className="log-empty">Click a provider above to start the OAuth flow.</p>}
        {log.map((entry, i) => (
          <div key={i} className={`log-entry log-${entry.type}`}>
            <span className="log-time">{entry.time}</span> {entry.message}
          </div>
        ))}
      </div>

      {/* ── Educational section ─────────────────────────────────────────────── */}
      <div className="edu-section oauth-edu">
        <h3 className="edu-title">How OAuth 2.0 Authorization Code flow works</h3>

        <div className="edu-block">
          <h4 className="edu-block-title">Full flow — what happens when you click "Sign in with Google"</h4>
          <div className="flow-diagram flow-vertical">
            <div className="flow-row">
              <div className="flow-node good-node"><div className="flow-node-title">1. Your App</div><div className="flow-node-sub">builds auth URL + state</div></div>
              <div className="flow-arrow-h">→</div>
              <div className="flow-node"><div className="flow-node-title">2. Google</div><div className="flow-node-sub">user logs in & consents</div></div>
              <div className="flow-arrow-h">→</div>
              <div className="flow-node"><div className="flow-node-title">3. Redirect</div><div className="flow-node-sub">/callback?code=…&state=…</div></div>
            </div>
            <div className="flow-down-arrow">↓</div>
            <div className="flow-row">
              <div className="flow-node"><div className="flow-node-title">6. Session</div><div className="flow-node-sub">cookie set, redirect home</div></div>
              <div className="flow-arrow-h">←</div>
              <div className="flow-node"><div className="flow-node-title">5. User info</div><div className="flow-node-sub">GET /userinfo with token</div></div>
              <div className="flow-arrow-h">←</div>
              <div className="flow-node good-node"><div className="flow-node-title">4. Token exchange</div><div className="flow-node-sub">POST code → access token</div></div>
            </div>
          </div>
          <p className="edu-note">
            Steps 4 and 5 are <strong>server-to-server</strong> — the browser never sees the access token.
            The user only ever handles the authorization code, which expires in seconds.
          </p>
        </div>

        <div className="edu-block">
          <h4 className="edu-block-title">Why the state parameter matters</h4>
          <pre className="code-block-sm">{`# Step 1 — your server generates a random value and stores it in a cookie
state = uuid.uuid4()
cookie("oauth_state", state, httponly=True, max_age=300)
redirect("https://accounts.google.com/o/oauth2/v2/auth?...&state=" + state)

# Step 3 — Google sends the same state back in the callback URL
# Your server verifies: if request.cookies["oauth_state"] != state → reject
# Without this check, an attacker can force a user to complete an OAuth
# flow and steal their authenticated session (CSRF via OAuth).`}</pre>
        </div>

        <div className="edu-block">
          <h4 className="edu-block-title">Google setup — free, takes ~5 minutes</h4>
          <div className="approaches-grid">
            <div className="approach-card">
              <div className="approach-num">1</div>
              <div className="approach-body">
                <div className="approach-title">Create a Google Cloud project</div>
                <p className="edu-desc">Go to <code>console.cloud.google.com</code> → New Project. Free tier covers millions of OAuth logins.</p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">2</div>
              <div className="approach-body">
                <div className="approach-title">Enable the OAuth consent screen</div>
                <p className="edu-desc">APIs & Services → OAuth consent screen → External → fill app name and email. No review needed for "Testing" mode (up to 100 users).</p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">3</div>
              <div className="approach-body">
                <div className="approach-title">Create credentials</div>
                <p className="edu-desc">Credentials → Create → OAuth 2.0 Client ID → Web application. Add <code>http://localhost:8000/oauth/google/callback</code> as an authorized redirect URI.</p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">4</div>
              <div className="approach-body">
                <div className="approach-title">Copy to .env</div>
                <pre className="code-block-sm">{`GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…`}</pre>
              </div>
            </div>
          </div>
        </div>

        <div className="edu-block">
          <h4 className="edu-block-title">GitHub setup — free, takes ~2 minutes</h4>
          <div className="approaches-grid">
            <div className="approach-card">
              <div className="approach-num">1</div>
              <div className="approach-body">
                <div className="approach-title">Register an OAuth App</div>
                <p className="edu-desc">GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App. Set callback URL to <code>http://localhost:8000/oauth/github/callback</code>.</p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">2</div>
              <div className="approach-body">
                <div className="approach-title">Generate a client secret</div>
                <p className="edu-desc">After creating the app, click "Generate a new client secret". Copy it immediately — GitHub won't show it again.</p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">3</div>
              <div className="approach-body">
                <div className="approach-title">Copy to .env</div>
                <pre className="code-block-sm">{`GITHUB_CLIENT_ID=Ov23li…
GITHUB_CLIENT_SECRET=abc123…`}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Apple section — the paid one */}
        <div className="edu-block apple-block">
          <h4 className="edu-block-title">
            Sign in with Apple
            <span className="tag tag-warn">Paid</span>
            <span className="tag tag-ok">$99 / year</span>
          </h4>

          <div className="edu-callout warning-callout" style={{marginBottom: '12px'}}>
            <strong>Apple Developer Program required — $99/year USD</strong><br />
            Unlike Google and GitHub (both completely free), "Sign in with Apple" requires
            an active Apple Developer Program membership. There is no free tier.
            The fee is the same whether you're an individual or an organization,
            and it renews annually. Nonprofits, accredited educational institutions,
            and government entities can apply for a fee waiver.
          </div>

          <p className="edu-desc" style={{marginBottom: '10px'}}>
            Beyond the cost, Sign in with Apple is also the most technically complex
            of the three providers:
          </p>

          <div className="approaches-grid">
            <div className="approach-card">
              <div className="approach-num">1</div>
              <div className="approach-body">
                <div className="approach-title">No client_secret string <span className="tag tag-warn">Different</span></div>
                <p className="edu-desc">
                  Google and GitHub give you a static client_secret string.
                  Apple does not. Instead you download a private key file (.p8)
                  and use it to sign a JWT <em>on every token request</em>.
                  The JWT (called a "client secret JWT") expires after 6 months max.
                </p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">2</div>
              <div className="approach-body">
                <div className="approach-title">Requires a real domain + HTTPS</div>
                <p className="edu-desc">
                  Apple won't allow <code>localhost</code> as a redirect URI for web
                  (unlike Google/GitHub which both support it for development).
                  You need a real HTTPS domain. <code>ngrok</code> or a deployed
                  server works as a workaround during development.
                </p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">3</div>
              <div className="approach-body">
                <div className="approach-title">Email hiding ("Hide My Email")</div>
                <p className="edu-desc">
                  Apple users can choose to hide their real email. In that case
                  Apple provides a randomized relay address like{' '}
                  <code>abc123@privaterelay.appleid.com</code>. Your backend
                  must handle this case — you can't use email as a stable identifier.
                  Use the Apple <code>sub</code> claim (user ID) instead.
                </p>
              </div>
            </div>
            <div className="approach-card">
              <div className="approach-num">4</div>
              <div className="approach-body">
                <div className="approach-title">App Store requirement</div>
                <p className="edu-desc">
                  If your app is on the App Store and supports any third-party
                  sign-in (Google, GitHub, etc.), Apple <strong>mandates</strong> that
                  you also offer Sign in with Apple. For web-only apps it's optional,
                  but you still need the $99/year membership to access the API.
                </p>
              </div>
            </div>
          </div>

          <div className="apple-cost-breakdown">
            <h5 className="edu-block-title" style={{marginTop: '14px', marginBottom: '8px'}}>
              What $99/year actually gets you
            </h5>
            <div className="data-display">
              <div className="data-row"><span>Sign in with Apple</span><code>Web + iOS + macOS + tvOS</code></div>
              <div className="data-row"><span>App Store distribution</span><code>Publish iOS, macOS, watchOS apps</code></div>
              <div className="data-row"><span>TestFlight</span><code>Beta testing up to 10,000 users</code></div>
              <div className="data-row"><span>Xcode Cloud</span><code>25 hours/month CI/CD included</code></div>
              <div className="data-row"><span>Access to beta OS</span><code>iOS, macOS pre-release SDKs</code></div>
              <div className="data-row note">
                If you're already building an iOS app, you need this membership anyway —
                so Sign in with Apple is effectively free relative to the membership cost.
                For web-only apps with no Apple platform ambitions, Google and GitHub are
                the pragmatic choice.
              </div>
            </div>
          </div>
        </div>

        <div className="edu-block">
          <h4 className="edu-block-title">Comparison: setting up each provider</h4>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Cost</th>
                <th>Localhost dev</th>
                <th>client_secret type</th>
                <th>Email always available?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Google</td>
                <td><span className="tag tag-recommended">Free</span></td>
                <td>Yes</td>
                <td>Static string</td>
                <td>Yes (verified)</td>
              </tr>
              <tr>
                <td>GitHub</td>
                <td><span className="tag tag-recommended">Free</span></td>
                <td>Yes</td>
                <td>Static string</td>
                <td>Sometimes hidden (need /user/emails fallback)</td>
              </tr>
              <tr>
                <td>Apple</td>
                <td><span className="tag tag-warn">$99/year</span></td>
                <td>No (needs HTTPS domain)</td>
                <td>Signed JWT (6-month expiry)</td>
                <td>User can hide it (relay address)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
