import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot, Send, ChevronDown, Sparkles, Minimize2,
  Brain, Lightbulb, ArrowRight, BarChart3, Shield, Zap, Globe
} from 'lucide-react'
import { BotAvatar } from 'bot-avatars'
import { useLocation } from 'react-router'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useVentures } from '@/lib/queries'

// ---------------------------------------------------------------- types

interface CopilotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  evidence?: string[]
  recommendation?: string
  ventures_mentioned?: string[]
  intent?: string
  loading?: boolean
}

type WidgetState = 'collapsed' | 'expanded'

// ---------------------------------------------------------------- suggested questions (contextual by page)

const GLOBAL_SUGGESTIONS = [
  { text: 'Compare all my ventures', icon: BarChart3 },
  { text: 'What should I focus on this week?', icon: Zap },
  { text: 'What are my biggest risks?', icon: Shield },
  { text: 'What opportunities am I missing?', icon: Lightbulb },
  { text: 'Which startup is closest to launch?', icon: ArrowRight },
  { text: 'What assumptions remain unvalidated?', icon: Brain },
  { text: 'Summarize competitor threats', icon: Globe },
  { text: 'What changed this week?', icon: Sparkles },
]

const PAGE_SUGGESTIONS: Record<string, { text: string; icon: typeof Brain }[]> = {
  'competitive-intelligence': [
    { text: 'Summarize competitor threats', icon: Shield },
    { text: 'What white space opportunities exist?', icon: Lightbulb },
    { text: 'Which competitor is most dangerous?', icon: Globe },
  ],
  'market-signals': [
    { text: 'What market trends should I act on?', icon: Zap },
    { text: 'Any emerging opportunities this week?', icon: Lightbulb },
    { text: 'What signals are most urgent?', icon: Shield },
  ],
  'memory': [
    { text: 'What key decisions have I made?', icon: Brain },
    { text: 'Summarize validated assumptions', icon: Sparkles },
    { text: 'What have I learned about customers?', icon: Lightbulb },
  ],
  'research': [
    { text: 'Summarize my market research', icon: Globe },
    { text: 'What pain points are most common?', icon: Shield },
    { text: 'Which opportunity has the most evidence?', icon: BarChart3 },
  ],
  'boardroom': [
    { text: 'What did the board recommend?', icon: Brain },
    { text: 'What are the critical assumptions to test?', icon: Shield },
    { text: 'Which venture has the strongest verdict?', icon: BarChart3 },
  ],
  'experiments': [
    { text: 'Which hypotheses are validated?', icon: Sparkles },
    { text: 'What experiment should I run next?', icon: Zap },
    { text: 'What is my best conversion rate?', icon: BarChart3 },
  ],
}

// ---------------------------------------------------------------- page → display name

function pageLabel(pathname: string, search: string): string {
  const tab = new URLSearchParams(search).get('tab')
  let path = pathname
  if (pathname.startsWith('/app/ventures/') && tab) {
    path = `/app/${tab === 'gtm' ? 'go-to-market' : tab}`
  }

  const map: Record<string, string> = {
    '/app': 'Dashboard',
    '/app/research': 'Research',
    '/app/boardroom': 'Boardroom',
    '/app/competitive-intelligence': 'Competitive Intelligence',
    '/app/market-signals': 'Market Signals',
    '/app/memory': 'Venture Memory',
    '/app/experiments': 'Validation Lab',
    '/app/mvp': 'MVP Architect',
    '/app/prototype': 'Prototype',
    '/app/go-to-market': 'Go-To-Market',
    '/app/ventures': 'Ventures',
  }
  for (const [k, v] of Object.entries(map)) {
    if (path === k || path.startsWith(k + '/')) return v
  }
  return 'Dashboard'
}

// ---------------------------------------------------------------- chat bubble

function Bubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {!isUser && (
        <div className="shrink-0 mt-0.5">
          <BotAvatar type="cat" size={28} state={msg.loading ? 'working' : 'idle'} />
        </div>
      )}
      <div className={cn('flex flex-col gap-1.5 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div className={cn('rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[linear-gradient(135deg,#4250d5,#6a88e2)] text-white rounded-br-sm'
            : 'bg-white border border-[#f0f0f0] text-[#1f1f1f] rounded-bl-sm shadow-sm'
        )}>
          {msg.loading ? (
            <span className="flex items-center text-sm font-medium text-[#1f1f1f]/50">
              Thinking...
            </span>
          ) : (
            <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
          )}
        </div>

        {/* Evidence chips */}
        {msg.evidence && msg.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.evidence.slice(0, 3).map((e, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#45464d] border border-[#f0f0f0]">{e}</span>
            ))}
          </div>
        )}

        {/* Recommendation callout */}
        {msg.recommendation && !msg.loading && (
          <div className="rounded-xl border border-[#e8effc] bg-[linear-gradient(135deg,#f5f7fe,#edf2ff)] px-3 py-2 text-xs text-[#4250d5] max-w-full">
            <span className="font-medium">Recommendation: </span>{msg.recommendation}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------- simple markdown → html

function formatMarkdown(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\. /gm, '<br/><strong>$1.</strong> ')
    .replace(/^• /gm, '<br/>• ')
    .replace(/^- /gm, '<br/>• ')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
    .replace(/^<br\/>/, '')
}

// ---------------------------------------------------------------- main component

export function FounderCopilot() {
  const { pathname, search } = useLocation()
  const { data: ventures } = useVentures()
  const [state, setState] = useState<WidgetState>('collapsed')
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Extract page context slug from pathname and search params
  const tab = new URLSearchParams(search).get('tab')
  let pageContext = pathname.replace('/app/', '').split('/')[0] || 'dashboard'
  if (pageContext === 'ventures' && tab) {
    pageContext = tab === 'gtm' ? 'go-to-market' : tab
  }
  const contextLabel = pageLabel(pathname, search)

  const suggestions = PAGE_SUGGESTIONS[pageContext] ?? GLOBAL_SUGGESTIONS.slice(0, 4)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load chat history on mount
  useEffect(() => {
    api<CopilotMessage[]>('/copilot/messages')
      .then((history) => {
        if (history && history.length > 0) {
          setMessages(history)
          // Small delay to ensure refs are attached if already expanded
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 10)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (state === 'expanded') {
      setUnread(0)
      // Scroll instantly so there's no layout shift while opening
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        inputRef.current?.focus()
      }, 10)
    }
  }, [state])

  const addMessage = (msg: Omit<CopilotMessage, 'id'>) => {
    const full = { ...msg, id: crypto.randomUUID() }
    setMessages((prev) => [...prev, full])
    return full.id
  }

  const updateMessage = (id: string, update: Partial<CopilotMessage>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...update } : m))
  }

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || sending) return
    setInput('')
    setSending(true)

    addMessage({ role: 'user', content: question })
    const assistantId = addMessage({ role: 'assistant', content: '', loading: true })

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
      const result = await api<{
        answer: string; evidence: string[]; recommendation: string;
        intent: string; retrieved: number; ventures_mentioned: string[]
      }>('/copilot/ask', { question, page_context: pageContext, history })

      updateMessage(assistantId, {
        content: result.answer || "I'm here and ready to help — try asking about your ventures, risks, or next steps.",
        evidence: result.evidence,
        recommendation: result.recommendation,
        intent: result.intent,
        ventures_mentioned: result.ventures_mentioned,
        loading: false,
      })

      // If collapsed, show unread badge
      if (state === 'collapsed') setUnread((n) => n + 1)
    } catch (e: any) {
      updateMessage(assistantId, { content: e.message || 'Something went wrong. Please try again.', loading: false })
    } finally {
      setSending(false)
    }
  }, [sending, messages, pageContext, state])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask(input)
    }
  }

  const ventureCount = ventures?.length ?? 0

  return (
    <>
      {/* Backdrop for mobile expanded state */}
      <AnimatePresence>
        {state === 'expanded' && (
          <motion.div
            className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-[2px] lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setState('collapsed')}
          />
        )}
      </AnimatePresence>

      {/* Widget container */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-[999]">

        {/* ── EXPANDED PANEL ── */}
        <AnimatePresence>
          {state === 'expanded' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute bottom-0 right-0 w-[min(420px,calc(100vw-32px))] max-h-[min(640px,calc(100dvh-120px))] rounded-3xl overflow-hidden flex flex-col"
              style={{
                background: '#fff',
                boxShadow: '0 4px 6px rgb(0 0 0 / 0.04), 0 24px 80px -12px rgb(16 18 35 / 0.22), 0 0 0 1px rgb(0 0 0 / 0.05)',
              }}
            >
              {/* Header */}
              <div className="relative overflow-hidden px-5 py-4 shrink-0">
                {/* Aurora gradient background */}
                <div className="absolute inset-0 bg-[linear-gradient(135deg,#1a1b2e_0%,#2a2c4e_50%,#1e2040_100%)]" />
                <div className="absolute inset-0 opacity-40"
                  style={{ background: 'radial-gradient(80% 80% at 20% 20%, rgb(236 138 68 / 0.35) 0%, transparent 60%), radial-gradient(60% 60% at 80% 80%, rgb(106 136 226 / 0.4) 0%, transparent 60%)' }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BotAvatar type="cat" size={36} interactive={true} />
                    <div>
                      <p className="text-sm font-semibold text-white tracking-tight">Founder Copilot</p>
                      <p className="text-[11px] text-white/60">
                        {ventureCount > 0 ? `${ventureCount} venture${ventureCount !== 1 ? 's' : ''} · ` : ''}{contextLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setState('collapsed')}
                      className="grid size-7 place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label="Minimize"
                    >
                      <Minimize2 className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setState('collapsed')}
                      className="grid size-7 place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label="Close"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
                {messages.length === 0 ? (
                  <div className="space-y-4">
                    {/* Welcome state */}
                    <div className="text-center py-2">
                      <div className="inline-flex size-14 rounded-2xl bg-[linear-gradient(135deg,#f0f4ff,#e8f0ff)] items-center justify-center mb-3">
                        <Sparkles className="size-6 text-[#4250d5]" />
                      </div>
                      <p className="text-sm font-semibold text-[#1f1f1f]">How can I help?</p>
                      <p className="text-xs text-[#7b7c84] mt-1">Ask anything about your ventures</p>
                    </div>

                    {/* Suggestions */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-[#a9aab1] uppercase tracking-widest px-1">Suggested</p>
                      {suggestions.map(({ text, icon: Icon }) => (
                        <button
                          key={text}
                          onClick={() => ask(text)}
                          className="group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#45464d] hover:bg-[#f5f5f5] hover:text-[#4250d5] transition cursor-pointer border border-transparent hover:border-[#e8effc]"
                        >
                          <Icon className="size-3.5 shrink-0 text-[#a9aab1] group-hover:text-[#4250d5] transition" />
                          {text}
                        </button>
                      ))}
                    </div>

                    {ventureCount === 0 && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                        Create your first venture to unlock cross-portfolio insights.
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((msg) => <Bubble key={msg.id} msg={msg} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggestion pills (when there are messages) */}
              {messages.length > 0 && messages.length < 10 && (
                <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                  {GLOBAL_SUGGESTIONS.slice(0, 3).map(({ text }) => (
                    <button
                      key={text}
                      onClick={() => ask(text)}
                      disabled={sending}
                      className="shrink-0 rounded-full border border-[#e8effc] bg-[#f5f7fe] px-3 py-1 text-xs text-[#4250d5] hover:bg-[#e8effc] transition cursor-pointer disabled:opacity-50"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}

              {/* Input area */}
              <div className="border-t border-[#f0f0f0] px-3 py-3 shrink-0">
                <div className="flex items-end gap-2 rounded-2xl border border-[#f0f0f0] bg-[#fcfcfc] px-3 py-2 focus-within:border-[#a5bbfc] focus-within:ring-1 focus-within:ring-[#a5bbfc] transition">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={`Ask about your ventures…`}
                    rows={1}
                    disabled={sending}
                    className="flex-1 resize-none bg-transparent text-sm text-[#1f1f1f] placeholder:text-[#a9aab1] outline-none max-h-32 leading-relaxed disabled:opacity-60"
                    style={{ scrollbarWidth: 'none' }}
                  />
                  <button
                    onClick={() => ask(input)}
                    disabled={!input.trim() || sending}
                    className="shrink-0 grid size-8 place-items-center rounded-xl bg-[linear-gradient(135deg,#4250d5,#6a88e2)] text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Send"
                  >
                    <Send className="size-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-[#a9aab1]">
                  Searches across all your ventures · current page: {contextLabel}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── COLLAPSED FAB ── */}
        <AnimatePresence mode="wait">
          {state === 'collapsed' && (
            <motion.button
              key="fab"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={() => setState('expanded')}
              aria-label="Open Founder Copilot"
              className="group absolute bottom-0 right-0 origin-bottom-right cursor-pointer bg-transparent border-none outline-none flex items-center justify-center p-0 m-0"
            >
              {/* Pulse ring removed */}
              <BotAvatar
                type="cat"
                size={80}
                interactive={true}
                className="relative transition-transform duration-300 hover:scale-105 hover:-translate-y-1 drop-shadow-[0_8px_15px_rgba(0,0,0,0.2)]"
              />

              {/* Unread badge */}
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-[#e8772e] px-1 text-[10px] leading-5 font-medium text-white">
                  {unread}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
