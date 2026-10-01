import { useSearchParams } from 'react-router'
import { useVentures } from './queries'

const KEY = 'forge:venture'
const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (id: string) => { try { localStorage.setItem(KEY, id) } catch { /* private mode */ } }

/** Remember a project as the current one (opening a venture counts). */
export const rememberVenture = write

/** Id of the last chosen project, if any ('all' means the whole portfolio). */
export const storedVenture = read

/**
 * The founder's current project, shared by every page: `?venture=` wins, then the last choice.
 * `venture` is undefined for "All projects" or when the remembered project no longer exists; project pages then fall back to the newest.
 */
export function useVentureFilter() {
  const [params, setParams] = useSearchParams()
  const { data: ventures = [], isLoading } = useVentures()
  const raw = params.get('venture') ?? read()
  const venture = ventures.find((v) => v.id === raw)
  const select = (id: string) => {
    write(id)
    setParams((p) => { const n = new URLSearchParams(p); n.set('venture', id); return n }, { replace: true })
  }
  return { ventures, isLoading, venture, select }
}
