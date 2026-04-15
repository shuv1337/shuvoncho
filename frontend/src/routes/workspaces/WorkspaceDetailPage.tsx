import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import type { QueueStatusResponse } from '@/types'

interface WorkspacePageResponse {
  items: Array<{ id: string; metadata: Record<string, unknown>; configuration: Record<string, unknown>; created_at: string }>
}

export function WorkspaceDetailPage() {
  const { workspaceId = 'default' } = useParams()
  const status = useQuery({
    queryKey: ['workspace-queue', workspaceId],
    queryFn: () => apiRequest<QueueStatusResponse>(`/v3/workspaces/${workspaceId}/queue/status`),
  })

  const workspace = useQuery({
    queryKey: ['workspace-detail', workspaceId],
    queryFn: async () => {
      const res = await apiRequest<WorkspacePageResponse>('/v3/workspaces/list?page=1&size=100', { method: 'POST', body: JSON.stringify({ filters: {} }) })
      return res.items.find((item: { id: string; metadata: Record<string, unknown>; configuration: Record<string, unknown>; created_at: string }) => item.id === workspaceId) ?? null
    },
  })

  return (
    <Page title={`Workspace · ${workspaceId}`} subtitle="Overview, queue state, and drill-down links.">
      <div className="grid-cards">
        <div className="panel kpi"><span className="kpi-label">Pending work</span><span className="kpi-value">{status.data?.pending_work_units ?? 0}</span></div>
        <div className="panel kpi"><span className="kpi-label">In progress</span><span className="kpi-value">{status.data?.in_progress_work_units ?? 0}</span></div>
        <div className="panel kpi"><span className="kpi-label">Completed</span><span className="kpi-value">{status.data?.completed_work_units ?? 0}</span></div>
      </div>
      <div className="row">
        <Link className="button secondary" to={`/workspaces/${workspaceId}/peers`}>Peers</Link>
        <Link className="button secondary" to={`/workspaces/${workspaceId}/sessions`}>Sessions</Link>
        <Link className="button secondary" to={`/workspaces/${workspaceId}/conclusions`}>Conclusions</Link>
      </div>
      <div className="panel stack">
        <div>
          <div className="kpi-label">Metadata</div>
          <JsonBlock value={workspace.data?.metadata ?? {}} />
        </div>
        <div>
          <div className="kpi-label">Configuration</div>
          <JsonBlock value={workspace.data?.configuration ?? {}} />
        </div>
      </div>
    </Page>
  )
}
