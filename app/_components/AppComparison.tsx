'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { TrendingDown, X } from 'lucide-react'
import { getServiceMonthlyCost, type Provider } from '@/lib/pricing'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Application } from '@/lib/store'

const PROVIDER_BADGE: Record<Provider, 'aws' | 'azure' | 'gcp'> = {
  aws: 'aws', azure: 'azure', gcp: 'gcp',
}
const PROVIDER_LABEL: Record<Provider, string> = {
  aws: 'AWS', azure: 'Azure', gcp: 'GCP',
}

function appStats(app: Application) {
  let onDemand = 0
  let effective = 0
  for (const svc of app.services) {
    const od = getServiceMonthlyCost({ ...svc, riEnabled: false })
    const ef = getServiceMonthlyCost(svc)
    onDemand += od
    effective += ef
  }
  return {
    onDemand,
    effective,
    savings: onDemand - effective,
    savingsPct: onDemand > 0 ? ((onDemand - effective) / onDemand) * 100 : 0,
    services: app.services.length,
  }
}

const BAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b']

interface Props {
  apps: Application[]
}

export default function AppComparison({ apps }: Props) {
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 4) {
        next.add(id)
      }
      return next
    })
  }

  function openCompare() {
    setSelected(new Set())
    setCompareMode(true)
  }

  function closeCompare() {
    setCompareMode(false)
    setSelected(new Set())
  }

  const selectedApps = apps.filter((a) => selected.has(a.id))
  const canCompare = selected.size >= 2

  if (apps.length < 2) return null

  return (
    <div className="mt-6">
      {!compareMode ? (
        <Button variant="secondary" onClick={openCompare}>
          Compare Applications
        </Button>
      ) : (
        <div className="space-y-5">
          {/* Selection UI */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Select applications to compare
                </p>
                <p className="text-xs text-slate-500">
                  Choose 2 to 4 applications · {selected.size} selected
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeCompare}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {apps.map((app) => {
                const isSelected = selected.has(app.id)
                const isDisabled = !isSelected && selected.size >= 4
                return (
                  <button
                    key={app.id}
                    disabled={isDisabled}
                    onClick={() => toggleSelect(app.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${
                      app.provider === 'aws' ? 'bg-orange-400' : app.provider === 'azure' ? 'bg-sky-400' : 'bg-red-400'
                    }`} />
                    {app.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Comparison table + chart */}
          {canCompare && (
            <div className="space-y-4">
              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Metric</th>
                      {selectedApps.map((app, i) => (
                        <th key={app.id} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: BAR_COLORS[i] }}>
                          {app.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {[
                      { label: 'Provider', render: (app: Application) => (
                        <Badge variant={PROVIDER_BADGE[app.provider]} className="text-[10px]">{PROVIDER_LABEL[app.provider]}</Badge>
                      )},
                      { label: 'Services', render: (app: Application) => <span className="font-medium">{app.services.length}</span> },
                      { label: 'On-Demand / mo', render: (app: Application) => formatCurrency(appStats(app).onDemand) },
                      { label: 'With RI / mo', render: (app: Application) => (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(appStats(app).effective)}</span>
                      )},
                      { label: 'Monthly Savings', render: (app: Application) => {
                        const s = appStats(app)
                        return s.savings > 0
                          ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium justify-end"><TrendingDown className="h-3.5 w-3.5" />{formatCurrency(s.savings)} ({formatPercent(s.savingsPct)})</span>
                          : <span className="text-slate-400">—</span>
                      }},
                      { label: 'Annual Total', render: (app: Application) => <span className="font-semibold">{formatCurrency(appStats(app).effective * 12)}</span> },
                    ].map(({ label, render }) => (
                      <tr key={label}>
                        <td className="px-4 py-3 text-slate-500 font-medium">{label}</td>
                        {selectedApps.map((app) => (
                          <td key={app.id} className="px-4 py-3 text-right text-slate-800 dark:text-slate-200">
                            {render(app)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bar chart */}
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                    Cost Comparison
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={[
                        {
                          name: 'On-Demand/mo',
                          ...Object.fromEntries(selectedApps.map((a) => [a.name, parseFloat(appStats(a).onDemand.toFixed(2))])),
                        },
                        {
                          name: 'With RI/mo',
                          ...Object.fromEntries(selectedApps.map((a) => [a.name, parseFloat(appStats(a).effective.toFixed(2))])),
                        },
                      ]}
                      margin={{ top: 0, right: 0, left: 10, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                      />
                      <Tooltip
                        formatter={(v) => [typeof v === 'number' ? formatCurrency(v) : String(v), '']}
                        contentStyle={{
                          background: 'var(--tooltip-bg, #fff)',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                      />
                      <Legend formatter={(v) => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>} />
                      {selectedApps.map((app, i) => (
                        <Bar key={app.id} dataKey={app.name} fill={BAR_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
