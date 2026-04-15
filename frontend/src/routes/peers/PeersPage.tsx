import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { apiRequest } from '@/lib/api'

interface PeerRow {
  id: string
  created_at: string
  metadata: Record<string, unknown>
  configuration: Record<string, unknown>
}
interface PeerPage { items: PeerRow[]; page: number; pages: number }

export function PeersPage() {
  const { workspaceId = 'default' } = useParams()
  const [page, setPage] = useState(1)
  const [peerId, setPeerId] = useState('')
  const queryClient = useQueryClient()

  const peers = useQuery({
    queryKey: ['peers', workspaceId, page],
    queryFn: () => apiRequest<PeerPage>(`/v3/workspaces/${workspaceId}/peers/list?page=${page}`, { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const createPeer = useMutation({
    mutationFn: () => apiRequest(`/v3/workspaces/${workspaceId}/peers`, { method: 'POST', body: JSON.stringify({ id: peerId }) }),
    onSuccess: () => {
      setPeerId('')
      queryClient.invalidateQueries({ queryKey: ['peers', workspaceId] })
    },
  })

  return (
    <Page title={`Peers · ${workspaceId}`} subtitle="Browse and create peers in this workspace." actions={<div className="row"><input className="input mono" value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="peer-id" /><button className="button" onClick={() => createPeer.mutate()} disabled={!peerId}>Create</button></div>}>
      <DataTable<PeerRow>
        rows={peers.data?.items ?? []}
        columns={[
          { key: 'id', header: 'Peer', render: (row: PeerRow) => <Link className="mono" to={`/workspaces/${workspaceId}/peers/${row.id}`}>{row.id}</Link> },
          { key: 'created', header: 'Created', render: (row: PeerRow) => row.created_at },
          { key: 'meta', header: 'Metadata keys', render: (row: PeerRow) => Object.keys(row.metadata ?? {}).length },
        ]}
      />
      <PaginationControls page={peers.data?.page ?? 1} pages={peers.data?.pages ?? 1} onChange={setPage} />
    </Page>
  )
}
