import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { track } from '@/lib/telemetry'

const navItems = [
  ['/', 'Overview'],
  ['/workspaces', 'Workspaces'],
  ['/playground', 'Playground'],
  ['/metrics', 'Metrics'],
  ['/webhooks', 'Webhooks'],
  ['/keys', 'Key Generator'],
]

export function AppShell() {
  const location = useLocation()

  useEffect(() => {
    track({ event: 'route.view', route: location.pathname })
  }, [location.pathname])

  return (
    <div className="app-shell">
      <aside className="sidebar stack">
        <div className="stack">
          <div>
            <div className="badge accent mono">/app · local control plane</div>
          </div>
          <div>
            <h1 className="title">Shuvoncho</h1>
            <p className="subtitle">Explore memory, sessions, conclusions, and local ops.</p>
          </div>
        </div>
        <nav className="stack">
          {navItems.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content stack">
        <Outlet />
      </main>
    </div>
  )
}
