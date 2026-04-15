import { useQuery } from '@tanstack/react-query'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import type { SystemStatusResponse } from '@/types'

export function MetricsPage() {
  const system = useQuery({
    queryKey: ['metrics-system-status'],
    queryFn: () => apiRequest<SystemStatusResponse>('/v3/system/status'),
  })

  const metrics = useQuery({
    queryKey: ['raw-metrics'],
    queryFn: async () => {
      const response = await fetch('/metrics')
      return {
        status: response.status,
        text: await response.text(),
      }
    },
  })

  return (
    <Page title="Metrics & health" subtitle="System status plus selected Prometheus output.">
      <div className="grid-cards">
        <div className="panel kpi"><span className="kpi-label">Auth</span><span className="kpi-value">{system.data?.auth_enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div className="panel kpi"><span className="kpi-label">Metrics</span><span className="kpi-value">{system.data?.metrics_enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div className="panel kpi"><span className="kpi-label">Telemetry</span><span className="kpi-value">{system.data?.telemetry_enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div className="panel kpi"><span className="kpi-label">Dreams</span><span className="kpi-value">{system.data?.dream_enabled ? 'Enabled' : 'Disabled'}</span></div>
      </div>
      <div className="panel stack">
        <div className="kpi-label">System status</div>
        <JsonBlock value={system.data ?? {}} />
      </div>
      <div className="panel stack">
        <div className="kpi-label">Raw metrics</div>
        <pre className="code-block">{metrics.data?.text ?? 'Loading metrics...'}</pre>
      </div>
    </Page>
  )
}
