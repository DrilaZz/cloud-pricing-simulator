'use client'

import { Trash2, Server, Database, HardDrive, TrendingDown } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  MOCK_INSTANCES,
  REGIONS,
  getMonthlyOnDemandPrice,
  getMonthlyRIPrice,
  type ServiceType,
  type Provider,
} from '@/data/mock-pricing'
import { formatCurrency, formatPercent, cn } from '@/lib/utils'
import type { CloudComponent } from './Simulator'

const SERVICE_ICONS: Record<ServiceType, React.ElementType> = {
  compute: Server,
  database: Database,
  storage: HardDrive,
}

const PROVIDER_BADGE: Record<Provider, 'aws' | 'azure' | 'gcp'> = {
  aws: 'aws',
  azure: 'azure',
  gcp: 'gcp',
}

const PROVIDER_LABELS: Record<Provider, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
}

interface Props {
  component: CloudComponent
  onRemove: (id: string) => void
}

export default function ComponentCard({ component, onRemove }: Props) {
  const instance = MOCK_INSTANCES.find((i) => i.id === component.instanceId)
  if (!instance) return null

  const region = REGIONS[instance.provider].find((r) => r.id === component.region)
  const ServiceIcon = SERVICE_ICONS[instance.service]

  const onDemand = getMonthlyOnDemandPrice(instance, component.utilization)
  const riCost = component.riEnabled
    ? getMonthlyRIPrice(instance, component.utilization, component.riTerm)
    : null
  const saving = riCost !== null ? onDemand - riCost : null
  const savingPct = saving !== null && onDemand > 0 ? (saving / onDemand) * 100 : null

  return (
    <Card className="group relative overflow-hidden transition-all hover:border-slate-600/80">
      {/* Provider accent line */}
      <div
        className={cn(
          'absolute left-0 top-0 h-full w-0.5',
          instance.provider === 'aws'
            ? 'bg-orange-500'
            : instance.provider === 'azure'
            ? 'bg-sky-500'
            : 'bg-red-500'
        )}
      />

      <CardContent className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
              <ServiceIcon className="h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {instance.name}
                  </h3>
                  <Badge variant={PROVIDER_BADGE[instance.provider]} className="text-[10px]">
                    {PROVIDER_LABELS[instance.provider]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {instance.service}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{instance.specs}</p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(component.id)}
                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Config details */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-slate-500">{region?.label ?? component.region}</span>
              <span className="text-xs text-slate-600">·</span>
              <span className="text-xs text-slate-500">
                {component.utilization}% utilization
              </span>
              {component.riEnabled && (
                <>
                  <span className="text-xs text-slate-600">·</span>
                  <Badge variant="default" className="text-[10px]">
                    RI {component.riTerm}
                  </Badge>
                </>
              )}
            </div>

            {/* Costs */}
            <div className="mt-3 flex items-end gap-4 flex-wrap">
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">
                  On-Demand / mo
                </p>
                <p
                  className={cn(
                    'text-base font-bold',
                    component.riEnabled ? 'text-slate-400 line-through text-sm' : 'text-slate-100'
                  )}
                >
                  {formatCurrency(onDemand)}
                </p>
              </div>

              {riCost !== null && (
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">
                    Reserved / mo
                  </p>
                  <p className="text-base font-bold text-emerald-400">
                    {formatCurrency(riCost)}
                  </p>
                </div>
              )}

              {saving !== null && savingPct !== null && (
                <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1">
                  <TrendingDown className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">
                    -{formatCurrency(saving)}/mo ({formatPercent(savingPct)})
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
