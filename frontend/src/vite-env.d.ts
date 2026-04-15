declare module '@honcho-ai/sdk' {
  export class Honcho {
    workspaceId: string
    constructor(options?: {
      apiKey?: string
      baseURL?: string
      workspaceId?: string
      timeout?: number
      maxRetries?: number
      defaultHeaders?: Record<string, string>
      defaultHeadersFactory?: () => Record<string, string>
      defaultQuery?: Record<string, string | number | boolean | undefined>
    })
    peer(id: string, options?: unknown): Promise<any>
    session(id: string, options?: unknown): Promise<any>
  }

  export interface HonchoConfig {
    apiKey?: string
    baseURL?: string
    workspaceId?: string
    timeout?: number
    maxRetries?: number
    defaultHeaders?: Record<string, string>
    defaultHeadersFactory?: () => Record<string, string>
    defaultQuery?: Record<string, string | number | boolean | undefined>
  }
}
