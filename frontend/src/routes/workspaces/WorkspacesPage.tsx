import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { apiRequest } from '@/lib/api'

interface WorkspaceRow {
  id: string
  metadata: Record<string, unknown>
  configuration: Record<string, unknown>
  created_at: string
}

interface WorkspacePageResponse {
  items: WorkspaceRow[]
  page: number
  pages: number
  total: number
  size: number
}

export function WorkspacesPage() {
  const [page, setPage] = useState(1)
  const [workspaceName, setWorkspaceName] = useState('')
  const queryClient = useQueryClient()

  const workspaces = useQuery({
    queryKey: ['workspaces', page],
    queryFn: () => apiRequest<WorkspacePageResponse>(`/v3/workspaces/list?page=${page}`, { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const createWorkspace = useMutation({
    mutationFn: () => apiRequest<WorkspaceRow>('/v3/workspaces', { method: 'POST', body: JSON.stringify({ name: workspaceName }) }),
    onSuccess: () => {
      setWorkspaceName('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })

  return (
    <Page
      title="Workspaces"
      subtitle="Direct HTTP control-plane view. Workspace listing is admin-capable in auth mode."
      actions={
        <div className="row">
          <input className="input mono" placeholder="workspace-id" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
          <button className="button" onClick={() => createWorkspace.mutate()} disabled={!workspaceName || createWorkspace.isPending}>Create</button>
        </div>
      }
    >
      <DataTable<WorkspaceRow>
        rows={workspaces.data?.items ?? []}
        empty="No workspaces returned. In auth mode, non-admin clients may not be able to list globally."
        columns={[
          { key: 'id', header: 'Workspace', render: (row: WorkspaceRow) => <Link to={`/workspaces/${row.id}`} className="mono">{row.id}</Link> },
          { key: 'created', header: 'Created', render: (row: WorkspaceRow) => row.created_at },
          { key: 'meta', header: 'Metadata keys', render: (row: WorkspaceRow) => Object.keys(row.metadata ?? {}).length },
        ]}
      />
      <PaginationControls page={workspaces.data?.page ?? 1} pages={workspaces.data?.pages ?? 1} onChange={setPage} />
    </Page>
  )
}
