import SessionAuth from './components/SessionAuth'
import JwtAuth from './components/JwtAuth'
import OAuthAuth from './components/OAuthAuth'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Auth Methods Comparison</h1>
        <p className="subtitle">Session Auth · JWT with Refresh Tokens · OAuth 2.0 — interact with all three and watch the difference</p>
      </header>

      {/* High-level concept cards */}
      <div className="comparison-intro comparison-intro-three">
        <div className="concept-card session-concept">
          <h3>Session Auth</h3>
          <p>
            The server keeps a session store (in memory, Redis, or a DB). The
            client receives only an opaque random ID as a cookie. Every request
            must hit the session store to validate the ID.
          </p>
          <ul>
            <li className="pro">Easy, immediate revocation on logout</li>
            <li className="pro">Cookie sent automatically — no JS token management</li>
            <li className="con">Server must maintain shared state — harder to scale out</li>
            <li className="con">All instances need access to the same session store</li>
          </ul>
        </div>

        <div className="concept-card jwt-concept">
          <h3>JWT + Refresh Token</h3>
          <p>
            The server signs a token containing the user's identity. Any server
            with the same secret can verify the signature — no shared store
            needed. A short-lived access token pairs with a longer-lived refresh
            token to balance security and user experience.
          </p>
          <ul>
            <li className="pro">Stateless — any server instance can verify independently</li>
            <li className="pro">Scales horizontally with no shared session store</li>
            <li className="con">Access token can't be revoked before it expires</li>
            <li className="con">Client must handle token storage and refresh logic</li>
          </ul>
        </div>

        <div className="concept-card oauth-concept">
          <h3>OAuth 2.0</h3>
          <p>
            Delegate authentication to a trusted provider (Google, GitHub, Apple).
            Your app never sees the user's password. The provider returns an
            authorization code your server exchanges for an access token and
            user identity.
          </p>
          <ul>
            <li className="pro">No password storage — provider handles credential security</li>
            <li className="pro">Users trust familiar providers (no new account needed)</li>
            <li className="con">Depends on third-parties — provider outage = your login breaks</li>
            <li className="con">More setup required; Apple Sign In costs $99/year</li>
          </ul>
        </div>
      </div>

      {/* The three live demo panels */}
      <div className="auth-panels auth-panels-three">
        <SessionAuth />
        <JwtAuth />
        <OAuthAuth />
      </div>

      {/* Comparison tables */}
      <section className="comparison-table">
        <h2>Session vs JWT — Side-by-Side</h2>
        <table>
          <thead>
            <tr>
              <th>Aspect</th>
              <th className="session-col">Session Auth</th>
              <th className="jwt-col">JWT Auth</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Server state</td>
              <td>Stores session data (stateful)</td>
              <td>Stores only refresh token JTIs (nearly stateless)</td>
            </tr>
            <tr>
              <td>Request verification</td>
              <td>DB/cache lookup per request</td>
              <td>Cryptographic signature check (no I/O)</td>
            </tr>
            <tr>
              <td>Horizontal scaling</td>
              <td>Needs a shared session store (Redis)</td>
              <td>Any server with the secret can verify</td>
            </tr>
            <tr>
              <td>Logout / revocation</td>
              <td>Immediate — delete the session entry</td>
              <td>Refresh token revoked; access token lives until expiry</td>
            </tr>
            <tr>
              <td>Token transport</td>
              <td>httpOnly cookie (browser automatic)</td>
              <td>Authorization header (client manages manually)</td>
            </tr>
            <tr>
              <td>XSS risk</td>
              <td>Lower — httpOnly cookie not readable by JS</td>
              <td>Higher if access token stored in localStorage</td>
            </tr>
            <tr>
              <td>CSRF risk</td>
              <td>Must use SameSite / CSRF token</td>
              <td>Lower — Authorization header not sent automatically</td>
            </tr>
            <tr>
              <td>Best for</td>
              <td>Traditional web apps, monoliths</td>
              <td>APIs, SPAs, microservices, mobile clients</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '32px 0 16px' }}>OAuth Providers at a Glance</h2>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Cost</th>
              <th>Works on localhost</th>
              <th>client_secret type</th>
              <th>Email always available?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Google</td>
              <td style={{ color: '#16a34a', fontWeight: 600 }}>Free</td>
              <td>Yes</td>
              <td>Static string</td>
              <td>Yes (always verified)</td>
            </tr>
            <tr>
              <td>GitHub</td>
              <td style={{ color: '#16a34a', fontWeight: 600 }}>Free</td>
              <td>Yes</td>
              <td>Static string</td>
              <td>Sometimes hidden — need /user/emails fallback</td>
            </tr>
            <tr>
              <td>Apple</td>
              <td style={{ color: '#b45309', fontWeight: 600 }}>$99 / year</td>
              <td>No (needs HTTPS domain)</td>
              <td>Signed JWT (.p8 private key)</td>
              <td>User can hide it (relay address)</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
