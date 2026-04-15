import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Page } from '@/components/ui/Page'
import { DataTable } from '@/components/ui/DataTable'
import { apiRequest } from '@/lib/api'
import type { WebhookEndpoint } from '@/types'

interface WorkspacePage { items: Array<{ id: string }> }
interface WebhookPage { items: WebhookEndpoint[] }

export function WebhooksPage() {
  const [workspaceId, setWorkspaceId] = useState('default')
  const [url, setUrl] = useState('')
  const queryClient = useQueryClient()

  const workspaces = useQuery({
    queryKey: ['workspace-options'],
    queryFn: () => apiRequest<WorkspacePage>('/v3/workspaces/list?page=1&size=100', { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const webhooks = useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: () => apiRequest<WebhookPage>(`/v3/workspaces/${workspaceId}/webhooks`),
  })

  const createWebhook = useMutation({
    mutationFn: () => apiRequest(`/v3/workspaces/${workspaceId}/webhooks`, { method: 'POST', body: JSON.stringify({ url }) }),
    onSuccess: () => {
      setUrl('')
      queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] })
    },
  })

  const testEmit = useMutation({
    mutationFn: () => apiRequest(`/v3/workspaces/${workspaceId}/webhooks/test`),
  })

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => apiRequest(`/v3/workspaces/${workspaceId}/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] }),
  })

  return (
    <Page title="Webhooks" subtitle="Paginated endpoint management and test emit action." actions={<div className="row"><select className="select" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>{(workspaces.data?.items ?? [{ id: 'default' }]).map((ws: { id: string }) => <option key={ws.id} value={ws.id}>{ws.id}</option>)}</select><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" /><button className="button" onClick={() => createWebhook.mutate()} disabled={!url}>Create</button><button className="button secondary" onClick={() => testEmit.mutate()}>Test emit</button></div>}>
      <DataTable<WebhookEndpoint>
        rows={webhooks.data?.items ?? []}
        columns={[
          { key: 'id', header: 'ID', render: (row: WebhookEndpoint) => <span className="mono small">{row.id}</span> },
          { key: 'url', header: 'URL', render: (row: WebhookEndpoint) => row.url },
          { key: 'actions', header: 'Actions', render: (row: WebhookEndpoint) => <button className="button danger" onClick={() => deleteWebhook.mutate(row.id)}>Delete</button> },
        ]}
      />
      {testEmit.data ? <div className="panel">Test event dispatched.</div> : null}
    </Page>
  )
}
