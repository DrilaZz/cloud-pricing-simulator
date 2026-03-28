'use client'

import { Trash2, Pencil, Server, Database, HardDrive, TrendingDown, Zap, Container } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { getServiceMonthlyCost, type ServiceCategory, type Provider } from '@/lib/pricing'
import { formatCurrency, formatPercent, cn } from '@/lib/utils'
import type { Service } from '@/lib/store'

const SERVICE_ICONS: Record<ServiceCategory, React.ElementType> = {
  compute:    Server,
  database:   Database,
  storage:    HardDrive,
  serverless: Zap,
  containers: Container,
}

// Icon background and color per category
const CATEGORY_STYLE: Record<ServiceCategory, { bg: string; color: string }> = {
  compute:    { bg: '#E6F1FB', color: '#378ADD' },
  database:   { bg: '#E1F5EE', color: '#1D9E75' },
  storage:    { bg: '#FAEEDA', color: '#BA7517' },
  serverless: { bg: '#FBEAF0', color: '#D4537E' },
  containers: { bg: '#EEEDFE', color: '#7F77DD' },
}

const PROVIDER_ACCENT: Record<Provider, string> = {
  aws:   '#FF9900',
  azure: '#0078D4',
  gcp:   '#4285F4',
}

const CATEGORY_BADGE_VARIANT: Record<ServiceCategory, 'compute' | 'database' | 'storage' | 'serverless' | 'containers'> = {
  compute:    'compute',
  database:   'database',
  storage:    'storage',
  serverless: 'serverless',
  containers: 'containers',
}

interface Props {
  service: Service
  appProvider: Provider
  appRegionDisplay: string
  onRemove: (id: string) => void
  onEdit: (service: Service) => void
}

export default function ServiceCard({ service, appProvider, appRegionDisplay, onRemove, onEdit }: Props) {
  const ServiceIcon = SERVICE_ICONS[service.serviceCategoryName] ?? Server
  const catStyle = CATEGORY_STYLE[service.serviceCategoryName] ?? { bg: '#F1F5F9', color: '#64748B' }
  const accentColor = PROVIDER_ACCENT[appProvider] ?? '#6366F1'

  const onDemand = getServiceMonthlyCost({ ...service, riEnabled: false })
  const riCost = service.riEnabled ? getServiceMonthlyCost(service) : null
  const saving = riCost !== null ? onDemand - riCost : null
  const savingPct = saving !== null && onDemand > 0 ? (saving / onDemand) * 100 : null

  return (
    <Card className="group relative overflow-hidden border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />

      <CardContent className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* Category icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: catStyle.bg }}
            >
              <ServiceIcon className="h-4 w-4" style={{ color: catStyle.color }} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + badges + actions */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{service.instanceName}</h3>
                  <Badge variant={CATEGORY_BADGE_VARIANT[service.serviceCategoryName] ?? 'secondary'} className="text-[10px] capitalize">
                    {service.serviceCategoryName}
                  </Badge>
                  {service.pricePerHourOndemand === 0 && (
                    <Badge className="text-[10px] bg-red-50 text-red-600 border-red-200">
                      No pricing
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{service.instanceSpecs}</p>
              </div>

              {/* Hover actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(service)}
                  className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(service.id)}
                  className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-slate-400">{appRegionDisplay}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-400">{service.utilization}% utilization</span>
              {service.riEnabled && (
                <>
                  <span className="text-xs text-slate-300">·</span>
                  <Badge variant="default" className="text-[10px]">RI {service.riTerm}</Badge>
                </>
              )}
            </div>

            {/* Cost row */}
            <div className="mt-3 flex items-end gap-4 flex-wrap">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">On-Demand / mo</p>
                <p className={cn('text-base font-bold', service.riEnabled ? 'text-slate-400 line-through text-sm' : 'text-slate-900')}>
                  {formatCurrency(onDemand)}
                </p>
              </div>
              {riCost !== null && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Reserved / mo</p>
                  <p className="text-base font-bold text-emerald-600">{formatCurrency(riCost)}</p>
                </div>
              )}
              {saving !== null && savingPct !== null && (
                <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                  <TrendingDown className="h-3 w-3 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">
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
