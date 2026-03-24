'use client'

import { cn } from '@/lib/utils'
import type { Provider } from '@/data/mock-pricing'

const PROVIDERS: { id: Provider; label: string; color: string; activeColor: string; dotColor: string }[] = [
  {
    id: 'aws',
    label: 'Amazon Web Services',
    color: 'text-slate-400 border-transparent hover:border-orange-500/40 hover:text-orange-400',
    activeColor: 'text-orange-400 border-orange-500 bg-orange-500/10',
    dotColor: 'bg-orange-400',
  },
  {
    id: 'azure',
    label: 'Microsoft Azure',
    color: 'text-slate-400 border-transparent hover:border-sky-500/40 hover:text-sky-400',
    activeColor: 'text-sky-400 border-sky-500 bg-sky-500/10',
    dotColor: 'bg-sky-400',
  },
  {
    id: 'gcp',
    label: 'Google Cloud',
    color: 'text-slate-400 border-transparent hover:border-red-500/40 hover:text-red-400',
    activeColor: 'text-red-400 border-red-500 bg-red-500/10',
    dotColor: 'bg-red-400',
  },
]

interface Props {
  active: Provider
  onChange: (p: Provider) => void
}

export default function ProviderTabs({ active, onChange }: Props) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 border border-slate-700/60">
      {PROVIDERS.map((p) => {
        const isActive = p.id === active
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all border',
              isActive ? p.activeColor : p.color
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', p.dotColor)} />
            <span className="hidden sm:inline">{p.label}</span>
            <span className="sm:hidden uppercase font-bold text-xs tracking-wide">{p.id}</span>
          </button>
        )
      })}
    </div>
  )
}
