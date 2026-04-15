export function PaginationControls({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return (
    <div className="row">
      <button className="button secondary" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        Previous
      </button>
      <span className="badge mono">Page {page} / {pages || 1}</span>
      <button className="button secondary" onClick={() => onChange(Math.min(pages || 1, page + 1))} disabled={page >= (pages || 1)}>
        Next
      </button>
    </div>
  )
}
