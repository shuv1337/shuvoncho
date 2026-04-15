import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import { getAuthToken, setAuthToken } from '@/lib/auth'
import type { OpenApiSpec } from '@/types'

export function PlaygroundPage() {
  const [path, setPath] = useState('/v3/system/status')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('{}')
  const [token, setToken] = useState(getAuthToken() ?? '')

  const spec = useQuery({
    queryKey: ['openapi-spec'],
    queryFn: () => apiRequest<OpenApiSpec>('/openapi.json'),
  })

  const endpoints = useMemo(() => Object.keys(spec.data?.paths ?? {}).sort(), [spec.data])

  const execute = useMutation({
    mutationFn: async () => {
      setAuthToken(token || null)
      return apiRequest(path, {
        method,
        body: method === 'GET' ? undefined : body,
      })
    },
  })

  return (
    <Page title="API Playground" subtitle="OpenAPI-driven local playground with optional bearer token support.">
      <div className="panel stack">
        <div className="form-grid two">
          <label className="field"><span className="kpi-label">Method</span><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></label>
          <label className="field"><span className="kpi-label">Path</span><input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} list="openapi-paths" /></label>
        </div>
        <label className="field"><span className="kpi-label">Optional bearer token</span><input className="input mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token for auth-enabled mode" /></label>
        <label className="field"><span className="kpi-label">JSON body</span><textarea className="textarea mono" value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="row">
          <button className="button" onClick={() => execute.mutate()}>Execute request</button>
          <button className="button secondary" onClick={() => navigator.clipboard.writeText(`curl -X ${method} ${window.location.origin}${path}`)}>Copy as cURL</button>
        </div>
        <datalist id="openapi-paths">
          {endpoints.map((item) => <option key={item} value={item} />)}
        </datalist>
      </div>
      <div className="panel stack">
        <div className="kpi-label">Response</div>
        <JsonBlock value={execute.data ?? execute.error ?? {}} />
      </div>
    </Page>
  )
}
