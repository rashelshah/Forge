import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { StudioProject } from '@/lib/types'

const STATUS = { queued: ['Queued', 'neutral'], running: ['Building', 'amber'], done: ['Ready', 'leaf'], failed: ['Failed', 'rose'] } as const

export function StatusBadge({ p }: { p: Pick<StudioProject, 'status'> }) {
  const [label, tone] = STATUS[p.status]
  return <Badge tone={tone}>{p.status === 'running' && <Loader2 className="animate-spin" />}{p.status === 'done' && <CheckCircle2 />}{p.status === 'failed' && <AlertCircle />}{label}</Badge>
}
