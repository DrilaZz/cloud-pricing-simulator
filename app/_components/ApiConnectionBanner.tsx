'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { checkHealth } from '@/lib/api'

export default function ApiConnectionBanner() {
  const [connected, setConnected] = useState(true)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      await checkHealth()
      setConnected(true)
    } catch {
      setConnected(false)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  if (connected) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-red-600 px-4 py-2.5 text-sm text-white">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>Backend non connecté. Lancez le serveur sur localhost:8000</span>
      <button
        onClick={check}
        disabled={checking}
        className="flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        Retry
      </button>
    </div>
  )
}
