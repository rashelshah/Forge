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

// Google "G" logo SVG
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

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

  async function googleSignIn() {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/app` },
    })
    setBusy(false)
    if (error) toast.error(error.message)
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center overflow-hidden px-4">
      <div className="absolute inset-x-0 top-0 -z-10 h-[620px]"><div className="aurora" /><div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-canvas" /></div>
      <div className="flex h-[68px] w-full max-w-[1120px] items-center shrink-0"><Logo /></div>
      
      <div className="flex w-full flex-1 flex-col items-center justify-center pb-20">
        <div className="w-full max-w-[420px] text-center">
          <Ornament className="mx-auto w-[130px]" />
          <div className="mt-5"><Eyebrow>{mode === 'signin' ? 'Welcome back, founder' : 'Open your venture studio'}</Eyebrow></div>
          <h1 className="mt-5 text-[40px] leading-tight font-[425]">{mode === 'signin' ? 'Log in to Forge' : 'Create your account'}</h1>
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
          <div className="space-y-4">
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
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs text-muted">or continue with</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            {/* Google Sign In */}
            <Button
              type="button"
              variant="white"
              className="w-full"
              onClick={googleSignIn}
              disabled={busy}
            >
              <GoogleIcon />
              Google
            </Button>

            <p className="pt-1 text-center text-sm text-muted">
              {mode === 'signin' ? 'New to Forge? ' : 'Already have an account? '}
              <button type="button" className="font-medium text-azure hover:underline cursor-pointer" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'signin' ? 'Create an account' : 'Log in'}
              </button>
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
