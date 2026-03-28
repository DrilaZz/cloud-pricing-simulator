'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { TrendingDown, X, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  compareApp,
  type CompareAppResponse,
  type CompareServiceInput,
} from '@/lib/api'
import type { Provider, ServiceCategory } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import type { Application } from '@/lib/store'

const PROVIDERS: Provider[] = ['aws', 'azure', 'gcp']
const PROVIDER_LABEL: Record<Provider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' }
const PROVIDER_COLORS: Record<Provider, string> = {
  aws:   '#FF9900',
  azure: '#0078D4',
  gcp:   '#4285F4',
}
// ─── Category chart config ────────────────────────────────────────────────────

const CATEGORIES: ServiceCategory[] = ['compute', 'database', 'storage', 'serverless', 'containers']

const CATEGORY_COLORS: Record<ServiceCategory, string> = {
  compute:    '#378ADD',
  database:   '#1D9E75',
  storage:    '#BA7517',
  serverless: '#D4537E',
  containers: '#7F77DD',
}

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  compute:    'Compute',
  database:   'Database',
  storage:    'Storage',
  serverless: 'Serverless',
  containers: 'Containers',
}

function groupToCategory(group: string | null): ServiceCategory | null {
  if (!group) return null
  if (group.startsWith('compute-'))    return 'compute'
  if (group.startsWith('db-'))         return 'database'
  if (group.startsWith('storage-'))    return 'storage'
  if (group.startsWith('serverless-')) return 'serverless'
  if (group.startsWith('containers-')) return 'containers'
  return null
}

interface CategoryDetail { instance: string; cost: number }

interface StackedRow {
  provider:    string
  providerKey: Provider
  _total:      number
  compute:     number
  database:    number
  storage:     number
  serverless:  number
  containers:  number
  _computeDetails:    CategoryDetail[]
  _databaseDetails:   CategoryDetail[]
  _storageDetails:    CategoryDetail[]
  _serverlessDetails: CategoryDetail[]
  _containersDetails: CategoryDetail[]
}

function buildStackedData(
  result: CompareAppResponse,
  appServices: Application['services'],
): StackedRow[] {
  // Map each result service to its category
  const serviceToCategory: Record<string, ServiceCategory> = {}
  for (const svc of result.services) {
    const cat = groupToCategory(svc.equivalent_group)
    if (cat) {
      serviceToCategory[svc.service_id] = cat
    } else {
      const appSvc = appServices.find((s) => s.id === svc.service_id)
      if (appSvc) serviceToCategory[svc.service_id] = appSvc.serviceCategoryName as ServiceCategory
    }
  }

  return PROVIDERS.map((p) => {
    const costs  = { compute: 0, database: 0, storage: 0, serverless: 0, containers: 0 } as Record<ServiceCategory, number>
    const details = { compute: [], database: [], storage: [], serverless: [], containers: [] } as Record<ServiceCategory, CategoryDetail[]>

    for (const svc of result.services) {
      const cat = serviceToCategory[svc.service_id]
      if (!cat) continue
      const eq = svc.equivalents[p]
      if (eq && eq.monthly_cost_effective > 0) {
        costs[cat]   += eq.monthly_cost_effective
        details[cat].push({ instance: eq.instance_name, cost: eq.monthly_cost_effective })
      }
    }

    const total = (Object.values(costs) as number[]).reduce((a, b) => a + b, 0)

    return {
      provider:    PROVIDER_LABEL[p],
      providerKey: p,
      _total:      parseFloat(total.toFixed(2)),
      compute:     parseFloat(costs.compute.toFixed(2)),
      database:    parseFloat(costs.database.toFixed(2)),
      storage:     parseFloat(costs.storage.toFixed(2)),
      serverless:  parseFloat(costs.serverless.toFixed(2)),
      containers:  parseFloat(costs.containers.toFixed(2)),
      _computeDetails:    details.compute,
      _databaseDetails:   details.database,
      _storageDetails:    details.storage,
      _serverlessDetails: details.serverless,
      _containersDetails: details.containers,
    }
  })
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

interface TooltipEntry {
  dataKey: ServiceCategory
  value:   number
  color:   string
  payload: StackedRow
}

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null

  const row = payload[0].payload
  const nonZero = payload.filter((p) => p.value > 0)
  if (!nonZero.length) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-xs dark:border-slate-700 dark:bg-slate-900 min-w-[180px]">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">
        {row.provider}
      </p>
      {nonZero.map((entry) => {
        const cat     = entry.dataKey
        const details = row[`_${cat}Details` as keyof StackedRow] as CategoryDetail[]
        return (
          <div key={cat} className="mb-2 last:mb-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="font-semibold" style={{ color: entry.color }}>
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                {formatCurrency(entry.value)}
              </span>
            </div>
            {details?.map((d) => (
              <p key={d.instance} className="text-[10px] text-slate-400 mt-0.5 ml-3.5 truncate max-w-[160px]">
                {d.instance} · {formatCurrency(d.cost)}
              </p>
            ))}
          </div>
        )
      })}
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 flex justify-between">
        <span className="text-slate-500">Total</span>
        <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {formatCurrency(row._total)}
        </span>
      </div>
    </div>
  )
}

// ─── Total label on top of each stacked bar ──────────────────────────────────

function TotalLabel({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) {
  if (!value) return null
  return (
    <text
      x={(x ?? 0) + (width ?? 0) / 2}
      y={(y ?? 0) - 5}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill="#64748b"
    >
      {formatCurrency(value)}
    </text>
  )
}

interface Props {
  app: Application
}

export default function MultiCloudSimulation({ app }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompareAppResponse | null>(null)

  async function runSimulation() {
    if (app.services.length === 0) return
    setLoading(true)
    setError(null)
    setResult(null)

    const payload: CompareServiceInput[] = app.services.map((svc) => ({
      service_id:       svc.id,
      instance_type_id: svc.instanceTypeId,
      region_id:        app.regionId,
      utilization_rate: svc.utilization / 100,
      reserved:         svc.riEnabled,
      reserved_term:    svc.riTerm === '3yr' ? '3y' : '1y',
      pricing_unit:     null, // backend reads it from DB
      volume_gb:        null,
      monthly_requests: null,
      avg_duration_ms:  null,
      memory_mb:        null,
      node_count:       null,
    }))

    try {
      const data = await compareApp(payload)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    runSimulation()
  }

  if (app.services.length === 0) return null

  const totals = result?.provider_totals ?? {}

  const cheapestEffective = result
    ? Math.min(...PROVIDERS.map((p) => totals[p]?.total_monthly_effective ?? Infinity).filter(isFinite))
    : null

  const stackedChartData = result ? buildStackedData(result, app.services) : []

  return (
    <>
      {!open ? (
        <Button variant="secondary" onClick={handleOpen} className="gap-2 flex-shrink-0">
          <Zap className="h-4 w-4" />
          Compare providers
        </Button>
      ) : (
        <div className="mt-0 w-full space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Multi-Cloud Comparison
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Equivalent architecture estimated on AWS, Azure, and GCP
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Fetching equivalent pricing from all providers…</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && result && (
            <>
              {/* Provider summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PROVIDERS.map((p) => {
                  const t = totals[p]
                  const isCheapest = cheapestEffective !== null && t && t.total_monthly_effective === cheapestEffective
                  const isCurrent = p === app.provider
                  const savings = t ? t.total_monthly_ondemand - t.total_monthly_effective : 0

                  return (
                    <Card
                      key={p}
                      className={
                        isCheapest
                          ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/40 dark:bg-emerald-500/5'
                          : ''
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: PROVIDER_COLORS[p] }}
                            />
                            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                              {PROVIDER_LABEL[p]}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {isCurrent && (
                              <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                Current
                              </span>
                            )}
                            {isCheapest && (
                              <span className="rounded-md border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400">
                                Cheapest
                              </span>
                            )}
                          </div>
                        </div>

                        {t ? (
                          <>
                            <p className="text-[10px] text-slate-500 mb-3 truncate">
                              {t.region_display_name || '—'}
                              {t.mapped_services < t.total_services && (
                                <span className="ml-1 text-amber-500">
                                  ({t.mapped_services}/{t.total_services} matched)
                                </span>
                              )}
                            </p>

                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-xs text-slate-500">On-Demand / mo</span>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                  {formatCurrency(t.total_monthly_ondemand)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-xs text-slate-500">With RI / mo</span>
                                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(t.total_monthly_effective)}
                                </span>
                              </div>
                              {savings > 0.01 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">RI Savings</span>
                                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <TrendingDown className="h-3 w-3" />
                                    {formatCurrency(savings)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">No data</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Stacked bar chart — cost by category per provider */}
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                    Cost by Category ($/mo)
                  </p>

                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={stackedChartData}
                      margin={{ top: 28, right: 16, left: 10, bottom: 0 }}
                      barCategoryGap="35%"
                    >
                      <XAxis
                        dataKey="provider"
                        tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={58}
                      />
                      <Tooltip
                        content={<CategoryTooltip />}
                        cursor={{ fill: 'rgba(148,163,184,0.07)' }}
                      />

                      {CATEGORIES.map((cat, i) => (
                        <Bar
                          key={cat}
                          dataKey={cat}
                          stackId="stack"
                          fill={CATEGORY_COLORS[cat]}
                          maxBarSize={80}
                          // Only round the top corners of the topmost bar
                          radius={i === CATEGORIES.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        >
                          {/* Total label floats above each full stacked bar */}
                          {i === CATEGORIES.length - 1 && (
                            <LabelList
                              dataKey="_total"
                              position="top"
                              content={TotalLabel as any}
                            />
                          )}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Custom legend */}
                  <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {CATEGORIES.map((cat) => (
                      <div key={cat} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {CATEGORY_LABELS[cat]}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Per-service breakdown table */}
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                    Service Breakdown
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Service
                          </th>
                          {PROVIDERS.map((p) => (
                            <th
                              key={p}
                              className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide"
                              style={{ color: PROVIDER_COLORS[p] }}
                            >
                              {PROVIDER_LABEL[p]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                        {result.services.map((svc) => {
                          // Find the original service name in app
                          const appSvc = app.services.find((s) => s.id === svc.service_id)
                          return (
                            <tr key={svc.service_id} className="group">
                              <td className="py-2.5 pr-4">
                                <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                                  {svc.original_instance}
                                </div>
                                {svc.equivalent_group && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Group: {svc.equivalent_group}
                                  </div>
                                )}
                              </td>
                              {PROVIDERS.map((p) => {
                                const eq = svc.equivalents[p]
                                const isCurrentProvider = p === app.provider
                                return (
                                  <td key={p} className="py-2.5 text-right min-w-[110px]">
                                    {eq ? (
                                      <div>
                                        <div className="flex items-center justify-end gap-1">
                                          {isCurrentProvider ? (
                                            <CheckCircle2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                          ) : (
                                            <span
                                              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                              style={{ backgroundColor: PROVIDER_COLORS[p] }}
                                            />
                                          )}
                                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                                            {formatCurrency(eq.monthly_cost_effective)}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px] ml-auto">
                                          {eq.instance_name}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-end gap-1">
                                        <AlertCircle className="h-3 w-3 text-slate-300" />
                                        <span className="text-[10px] text-slate-400">No equivalent</span>
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                      {/* Totals row */}
                      <tfoot>
                        <tr className="border-t border-slate-200 dark:border-slate-700">
                          <td className="pt-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Total / mo
                          </td>
                          {PROVIDERS.map((p) => {
                            const t = totals[p]
                            const isCheapest = cheapestEffective !== null && t && t.total_monthly_effective === cheapestEffective
                            return (
                              <td key={p} className="pt-3 text-right">
                                <span
                                  className={`text-sm font-bold ${isCheapest ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}
                                >
                                  {t ? formatCurrency(t.total_monthly_effective) : '—'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  )
}
