'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getServiceMonthlyCost, type ServiceCategory } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import type { Service } from '@/lib/store'

const SERVICE_COLORS: Record<ServiceCategory, string> = {
  compute:    '#378ADD',
  database:   '#1D9E75',
  storage:    '#BA7517',
  serverless: '#D4537E',
  containers: '#7F77DD',
}

const SERVICE_LABELS: Record<ServiceCategory, string> = {
  compute:    'Compute',
  database:   'Database',
  storage:    'Storage',
  serverless: 'Serverless',
  containers: 'Containers',
}

interface Props {
  services: Service[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; payload: { pct: number } }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value, payload: { pct } } = payload[0]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-slate-900">{name}</p>
      <p className="text-slate-600">{formatCurrency(value)}/mo</p>
      <p className="font-semibold" style={{ color: '#534AB7' }}>{pct.toFixed(1)}%</p>
    </div>
  )
}

export default function AppCostPieChart({ services }: Props) {
  const totals: Record<ServiceCategory, number> = { compute: 0, database: 0, storage: 0, serverless: 0, containers: 0 }

  for (const svc of services) {
    const cost = getServiceMonthlyCost(svc)
    totals[svc.serviceCategoryName] += cost
  }

  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  if (total === 0) return null

  const data = (Object.keys(totals) as ServiceCategory[])
    .filter((k) => totals[k] > 0)
    .map((k) => ({
      name: SERVICE_LABELS[k],
      value: totals[k],
      pct: (totals[k] / total) * 100,
      color: SERVICE_COLORS[k],
    }))

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Cost by Service Type
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-slate-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500 mt-1">{formatCurrency(total)}/mo total</p>
    </div>
  )
}
