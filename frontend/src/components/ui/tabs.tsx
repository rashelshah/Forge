import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsContent = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('focus:outline-none', className)} {...p} />
)
export const TabsList = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn('scrollbar-none flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line', className)} {...p} />
)
export const TabsTrigger = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn('relative -mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted transition hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink [&_svg]:size-4 cursor-pointer', className)}
    {...p}
  />
)
