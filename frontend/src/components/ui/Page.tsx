import { type PropsWithChildren, type ReactNode } from 'react'

export function Page({ title, subtitle, actions, children }: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode }>) {
  return (
    <section className="stack">
      <div className="space-between">
        <div>
          <h2 className="title">{title}</h2>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
