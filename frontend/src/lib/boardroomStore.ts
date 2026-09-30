// Boardroom runs live outside React components, so a debate keeps streaming when the user switches tabs or pages.
import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { stream } from './api'
import type { BoardMessage, Mode, Verdict } from './types'

export interface BoardRun {
  status: 'running' | 'done' | 'error'
  question: string
  rounds: number
  sessionId?: string
  messages: BoardMessage[]
  verdict: Verdict | null
  mode: Mode | null
  citations: string[]
  error?: string
}

type BoardEvent =
  | { type: 'session'; id: string }
  | { type: 'start'; mode: Mode; citations: string[] }
  | { type: 'message'; message: BoardMessage }
  | { type: 'round'; round: number }
  | { type: 'verdict'; verdict: Verdict }
  | { type: 'error'; error: string }

const runs = new Map<string, BoardRun>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

function update(ventureId: string, patch: Partial<BoardRun>) {
  runs.set(ventureId, { ...(runs.get(ventureId) as BoardRun), ...patch })
  listeners.forEach((l) => l())
}

export const useBoardRun = (ventureId: string) => useSyncExternalStore(subscribe, () => runs.get(ventureId))

export function clearBoardRun(ventureId: string) {
  if (runs.get(ventureId)?.status === 'running') return
  runs.delete(ventureId)
  listeners.forEach((l) => l())
}

export async function startBoard(ventureId: string, question: string, rounds: number, qc: QueryClient) {
  if (runs.get(ventureId)?.status === 'running') return
  runs.set(ventureId, { status: 'running', question, rounds, messages: [], verdict: null, mode: null, citations: [] })
  listeners.forEach((l) => l())
  try {
    await stream<BoardEvent>(`/ventures/${ventureId}/boardroom`, { question, rounds }, (e) => {
      const run = runs.get(ventureId)!
      if (e.type === 'session') update(ventureId, { sessionId: e.id })
      if (e.type === 'start') update(ventureId, { mode: e.mode, citations: e.citations })
      if (e.type === 'message') update(ventureId, { messages: [...run.messages, e.message] })
      if (e.type === 'verdict') update(ventureId, { verdict: e.verdict })
      if (e.type === 'error') update(ventureId, { error: e.error })
    })
    const run = runs.get(ventureId)!
    update(ventureId, run.verdict ? { status: 'done' } : { status: 'error', error: run.error ?? 'The board could not reach a verdict. Please try again.' })
    if (run.verdict) toast.success(`The board has reached a verdict`)
  } catch (e) {
    update(ventureId, { status: 'error', error: (e as Error).message })
    toast.error((e as Error).message)
  } finally {
    ;[['boardroom'], ['ventures'], ['memory'], ['notifications'], ['activity'], ['dashboard'], ['me']].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  }
}
