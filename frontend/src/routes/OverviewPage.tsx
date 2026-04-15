import { useQuery } from '@tanstack/react-query'
import { Page } from '@/components/ui/Page'
import { apiRequest } from '@/lib/api'
import type { SystemStatusResponse } from '@/types'

export function OverviewPage() {
  const system = useQuery({
    queryKey: ['system-status'],
    queryFn: () => apiRequest<SystemStatusResponse>('/v3/system/status'),
  })

  return (
    <Page title="Overview" subtitle="Local-first memory control plane for Shuvoncho.">
      <div className="grid-cards">
        <div className="panel kpi">
          <span className="kpi-label">Version</span>
          <span className="kpi-value mono">{system.data?.version ?? '—'}</span>
        </div>
        <div className="panel kpi">
          <span className="kpi-label">Auth</span>
          <span className="kpi-value">{system.data?.auth_enabled ? 'Enabled' : 'Local / off'}</span>
        </div>
        <div className="panel kpi">
          <span className="kpi-label">Metrics</span>
          <span className="kpi-value">{system.data?.metrics_enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="panel kpi">
          <span className="kpi-label">Frontend build</span>
          <span className="kpi-value">{system.data?.frontend_available ? 'Present' : 'Missing'}</span>
        </div>
      </div>
      <div className="panel stack">
        <p className="subtitle">Use the left navigation to browse workspaces, inspect peers and sessions, review conclusions, or operate the local API control plane.</p>
      </div>
    </Page>
  )
}
