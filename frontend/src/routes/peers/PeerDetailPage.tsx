import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import { getHoncho } from '@/lib/honcho'

interface PeerDetail {
  id: string
  metadata: Record<string, unknown>
  configuration: Record<string, unknown>
  created_at: string
}
interface SessionPage { items: Array<{ id: string; created_at: string }> }

export function PeerDetailPage() {
  const { workspaceId = 'default', peerId = '' } = useParams()

  const peer = useQuery({
    queryKey: ['peer-detail', workspaceId, peerId],
    queryFn: async () => {
      const res = await apiRequest<{ items: PeerDetail[] }>(`/v3/workspaces/${workspaceId}/peers/list?page=1&size=100`, { method: 'POST', body: JSON.stringify({ filters: {} }) })
      return res.items.find((item: PeerDetail) => item.id === peerId) ?? null
    },
  })

  const sessions = useQuery({
    queryKey: ['peer-sessions', workspaceId, peerId],
    queryFn: () => apiRequest<SessionPage>(`/v3/workspaces/${workspaceId}/peers/${peerId}/sessions?page=1`, { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const representation = useQuery({
    queryKey: ['peer-representation', workspaceId, peerId],
    queryFn: async () => {
      const peer = await getHoncho(workspaceId).peer(peerId)
      return peer.representation()
    },
  })

  const context = useQuery({
    queryKey: ['peer-context', workspaceId, peerId],
    queryFn: async () => {
      const peer = await getHoncho(workspaceId).peer(peerId)
      return peer.context()
    },
  })

  return (
    <Page title={`Peer · ${peerId}`} subtitle="Metadata, context, representation, and memberships.">
      <div className="panel stack">
        <div>
          <div className="kpi-label">Metadata</div>
          <JsonBlock value={peer.data?.metadata ?? {}} />
        </div>
        <div>
          <div className="kpi-label">Configuration</div>
          <JsonBlock value={peer.data?.configuration ?? {}} />
        </div>
      </div>
      <div className="panel stack">
        <div className="kpi-label">Representation</div>
        <pre className="code-block">{representation.data ?? 'Loading representation...'}</pre>
      </div>
      <div className="panel stack">
        <div className="kpi-label">Context</div>
        <JsonBlock value={context.data ?? {}} />
      </div>
      <div className="panel stack">
        <div className="kpi-label">Sessions</div>
        <JsonBlock value={sessions.data?.items ?? []} />
      </div>
    </Page>
  )
}
