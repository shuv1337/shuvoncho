import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Page } from '@/components/ui/Page'
import { JsonBlock } from '@/components/ui/JsonBlock'
import { apiRequest } from '@/lib/api'
import { getHoncho } from '@/lib/honcho'

interface MessagePage { items: Array<{ id: string; peer_id: string; content: string; created_at: string }>; page: number; pages: number }

export function SessionDetailPage() {
  const { workspaceId = 'default', sessionId = '' } = useParams()
  const [peerId, setPeerId] = useState('')
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()

  const messages = useQuery({
    queryKey: ['session-messages', workspaceId, sessionId],
    queryFn: async () => {
      const session = await getHoncho(workspaceId).session(sessionId)
      const page = await session.messages()
      return { items: page.items, page: page.page, pages: page.pages }
    },
  })

  const context = useQuery({
    queryKey: ['session-context', workspaceId, sessionId],
    queryFn: async () => {
      const session = await getHoncho(workspaceId).session(sessionId)
      return session.context({ summary: true, tokens: 5000 })
    },
  })

  const summaries = useQuery({
    queryKey: ['session-summaries', workspaceId, sessionId],
    queryFn: async () => {
      const session = await getHoncho(workspaceId).session(sessionId)
      return session.summaries()
    },
  })

  const queue = useQuery({
    queryKey: ['session-queue', workspaceId, sessionId],
    queryFn: async () => {
      const session = await getHoncho(workspaceId).session(sessionId)
      return session.queueStatus()
    },
  })

  const addMessage = useMutation({
    mutationFn: async () => {
      const session = await getHoncho(workspaceId).session(sessionId)
      const peer = await getHoncho(workspaceId).peer(peerId)
      return session.addMessages(peer.message(message))
    },
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['session-messages', workspaceId, sessionId] })
      queryClient.invalidateQueries({ queryKey: ['session-context', workspaceId, sessionId] })
    },
  })

  const uploadMessageFile = useMutation({
    mutationFn: async (file: File) => {
      const session = await getHoncho(workspaceId).session(sessionId)
      await session.uploadFile(file, peerId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-messages', workspaceId, sessionId] })
    },
  })

  return (
    <Page title={`Session · ${sessionId}`} subtitle="Messages, summaries, context, queue state, and ingestion tools.">
      <div className="panel stack">
        <div className="form-grid two">
          <label className="field">
            <span className="kpi-label">Peer ID</span>
            <input className="input mono" value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="peer-id" />
          </label>
          <label className="field">
            <span className="kpi-label">Upload file</span>
            <input className="input" type="file" onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && peerId) uploadMessageFile.mutate(file)
            }} />
          </label>
        </div>
        <label className="field">
          <span className="kpi-label">Add message</span>
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message content" />
        </label>
        <button className="button" onClick={() => addMessage.mutate()} disabled={!peerId || !message}>Add message</button>
      </div>
      <div className="panel stack">
        <div className="kpi-label">Messages</div>
        <JsonBlock value={messages.data?.items ?? []} />
      </div>
      <div className="panel stack">
        <div className="kpi-label">Context</div>
        <JsonBlock value={context.data ?? {}} />
      </div>
      <div className="panel stack">
        <div className="kpi-label">Summaries</div>
        <JsonBlock value={summaries.data ?? {}} />
      </div>
      <div className="panel stack">
        <div className="kpi-label">Queue status</div>
        <JsonBlock value={queue.data ?? {}} />
      </div>
    </Page>
  )
}
