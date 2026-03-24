import { Cloud } from 'lucide-react'

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/30">
              <Cloud className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100 leading-tight">
                Cloud Pricing Simulator
              </h1>
              <p className="text-xs text-slate-500 leading-tight">
                Multi-provider FinOps tool
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mock data · v1.0
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
