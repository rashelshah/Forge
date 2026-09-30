import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverContent = ({ className, align = 'end', sideOffset = 8, ...p }: React.ComponentProps<typeof PopoverPrimitive.Content>) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn('z-50 w-80 rounded-2xl border border-line bg-white shadow-float focus:outline-none', className)} {...p} />
  </PopoverPrimitive.Portal>
)
