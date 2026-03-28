'use client'

import { useState, useEffect } from 'react'
import { Database, Loader2, CheckCircle2, AlertTriangle, XCircle, CalendarDays, Hash, Info } from 'lucide-react'
import { Card, CardContent } from '@/app/_components/ui/card'
import { getDataStatus, type DataStatus, type RegionDataStatus } from '@/lib/api'

const PROVIDER_COLOR: Record<string, string> = {
  aws:   '#FF9900',
  azure: '#0078D4',
  gcp:   '#4285F4',
}
const PROVIDER_LABEL: Record<string, string> = {
  aws: 'AWS', azure: 'Azure', gcp: 'GCP',
}

const CATEGORIES = ['compute', 'database', 'storage', 'serverless', 'containers'] as const

const CAT_LABEL: Record<string, string> = {
  compute: 'Compute', database: 'DB', storage: 'Storage',
  serverless: 'Serverless', containers: 'Containers',
}

function StatusBadge({ status }: { status: RegionDataStatus['status'] }) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Partial
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <XCircle className="h-3 w-3" />
      Empty
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Returns age in days (0 if null), and a freshness badge element */
function FreshnessBadge({ isoDate }: { isoDate: string | null }) {
  if (!isoDate) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <XCircle className="h-3 w-3" />
        No date available
      </span>
    )
  }
  const ageMs = Date.now() - new Date(isoDate).getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))

  if (ageDays < 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Up to date
      </span>
    )
  }
  if (ageDays < 90) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Data is {ageDays} days old
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <XCircle className="h-3 w-3" />
      Data is outdated ({ageDays} days old)
    </span>
  )
}

export default function DataStatusPage() {
  const [data, setData] = useState<DataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    getDataStatus()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const providerOrder = ['aws', 'azure', 'gcp']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-6 lg:px-8 py-8 text-red-500">
        Failed to load data status: {error ?? 'Unknown error'}
      </div>
    )
  }

  // Compute overall status
  const overallStatus =
    data.total_prices === 0
      ? 'empty'
      : data.regions.every((r) => r.status === 'complete')
      ? 'complete'
      : 'partial'

  return (
    <div className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEEDFE]">
          <Database className="h-5 w-5" style={{ color: '#7F77DD' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Data Status</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pricing coverage across providers and regions
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-6 text-sm text-blue-800">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          Pricing data is bundled with the application. To update prices, run{' '}
          <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-xs">
            python -m app.scripts.generate_pricing_json
          </code>{' '}
          locally and rebuild.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {/* Total prices */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-medium text-slate-500">Total prices</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{data.total_prices.toLocaleString()}</p>
          </CardContent>
        </Card>

        {/* Pricing data from */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-medium text-slate-500">Pricing data from</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900">{formatDate(data.pricing_data_date)}</p>
              <FreshnessBadge isoDate={data.pricing_data_date} />
            </div>
          </CardContent>
        </Card>

        {/* Per-provider cards */}
        {providerOrder.map((prov) => {
          const s = data.providers_status[prov]
          if (!s) return null
          const color = PROVIDER_COLOR[prov]
          const total = s.complete + s.partial + s.empty
          return (
            <Card key={prov} className="lg:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {PROVIDER_LABEL[prov]}
                  </span>
                  <p className="text-xs text-slate-500">{total} regions</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 className="h-3 w-3" />{s.complete}
                  </span>
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />{s.partial}
                  </span>
                  <span className="flex items-center gap-1 text-red-500 font-medium">
                    <XCircle className="h-3 w-3" />{s.empty}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Overall status banner */}
      {overallStatus !== 'complete' && (
        <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 mb-6 text-sm ${
          overallStatus === 'empty'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          {overallStatus === 'empty'
            ? <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>
            {overallStatus === 'empty'
              ? 'No pricing data available. Run the scrapers to populate the database.'
              : 'Some regions have incomplete pricing data. Cost comparisons may be inaccurate for those regions.'}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Region</th>
                {CATEGORIES.map((cat) => (
                  <th key={cat} className="px-3 py-3 text-center text-xs font-semibold text-slate-600">
                    {CAT_LABEL[cat]}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Last updated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.regions.map((region) => {
                const color = PROVIDER_COLOR[region.provider_name]
                return (
                  <tr
                    key={`${region.provider_name}-${region.region_code}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Provider */}
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {PROVIDER_LABEL[region.provider_name] ?? region.provider_name}
                      </span>
                    </td>
                    {/* Region */}
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-slate-800">{region.region_display_name}</p>
                      <p className="text-[10px] text-slate-400">{region.region_code}</p>
                    </td>
                    {/* Category counts */}
                    {CATEGORIES.map((cat) => {
                      const count = region.breakdown[cat] ?? 0
                      return (
                        <td key={cat} className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-medium tabular-nums ${
                            count === 0 ? 'text-red-400' : 'text-slate-700'
                          }`}>
                            {count === 0
                              ? <span className="text-[10px] font-normal text-red-300">—</span>
                              : count}
                          </span>
                        </td>
                      )
                    })}
                    {/* Last updated */}
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(region.last_updated)}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusBadge status={region.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
