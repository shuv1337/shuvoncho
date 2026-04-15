import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { DataTable } from '@/components/ui/DataTable'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { apiRequest } from '@/lib/api'

interface ConclusionRow {
  id: string
  content: string
  observer_id: string
  observed_id: string
  session_id: string | null
  created_at: string
}
interface ConclusionPage { items: ConclusionRow[]; page: number; pages: number }

export function ConclusionsPage() {
  const { workspaceId = 'default' } = useParams()
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [observer, setObserver] = useState('')
  const [observed, setObserved] = useState('')

  const conclusions = useQuery({
    queryKey: ['conclusions', workspaceId, page],
    queryFn: () => apiRequest<ConclusionPage>(`/v3/workspaces/${workspaceId}/conclusions/list?page=${page}`, { method: 'POST', body: JSON.stringify({ filters: {} }) }),
  })

  const semanticQuery = useMutation({
    mutationFn: () => apiRequest<ConclusionRow[]>(`/v3/workspaces/${workspaceId}/conclusions/query`, {
      method: 'POST',
      body: JSON.stringify({ query, top_k: 10, filters: { observer_id: observer, observed_id: observed } }),
    }),
  })

  return (
    <Page title={`Conclusions · ${workspaceId}`} subtitle="Workspace-wide list with pair-scoped semantic querying.">
      <div className="panel stack">
        <div className="form-grid two">
          <label className="field"><span className="kpi-label">Observer</span><input className="input mono" value={observer} onChange={(e) => setObserver(e.target.value)} placeholder="observer id" /></label>
          <label className="field"><span className="kpi-label">Observed</span><input className="input mono" value={observed} onChange={(e) => setObserved(e.target.value)} placeholder="observed id" /></label>
        </div>
        <label className="field"><span className="kpi-label">Semantic query</span><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about a conclusion set" /></label>
        <button className="button" onClick={() => semanticQuery.mutate()} disabled={!query || !observer || !observed}>Run pair-scoped semantic query</button>
        {semanticQuery.data ? <JsonBlock value={semanticQuery.data} /> : null}
      </div>
      <DataTable<ConclusionRow>
        rows={conclusions.data?.items ?? []}
        columns={[
          { key: 'id', header: 'ID', render: (row: ConclusionRow) => <span className="mono small">{row.id}</span> },
          { key: 'content', header: 'Content', render: (row: ConclusionRow) => row.content },
          { key: 'scope', header: 'Scope', render: (row: ConclusionRow) => <span className="mono small">{row.observer_id} → {row.observed_id}</span> },
        ]}
      />
      <PaginationControls page={conclusions.data?.page ?? 1} pages={conclusions.data?.pages ?? 1} onChange={setPage} />
    </Page>
  )
}
