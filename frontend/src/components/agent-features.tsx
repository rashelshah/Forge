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
        <motion.div {...fade} className="relative overflow-hidden rounded-[32px] bg-white px-8 py-14 sm:px-16 sm:py-20 flex flex-col md:flex-row items-center justify-between border border-line shadow-float">
            <div className="max-w-[440px] z-10">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-tight text-ink mb-5 leading-tight">AI partners that push back</h2>
              <p className="text-[16px] sm:text-[18px] leading-[1.6] text-ink-2">
                Instead of polite chat transcripts, your AI agents act like a real venture board. The CEO spots the opportunity, the Product agent designs the MVP, and the Failure Agent actively tries to tear your assumptions apart.
              </p>
            </div>
            
            {/* The giant bot face peeking */}
            <div className="absolute right-[-15%] bottom-[-15%] md:right-[-5%] md:bottom-[-15%] select-none pointer-events-none">
              <div className="hidden md:block">
                <ExpressiveAgent agent="investor" size={500} />
              </div>
              <div className="block md:hidden">
                <ExpressiveAgent agent="investor" size={300} />
              </div>
            </div>
        </motion.div>

        {/* Feature 2: Connect the Bots */}
        <motion.div {...fade} className="relative overflow-hidden rounded-[32px] bg-white px-8 py-16 sm:px-16 sm:py-24 flex flex-col items-center justify-center text-center border border-line shadow-float">
            <div className="max-w-[540px] z-10 mb-16">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-tight text-ink mb-5 leading-tight">A complete venture studio</h2>
              <p className="text-[16px] sm:text-[18px] leading-[1.6] text-ink-2">
                Watch your startup evolve as specialized agents pass work between themselves. The Growth agent builds your go-to-market plan based on the Product agent's MVP blueprint, without needing your approval for every step.
              </p>
            </div>

            <div className="flex items-center justify-center z-10 pb-4">
              {/* Bot 1: Product */}
              <div className="z-10 -mr-3 rounded-full border-[3px] border-white bg-white overflow-hidden shadow-sm">
                <AgentAvatar agent="product" size={56} state="working" face="mouth" interactive={false} />
              </div>
              
              {/* Comms pill */}
              <div className="bg-[#f0f3ff] border border-[#d5defb] rounded-full px-5 py-2.5 flex items-center gap-2.5 z-20 shadow-lg relative transform translate-y-[-2px]">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-indigo text-[15px] font-medium tracking-wide">Looping in Comms...</span>
              </div>

              {/* Bot 2: Growth */}
              <div className="z-10 -ml-3 rounded-full border-[3px] border-white bg-white overflow-hidden shadow-sm">
                <AgentAvatar agent="growth" size={56} state="working" glasses="round" interactive={false} />
              </div>

              {/* Bot 3: Investor */}
              <div className="z-0 -ml-4 rounded-full border-[3px] border-white bg-white overflow-hidden shadow-sm">
                <AgentAvatar agent="investor" size={56} state="sleeping" interactive={false} />
              </div>
            </div>
        </motion.div>
      </div>
    </section>
  )
}
