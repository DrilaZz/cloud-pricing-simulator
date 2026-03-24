import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300',
        secondary: 'border-slate-600 bg-slate-800 text-slate-300',
        success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        warning: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
        destructive: 'border-red-500/30 bg-red-500/15 text-red-400',
        aws: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
        azure: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
        gcp: 'border-red-500/30 bg-red-500/10 text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
