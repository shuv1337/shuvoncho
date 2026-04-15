import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import type { SystemStatusResponse } from '@/types'

export function KeysPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [peerId, setPeerId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const system = useQuery({
    queryKey: ['keys-system-status'],
    queryFn: () => apiRequest<SystemStatusResponse>('/v3/system/status'),
  })

  const createKey = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams()
      if (workspaceId) params.set('workspace_id', workspaceId)
      if (peerId) params.set('peer_id', peerId)
      if (sessionId) params.set('session_id', sessionId)
      return apiRequest<{ key: string }>(`/v3/keys?${params.toString()}`, { method: 'POST' })
    },
  })

  return (
    <Page title="Key generator" subtitle="Generation-only UI for scoped JWT keys.">
      {!system.data?.auth_enabled ? (
        <div className="panel empty-state">Auth is disabled on this instance. Key generation is intentionally unavailable until `AUTH_USE_AUTH=true`.</div>
      ) : null}
      <div className="panel stack">
        <div className="form-grid two">
          <label className="field"><span className="kpi-label">Workspace scope</span><input className="input mono" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} /></label>
          <label className="field"><span className="kpi-label">Peer scope</span><input className="input mono" value={peerId} onChange={(e) => setPeerId(e.target.value)} /></label>
        </div>
        <label className="field"><span className="kpi-label">Session scope</span><input className="input mono" value={sessionId} onChange={(e) => setSessionId(e.target.value)} /></label>
        <button className="button" onClick={() => createKey.mutate()} disabled={!system.data?.auth_enabled}>Generate key</button>
      </div>
      <div className="panel stack">
        <div className="kpi-label">Result</div>
        <JsonBlock value={createKey.data ?? createKey.error ?? {}} />
      </div>
    </Page>
  )
}
