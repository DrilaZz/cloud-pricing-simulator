'use client'

import { useState, useCallback } from 'react'
import { CloudOff } from 'lucide-react'
import ProviderTabs from './ProviderTabs'
import ComponentForm from './ComponentForm'
import ComponentCard from './ComponentCard'
import Summary from './Summary'
import type { Provider, RITerm } from '@/data/mock-pricing'

export interface CloudComponent {
  id: string
  instanceId: string
  region: string
  utilization: number
  riEnabled: boolean
  riTerm: RITerm
}

let counter = 0

export default function Simulator() {
  const [activeProvider, setActiveProvider] = useState<Provider>('aws')
  const [components, setComponents] = useState<CloudComponent[]>([])

  const handleAdd = useCallback((comp: Omit<CloudComponent, 'id'>) => {
    setComponents((prev) => [...prev, { ...comp, id: `comp-${++counter}` }])
  }, [])

  const handleRemove = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Architecture Builder</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Compose your cloud stack and compare costs across providers
          </p>
        </div>
        <ComponentForm activeProvider={activeProvider} onAdd={handleAdd} />
      </div>

      {/* Provider selector */}
      <ProviderTabs active={activeProvider} onChange={setActiveProvider} />

      {/* Component list */}
      <div className="mt-6">
        {components.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 py-16 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 mb-4">
              <CloudOff className="h-7 w-7 text-slate-600" />
            </div>
            <h3 className="text-base font-medium text-slate-300 mb-1">
              No components yet
            </h3>
            <p className="text-sm text-slate-500 max-w-xs">
              Click &ldquo;Add Component&rdquo; to start building your architecture and
              comparing cloud costs.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {components.map((comp) => (
              <ComponentCard key={comp.id} component={comp} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <Summary components={components} />
    </main>
  )
}
