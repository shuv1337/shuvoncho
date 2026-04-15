export interface SystemStatusResponse {
  version: string
  auth_enabled: boolean
  metrics_enabled: boolean
  telemetry_enabled: boolean
  sentry_enabled: boolean
  dream_enabled: boolean
  frontend_available: boolean
  request_id?: string | null
}

export interface QueueStatusResponse {
  total_work_units: number
  completed_work_units: number
  in_progress_work_units: number
  pending_work_units: number
  sessions?: Record<string, {
    session_id: string | null
    total_work_units: number
    completed_work_units: number
    in_progress_work_units: number
    pending_work_units: number
  }>
}

export interface OpenApiSpec {
  paths: Record<string, Record<string, unknown>>
}

export interface WebhookEndpoint {
  id: string
  workspace_id: string | null
  url: string
  created_at: string
}
