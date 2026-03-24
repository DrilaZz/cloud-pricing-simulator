'use client'

import { TrendingDown, DollarSign, Calendar, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  MOCK_INSTANCES,
  getMonthlyOnDemandPrice,
  getMonthlyRIPrice,
} from '@/data/mock-pricing'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { CloudComponent } from './Simulator'

interface Props {
  components: CloudComponent[]
}

interface SummaryStats {
  totalOnDemandMonthly: number
  totalEffectiveMonthly: number
  totalSavingsMonthly: number
  totalAnnual: number
  riCoverageRate: number
}

function computeStats(components: CloudComponent[]): SummaryStats {
  let totalOnDemandMonthly = 0
  let totalEffectiveMonthly = 0
  let riComponentCount = 0

  for (const comp of components) {
    const instance = MOCK_INSTANCES.find((i) => i.id === comp.instanceId)
    if (!instance) continue

    const onDemand = getMonthlyOnDemandPrice(instance, comp.utilization)
    const effective = comp.riEnabled
      ? getMonthlyRIPrice(instance, comp.utilization, comp.riTerm)
      : onDemand

    totalOnDemandMonthly += onDemand
    totalEffectiveMonthly += effective
    if (comp.riEnabled) riComponentCount++
  }

  const totalSavingsMonthly = totalOnDemandMonthly - totalEffectiveMonthly
  const totalAnnual = totalEffectiveMonthly * 12
  const riCoverageRate =
    components.length > 0 ? (riComponentCount / components.length) * 100 : 0

  return {
    totalOnDemandMonthly,
    totalEffectiveMonthly,
    totalSavingsMonthly,
    totalAnnual,
    riCoverageRate,
  }
}

export default function Summary({ components }: Props) {
  if (components.length === 0) return null

  const stats = computeStats(components)
  const savingsPct =
    stats.totalOnDemandMonthly > 0
      ? (stats.totalSavingsMonthly / stats.totalOnDemandMonthly) * 100
      : 0

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-slate-800" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-2">
          Summary
        </h2>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total monthly */}
        <Card className="border-slate-700/40 bg-slate-900/60">
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Monthly Total
              </CardTitle>
              <DollarSign className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-slate-100">
              {formatCurrency(stats.totalEffectiveMonthly)}
            </p>
            {stats.totalSavingsMonthly > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                vs{' '}
                <span className="line-through">
                  {formatCurrency(stats.totalOnDemandMonthly)}
                </span>{' '}
                on-demand
              </p>
            )}
          </CardContent>
        </Card>

        {/* Annual */}
        <Card className="border-slate-700/40 bg-slate-900/60">
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Annual Total
              </CardTitle>
              <Calendar className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-slate-100">
              {formatCurrency(stats.totalAnnual)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {components.length} component{components.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Total savings */}
        <Card
          className={`border-emerald-500/20 ${stats.totalSavingsMonthly > 0 ? 'bg-emerald-500/5' : 'bg-slate-900/60 border-slate-700/40'}`}
        >
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Monthly Savings
              </CardTitle>
              <TrendingDown
                className={`h-4 w-4 ${stats.totalSavingsMonthly > 0 ? 'text-emerald-500' : 'text-slate-600'}`}
              />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p
              className={`text-2xl font-bold ${stats.totalSavingsMonthly > 0 ? 'text-emerald-400' : 'text-slate-500'}`}
            >
              {formatCurrency(stats.totalSavingsMonthly)}
            </p>
            {savingsPct > 0 && (
              <p className="text-xs text-emerald-600 mt-0.5">
                {formatPercent(savingsPct)} vs full on-demand
              </p>
            )}
          </CardContent>
        </Card>

        {/* RI coverage */}
        <Card className="border-slate-700/40 bg-slate-900/60">
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                RI Coverage
              </CardTitle>
              <Shield className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-slate-100">
              {formatPercent(stats.riCoverageRate)}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${stats.riCoverageRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Annual savings callout */}
      {stats.totalSavingsMonthly > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <TrendingDown className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">
              Annual savings with current RI commitments:{' '}
              <span className="text-emerald-300">
                {formatCurrency(stats.totalSavingsMonthly * 12)}
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Based on {formatPercent(stats.riCoverageRate)} RI coverage across{' '}
              {components.length} component{components.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
