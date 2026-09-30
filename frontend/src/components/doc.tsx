import { titleCase } from '@/lib/utils'

/** Renders any JSON value (strings, lists, nested objects) as a readable document. */
export function Meta({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null || value === '') return <span className="text-faint">—</span>
  if (Array.isArray(value)) return value.length ? <ul className="list-disc space-y-1 pl-5">{value.map((v, i) => <li key={i}>{v && typeof v === 'object' ? <Meta value={v} depth={depth + 1} /> : String(v)}</li>)}</ul> : <span className="text-faint">—</span>
  if (typeof value === 'object') {
    return (
      <dl className={depth ? 'space-y-2 border-l border-line pl-3' : 'space-y-5'}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}><dt className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{titleCase(k)}</dt><dd className="mt-1 text-sm text-ink-2"><Meta value={v} depth={depth + 1} /></dd></div>
        ))}
      </dl>
    )
  }
  return <>{String(value)}</>
}
