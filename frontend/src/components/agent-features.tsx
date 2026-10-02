import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { AgentAvatar } from '@/components/bits'
import type { AgentKey } from '@/lib/types'

function ExpressiveAgent({ agent, size }: { agent: AgentKey; size: number }) {
  const [exprIdx, setExprIdx] = useState(0)

  // Cycle through native expressions so the eyes perfectly sync with the avatar's jumps, squashes, and turns.
  const expressions = [
    { state: 'default', face: 'eyes', glasses: 'none' },      // Default looking around
    { state: 'sleeping', face: 'eyes', glasses: 'none' },     // Sleeping / Closed
    { state: 'working', face: 'mouth', glasses: 'none' },     // Focused / Happy / Talking
    { state: 'working', face: 'eyes', glasses: 'none' },      // Busy / darting eyes without mouth
    { state: 'default', face: 'mouth', glasses: 'none' }      // Looking around with mouth
  ] as const

  useEffect(() => {
    const t = setInterval(() => {
      setExprIdx(i => (i + 1) % expressions.length)
    }, 2000)
    return () => clearInterval(t)
  }, [])

  const current = expressions[exprIdx]

  return (
    <div className="relative inline-flex items-center justify-center shrink-0 drop-shadow-2xl">
      <AgentAvatar
        agent={agent}
        size={size}
        interactive={false}
        state={current.state}
        face={current.face}
        glasses={current.glasses}
      />
    </div>
  )
}

const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } } as const

export function AgentFeatures() {
  return (
    <section className="px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-[1040px] space-y-6">
        {/* Feature 1: Boardroom Partners */}
        <motion.div {...fade} className="relative rounded-[32px] bg-white px-6 pt-10 pb-40 sm:px-14 sm:py-10 flex flex-col md:flex-row items-center justify-between border border-line shadow-float min-h-[220px]">
          <div className="max-w-[440px] z-10 relative">
            <h2 className="text-[28px] sm:text-[36px] font-medium tracking-tight text-ink mb-5 leading-tight">AI partners that push back</h2>
            <p className="text-[16px] sm:text-[18px] leading-[1.6] text-ink-2">
              Instead of polite chat transcripts, your AI agents act like a real venture board. The CEO spots the opportunity, the Product agent designs the MVP, and the Failure Agent actively tries to tear your assumptions apart.
            </p>
          </div>

          {/* Wrapper to clip the bottom edge but allow spilling out the top */}
          <div className="absolute inset-x-0 bottom-0 top-[-300px] overflow-hidden rounded-b-[32px] pointer-events-none z-0">
            <div className="absolute right-[-10%] bottom-[-20px] md:right-[-5%] md:bottom-[-70px] drop-shadow-2xl">
              <div className="hidden md:block">
                <ExpressiveAgent agent="investor" size={500} />
              </div>
              <div className="block md:hidden">
                <ExpressiveAgent agent="investor" size={260} />
              </div>
            </div>
          </div>
        </motion.div>


      </div>
    </section>
  )
}
