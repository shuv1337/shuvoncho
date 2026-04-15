import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { OverviewPage } from '@/routes/OverviewPage'
import { WorkspacesPage } from '@/routes/workspaces/WorkspacesPage'
import { WorkspaceDetailPage } from '@/routes/workspaces/WorkspaceDetailPage'
import { PeersPage } from '@/routes/peers/PeersPage'
import { PeerDetailPage } from '@/routes/peers/PeerDetailPage'
import { SessionsPage } from '@/routes/sessions/SessionsPage'
import { SessionDetailPage } from '@/routes/sessions/SessionDetailPage'
import { ConclusionsPage } from '@/routes/conclusions/ConclusionsPage'
import { PlaygroundPage } from '@/routes/playground/PlaygroundPage'
import { MetricsPage } from '@/routes/metrics/MetricsPage'
import { WebhooksPage } from '@/routes/webhooks/WebhooksPage'
import { KeysPage } from '@/routes/keys/KeysPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'workspaces', element: <WorkspacesPage /> },
      { path: 'workspaces/:workspaceId', element: <WorkspaceDetailPage /> },
      { path: 'workspaces/:workspaceId/peers', element: <PeersPage /> },
      { path: 'workspaces/:workspaceId/peers/:peerId', element: <PeerDetailPage /> },
      { path: 'workspaces/:workspaceId/sessions', element: <SessionsPage /> },
      { path: 'workspaces/:workspaceId/sessions/:sessionId', element: <SessionDetailPage /> },
      { path: 'workspaces/:workspaceId/conclusions', element: <ConclusionsPage /> },
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: 'webhooks', element: <WebhooksPage /> },
      { path: 'keys', element: <KeysPage /> },
    ],
  },
])
