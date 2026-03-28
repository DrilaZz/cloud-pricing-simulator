import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-indigo-200 bg-indigo-50 text-indigo-700',
        secondary:
          'border-slate-200 bg-slate-100 text-slate-600',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning:
          'border-amber-200 bg-amber-50 text-amber-700',
        destructive:
          'border-red-200 bg-red-50 text-red-700',
        // ── Cloud providers ──────────────────────────────────────────────
        aws:
          'border-[#FFD699] bg-[#FFF3E0] text-[#E65100]',
        azure:
          'border-[#90C8F0] bg-[#E6F1FB] text-[#0C447C]',
        gcp:
          'border-[#A8C8FA] bg-[#E8F0FE] text-[#042C53]',
        // ── Service categories ───────────────────────────────────────────
        compute:
          'border-[#BBDAF5] bg-[#E6F1FB] text-[#0C447C]',
        database:
          'border-[#9DD9C3] bg-[#E1F5EE] text-[#085041]',
        storage:
          'border-[#E5C97A] bg-[#FAEEDA] text-[#633806]',
        serverless:
          'border-[#F0AECA] bg-[#FBEAF0] text-[#72243E]',
        containers:
          'border-[#C0BCEF] bg-[#EEEDFE] text-[#3C3489]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
