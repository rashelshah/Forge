import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

interface AuthState { ready: boolean; session: Session | null; demo: boolean; signOut: () => Promise<void> }
const Ctx = createContext<AuthState>({ ready: false, session: null, demo: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase?.auth.signOut()
    window.location.href = '/'
  }

  return <Ctx.Provider value={{ ready, session, demo: !supabase, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
