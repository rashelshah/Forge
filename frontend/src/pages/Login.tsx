import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Eyebrow, Logo, Ornament } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const { demo, session } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/app" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error, data } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/app` } })
    setBusy(false)
    if (error) return toast.error(error.message)
    if (mode === 'signup' && !data.session) return toast.success('Check your inbox to confirm your email.')
    nav('/app')
  }

  async function magicLink() {
    if (!supabase || !email) return toast.error('Enter your email first')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/app` } })
    setBusy(false)
    if (error) toast.error(error.message)
    else toast.success('Magic link sent — check your inbox.')
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center overflow-hidden px-4">
      <div className="absolute inset-x-0 top-0 -z-10 h-[620px]"><div className="aurora" /><div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-canvas" /></div>
      <div className="flex h-[68px] w-full max-w-[1120px] items-center"><Logo /></div>
      <div className="mt-14 w-full max-w-[420px] text-center">
        <Ornament className="mx-auto w-[130px]" />
        <div className="mt-5"><Eyebrow>{mode === 'signin' ? 'Welcome back, founder' : 'Open your venture studio'}</Eyebrow></div>
        <h1 className="mt-5 text-[40px] leading-tight font-[425]">{mode === 'signin' ? 'Log in to Foundry' : 'Create your account'}</h1>
      </div>

      <div className="mt-8 w-full max-w-[420px] rounded-[20px] border border-line bg-white/90 p-7 shadow-float backdrop-blur">
        {demo ? (
          <div className="text-center">
            <p className="text-[15px] text-ink-2">
              This workspace runs in <span className="font-medium text-ink">local demo mode</span> — no account needed. Add Supabase keys to
              <code className="mx-1 rounded bg-soft px-1.5 py-0.5 font-mono text-xs">.env</code>to enable real authentication.
            </p>
            <Button asChild className="mt-6 w-full"><Link to="/app">Enter the studio <ArrowRight /></Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div><Label htmlFor="name">Full name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
            )}
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </div>
            <Button type="submit" className="w-full" loading={busy}>{mode === 'signin' ? 'Log in' : 'Create account'}</Button>
            {mode === 'signin' && <Button type="button" variant="light" className="w-full" onClick={magicLink} disabled={busy}>Email me a magic link</Button>}
            <p className="pt-1 text-center text-sm text-muted">
              {mode === 'signin' ? 'New to Foundry? ' : 'Already have an account? '}
              <button type="button" className="font-medium text-azure hover:underline cursor-pointer" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'signin' ? 'Create an account' : 'Log in'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
