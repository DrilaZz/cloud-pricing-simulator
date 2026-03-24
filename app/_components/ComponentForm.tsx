'use client'

import { useState, useId } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import {
  MOCK_INSTANCES,
  REGIONS,
  type Provider,
  type ServiceType,
  type RITerm,
  type InstanceSpec,
  getMonthlyOnDemandPrice,
  getMonthlyRIPrice,
} from '@/data/mock-pricing'
import { formatCurrency } from '@/lib/utils'
import type { CloudComponent } from './Simulator'

const SERVICE_LABELS: Record<ServiceType, string> = {
  compute: 'Compute',
  database: 'Database',
  storage: 'Storage',
}

interface Props {
  activeProvider: Provider
  onAdd: (component: Omit<CloudComponent, 'id'>) => void
}

export default function ComponentForm({ activeProvider, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const formId = useId()

  const [provider, setProvider] = useState<Provider>(activeProvider)
  const [service, setService] = useState<ServiceType>('compute')
  const [instanceId, setInstanceId] = useState('')
  const [region, setRegion] = useState('')
  const [utilization, setUtilization] = useState(100)
  const [riEnabled, setRiEnabled] = useState(false)
  const [riTerm, setRiTerm] = useState<RITerm>('1yr')

  const filteredInstances = MOCK_INSTANCES.filter(
    (i) => i.provider === provider && i.service === service
  )
  const selectedInstance: InstanceSpec | undefined = filteredInstances.find(
    (i) => i.id === instanceId
  )
  const regions = REGIONS[provider]

  function handleOpen() {
    setProvider(activeProvider)
    setService('compute')
    setInstanceId('')
    setRegion(REGIONS[activeProvider][0]?.id ?? '')
    setUtilization(100)
    setRiEnabled(false)
    setRiTerm('1yr')
    setOpen(true)
  }

  function handleProviderChange(p: Provider) {
    setProvider(p)
    setInstanceId('')
    setRegion(REGIONS[p][0]?.id ?? '')
  }

  function handleServiceChange(s: ServiceType) {
    setService(s)
    setInstanceId('')
  }

  function handleSubmit() {
    if (!instanceId || !region) return
    onAdd({ instanceId, region, utilization, riEnabled, riTerm })
    setOpen(false)
  }

  const previewOnDemand = selectedInstance
    ? getMonthlyOnDemandPrice(selectedInstance, utilization)
    : null
  const previewRI =
    selectedInstance && riEnabled
      ? getMonthlyRIPrice(selectedInstance, utilization, riTerm)
      : null

  const canSubmit = !!instanceId && !!region

  return (
    <>
      <Button onClick={handleOpen} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Component
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Cloud Component</DialogTitle>
            <DialogDescription>
              Configure a cloud resource and add it to your architecture.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Provider */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-provider`}>Provider</Label>
              <div className="flex gap-2">
                {(['aws', 'azure', 'gcp'] as Provider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      provider === p
                        ? p === 'aws'
                          ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                          : p === 'azure'
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-red-500 bg-red-500/10 text-red-400'
                        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Service type */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-service`}>Service Type</Label>
              <select
                id={`${formId}-service`}
                value={service}
                onChange={(e) => handleServiceChange(e.target.value as ServiceType)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            {/* Instance type */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-instance`}>Instance Type</Label>
              <select
                id={`${formId}-instance`}
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select an instance…</option>
                {filteredInstances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {i.specs}
                  </option>
                ))}
              </select>
              {selectedInstance && (
                <p className="text-xs text-slate-500">
                  {selectedInstance.priceUnit === 'hour'
                    ? `$${selectedInstance.price.toFixed(4)}/hr · ~${formatCurrency(selectedInstance.price * 730)}/mo`
                    : `${formatCurrency(selectedInstance.price)}/mo (fixed)`}
                </p>
              )}
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-region`}>Region</Label>
              <select
                id={`${formId}-region`}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a region…</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Utilization */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Utilization Rate</Label>
                <span className="text-sm font-semibold text-indigo-400">{utilization}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[utilization]}
                onValueChange={([v]) => setUtilization(v)}
              />
              <div className="flex justify-between text-xs text-slate-600">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Reserved Instance */}
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-200">Reserved Instance</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Commit to a term for significant savings
                  </p>
                </div>
                <Switch checked={riEnabled} onCheckedChange={setRiEnabled} />
              </div>

              {riEnabled && (
                <div className="flex gap-2 pt-1">
                  {(['1yr', '3yr'] as RITerm[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRiTerm(t)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        riTerm === t
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {t === '1yr' ? '1 Year' : '3 Years'}
                      {selectedInstance && (
                        <span className="ml-1.5 text-xs text-emerald-400">
                          (-
                          {t === '1yr'
                            ? selectedInstance.riDiscount1yr
                            : selectedInstance.riDiscount3yr}
                          %)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cost Preview */}
            {previewOnDemand !== null && (
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-4">
                <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                  Monthly Cost Preview
                </p>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">On-Demand</p>
                    <p className="text-lg font-bold text-slate-200">
                      {formatCurrency(previewOnDemand)}
                    </p>
                  </div>
                  {previewRI !== null && (
                    <>
                      <div className="text-slate-600 self-center">→</div>
                      <div>
                        <p className="text-xs text-slate-500">Reserved ({riTerm})</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {formatCurrency(previewRI)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Monthly Saving</p>
                        <p className="text-lg font-bold text-emerald-400">
                          -{formatCurrency(previewOnDemand - previewRI)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              Add to Architecture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
