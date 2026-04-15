import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { apiRequest } from '@/lib/api'

interface SessionRow { id: string; created_at: string; metadata: Record<string, unknown> }
interface SessionPage { items: SessionRow[]; page: number; pages: number }

export function SessionsPage() {
  const { workspaceId = 'default' } = useParams()
  const [page, setPage] = useState(1)
  const [sessionId, setSessionId] = useState('')
  const queryClient = useQueryClient()

  const sessions = useQuery({
    queryKey: ['sessions', workspaceId, page],
    queryFn: () => apiRequest<SessionPage>(`/v3/workspaces/${workspaceId}/sessions/list?page=${page}`, { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const createSession = useMutation({
    mutationFn: () => apiRequest(`/v3/workspaces/${workspaceId}/sessions`, { method: 'POST', body: JSON.stringify({ id: sessionId }) }),
    onSuccess: () => {
      setSessionId('')
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] })
    },
  })

  return (
    <Page title={`Sessions · ${workspaceId}`} subtitle="Browse, create, and drill into sessions." actions={<div className="row"><input className="input mono" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="session-id" /><button className="button" onClick={() => createSession.mutate()} disabled={!sessionId}>Create</button></div>}>
      <DataTable<SessionRow>
        rows={sessions.data?.items ?? []}
        columns={[
          { key: 'id', header: 'Session', render: (row: SessionRow) => <Link className="mono" to={`/workspaces/${workspaceId}/sessions/${row.id}`}>{row.id}</Link> },
          { key: 'created', header: 'Created', render: (row: SessionRow) => row.created_at },
          { key: 'meta', header: 'Metadata keys', render: (row: SessionRow) => Object.keys(row.metadata ?? {}).length },
        ]}
      />
      <PaginationControls page={sessions.data?.page ?? 1} pages={sessions.data?.pages ?? 1} onChange={setPage} />
    </Page>
  )
}
