'use client'

import { TrendingDown, DollarSign, Calendar, Shield } from 'lucide-react'
import { getServiceMonthlyCost } from '@/lib/pricing'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Service } from '@/lib/store'

interface Props {
  services: Service[]
}

export function computeServiceStats(services: Service[]) {
  let totalOnDemandMonthly = 0
  let totalEffectiveMonthly = 0
  let riCount = 0

  for (const svc of services) {
    const onDemand = getServiceMonthlyCost({ ...svc, riEnabled: false })
    const effective = getServiceMonthlyCost(svc)
    totalOnDemandMonthly += onDemand
    totalEffectiveMonthly += effective
    if (svc.riEnabled) riCount++
  }

  const totalSavingsMonthly = totalOnDemandMonthly - totalEffectiveMonthly
  const totalAnnual = totalEffectiveMonthly * 12
  const riCoverageRate = services.length > 0 ? (riCount / services.length) * 100 : 0

  return { totalOnDemandMonthly, totalEffectiveMonthly, totalSavingsMonthly, totalAnnual, riCoverageRate }
}

export default function Summary({ services }: Props) {
  if (services.length === 0) return null

  const stats = computeServiceStats(services)
  const savingsPct = stats.totalOnDemandMonthly > 0
    ? (stats.totalSavingsMonthly / stats.totalOnDemandMonthly) * 100
    : 0

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-slate-200" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-2">Summary</h2>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Monthly */}
        <div className="rounded-xl border border-[#BBDAF5] bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0C447C]">Monthly Total</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60">
              <DollarSign className="h-3.5 w-3.5 text-[#378ADD]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[#0C447C]">{formatCurrency(stats.totalEffectiveMonthly)}</p>
          {stats.totalSavingsMonthly > 0 && (
            <p className="text-[11px] text-[#378ADD] mt-1">
              vs <span className="line-through">{formatCurrency(stats.totalOnDemandMonthly)}</span> on-demand
            </p>
          )}
        </div>

        {/* Annual */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Annual Total</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalAnnual)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{services.length} service{services.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Savings */}
        <div className={`rounded-xl border p-4 ${
          stats.totalSavingsMonthly > 0
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#E1F5EE]'
            : 'border-slate-200 bg-white'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Monthly Savings</p>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stats.totalSavingsMonthly > 0 ? 'bg-white/60' : 'bg-slate-50'}`}>
              <TrendingDown className={`h-3.5 w-3.5 ${stats.totalSavingsMonthly > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${stats.totalSavingsMonthly > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
            {formatCurrency(stats.totalSavingsMonthly)}
          </p>
          {savingsPct > 0 && (
            <p className="text-[11px] text-emerald-600 mt-1">{formatPercent(savingsPct)} vs on-demand</p>
          )}
        </div>

        {/* RI Coverage */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">RI Coverage</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEEDFE]">
              <Shield className="h-3.5 w-3.5 text-[#534AB7]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatPercent(stats.riCoverageRate)}</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.riCoverageRate}%`, backgroundColor: '#534AB7' }}
            />
          </div>
        </div>
      </div>

      {stats.totalSavingsMonthly > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100">
            <TrendingDown className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              Annual savings with current RI commitments:{' '}
              <span className="text-emerald-600">{formatCurrency(stats.totalSavingsMonthly * 12)}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Based on {formatPercent(stats.riCoverageRate)} RI coverage across {services.length} service{services.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
