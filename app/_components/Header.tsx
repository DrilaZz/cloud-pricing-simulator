'use client'

import Link from 'next/link'
import { Cloud, Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { Button } from './ui/button'

export default function Header() {
  const { theme, toggle } = useTheme()

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/30">
              <Cloud className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Cloud Pricing Simulator
              </h1>
              <p className="text-xs text-slate-500 leading-tight">Multi-provider FinOps tool</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mock data · v2.0
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Toggle dark/light mode"
              className="h-9 w-9"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
