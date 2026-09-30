import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import type { Config, Me, Venture } from './types'

export const useVentures = () => useQuery({ queryKey: ['ventures'], queryFn: () => api<Venture[]>('/ventures') })
export const useVenture = (id?: string) => useQuery({ queryKey: ['ventures', id], queryFn: () => api<Venture>(`/ventures/${id}`), enabled: !!id })
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') })
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config'), staleTime: 60_000 })

/** Mutation that toasts errors and invalidates the given query keys on success. */
export function useAction<TArgs = void, TOut = unknown>(fn: (args: TArgs) => Promise<TOut>, invalidate: string[][] = [], success?: string | ((out: TOut) => string)) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      if (success) toast.success(typeof success === 'function' ? success(out) : success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
