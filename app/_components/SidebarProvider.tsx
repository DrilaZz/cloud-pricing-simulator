'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface SidebarContextValue {
  refreshKey: number
  refreshSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshSidebar = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <SidebarContext.Provider value={{ refreshKey, refreshSidebar }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used inside SidebarProvider')
  return ctx
}
