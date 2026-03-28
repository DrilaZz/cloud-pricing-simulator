'use client'

import { useState, useEffect, useId } from 'react'
import { Plus, Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import {
  getServiceCategories, getInstanceTypes, getPricing,
  type ApiServiceCategory, type ApiInstanceType, type ApiPricing,
  type ServiceCreatePayload,
} from '@/lib/api'
import { getMonthlyRICost, formatSpecs, type RITerm, type ServiceCategory } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import type { Service } from '@/lib/store'

interface Props {
  providerId: number
  regionId: number
  onAdd: (data: ServiceCreatePayload) => void
  /** When set, the form opens in edit mode pre-filled with this service */
  editService?: Service
  onUpdate?: (id: string, data: ServiceCreatePayload) => void
  /** When provided, the dialog is controlled externally */
  externalOpen?: boolean
  onExternalClose?: () => void
  /** Pricing data coverage for the current region */
  regionStatus?: 'complete' | 'partial' | 'empty'
}

const HOURS = 730

function NumericField({
  id, label, value, onChange, min, step, suffix,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void
  min?: number; step?: number; suffix?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min ?? 0}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        {suffix && <span className="text-sm text-slate-500 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  )
}

export default function ServiceForm({ providerId, regionId, onAdd, editService, onUpdate, externalOpen, onExternalClose, regionStatus }: Props) {
  const isEditMode = editService !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (externalOpen !== undefined) {
      if (!v) onExternalClose?.()
    } else {
      setInternalOpen(v)
    }
  }
  const formId = useId()

  // API data
  const [categories, setCategories] = useState<ApiServiceCategory[]>([])
  const [instances, setInstances] = useState<ApiInstanceType[]>([])
  const [pricing, setPricing] = useState<ApiPricing | null>(null)
  const [loadingCats, setLoadingCats] = useState(false)
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [loadingPricing, setLoadingPricing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state — shared
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categoryName, setCategoryName] = useState<ServiceCategory>('compute')
  const [instanceTypeId, setInstanceTypeId] = useState<number | ''>('')

  // Compute / Database / Containers shared
  const [utilization, setUtilization] = useState(100)
  const [riEnabled, setRiEnabled] = useState(false)
  const [riTerm, setRiTerm] = useState<RITerm>('1yr')

  // Database only
  const [deploymentOption, setDeploymentOption] = useState<'single-az' | 'multi-az'>('single-az')

  // Storage only
  const [volumeGb, setVolumeGb] = useState(100)

  // Serverless only
  const [monthlyRequests, setMonthlyRequests] = useState(1_000_000)
  const [avgDurationMs, setAvgDurationMs] = useState(200)
  const [memoryMb, setMemoryMb] = useState(512)

  // Containers only
  const [nodeCount, setNodeCount] = useState(3)

  // When externally opened in edit mode, pre-fill state from the service
  useEffect(() => {
    if (externalOpen && isEditMode && editService) {
      prefillFromService(editService)
    }
  }, [externalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load service categories on open — in edit mode, pre-select the service's category
  useEffect(() => {
    if (!open) return
    setLoadingCats(true)
    setError(null)
    getServiceCategories()
      .then((cats) => {
        setCategories(cats)
        if (isEditMode && editService) {
          const cat = cats.find((c) => c.name === editService.serviceCategoryName)
          if (cat) {
            setCategoryId(cat.id)
            setCategoryName(editService.serviceCategoryName)
          }
        } else if (cats.length > 0) {
          setCategoryId(cats[0].id)
          setCategoryName(cats[0].name as ServiceCategory)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingCats(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load instances when category or region changes — filtered by region
  useEffect(() => {
    if (!open || typeof categoryId !== 'number' || categoryId <= 0) return
    if (typeof providerId !== 'number' || providerId <= 0) return
    setLoadingInstances(true)
    setInstances([])
    setInstanceTypeId('')
    setPricing(null)
    getInstanceTypes(providerId, categoryName, regionId)
      .then(setInstances)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingInstances(false))
  }, [categoryId, categoryName, providerId, regionId, open])

  // In edit mode: auto-select the current instance once instances are loaded
  useEffect(() => {
    if (!isEditMode || !editService || instances.length === 0) return
    if (instanceTypeId !== '') return  // already selected
    const found = instances.find((i) => i.id === editService.instanceTypeId)
    if (found) setInstanceTypeId(found.id)
  }, [instances]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load pricing when instance changes
  useEffect(() => {
    if (!open || typeof instanceTypeId !== 'number' || instanceTypeId <= 0) return
    if (typeof regionId !== 'number' || regionId <= 0) return
    setLoadingPricing(true)
    setPricing(null)
    getPricing(instanceTypeId, regionId)
      .then((rows) => setPricing(rows[0] ?? null))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingPricing(false))
  }, [instanceTypeId, regionId, open])

  const selectedInstance = instances.find((i) => i.id === instanceTypeId)
  const pricingUnit = selectedInstance?.pricing_unit ?? 'per_hour'

  function resetForm() {
    setCategoryId('')
    setCategoryName('compute')
    setInstanceTypeId('')
    setPricing(null)
    setUtilization(100)
    setRiEnabled(false)
    setRiTerm('1yr')
    setDeploymentOption('single-az')
    setVolumeGb(100)
    setMonthlyRequests(1_000_000)
    setAvgDurationMs(200)
    setMemoryMb(512)
    setNodeCount(3)
    setError(null)
  }

  function prefillFromService(svc: Service) {
    setCategoryName(svc.serviceCategoryName)
    setInstanceTypeId('')  // will be set once instances load
    setPricing(null)
    setUtilization(svc.utilization)
    setRiEnabled(svc.riEnabled)
    setRiTerm(svc.riTerm)
    setDeploymentOption((svc.deploymentOption as 'single-az' | 'multi-az') ?? 'single-az')
    setVolumeGb(svc.volumeGb ?? 100)
    setMonthlyRequests(svc.monthlyRequests ?? 1_000_000)
    setAvgDurationMs(svc.avgDurationMs ?? 200)
    setMemoryMb(svc.memoryMb ?? 512)
    setNodeCount(svc.nodeCount ?? 3)
    setError(null)
  }

  function handleOpen() {
    if (isEditMode && editService) {
      prefillFromService(editService)
    } else {
      resetForm()
    }
    setOpen(true)
  }

  function handleCategoryChange(id: number) {
    const cat = categories.find((c) => c.id === id)
    setCategoryId(id)
    setCategoryName((cat?.name ?? 'compute') as ServiceCategory)
  }

  function handleSubmit() {
    if (typeof instanceTypeId !== 'number') return

    const payload: ServiceCreatePayload = {
      instance_type_id: instanceTypeId,
      utilization_rate: ['compute', 'database', 'containers'].includes(categoryName)
        ? utilization / 100
        : 1.0,
      reserved: riEnabled && ['compute', 'database', 'containers'].includes(categoryName),
      reserved_term:
        riEnabled && ['compute', 'database', 'containers'].includes(categoryName)
          ? riTerm === '1yr' ? '1y' : '3y'
          : null,
    }

    if (categoryName === 'storage') {
      payload.volume_gb = volumeGb
    } else if (categoryName === 'serverless') {
      payload.monthly_requests = monthlyRequests
      payload.avg_duration_ms = avgDurationMs
      payload.memory_mb = memoryMb
    } else if (categoryName === 'containers') {
      payload.node_count = nodeCount
    } else if (categoryName === 'database') {
      payload.deployment_option = deploymentOption
    }

    if (isEditMode && editService && onUpdate) {
      onUpdate(editService.id, payload)
    } else {
      onAdd(payload)
    }
    setOpen(false)
  }

  // ── Cost previews ──────────────────────────────────────────────────────────

  function getCostPreview(): { label: string; amount: number } | null {
    if (!pricing) return null
    const p = pricing.price_per_hour_ondemand

    if (pricingUnit === 'per_gb_month') {
      return { label: `${volumeGb} GB × $${p.toFixed(4)}/GB-mo`, amount: p * volumeGb }
    }
    if (pricingUnit === 'per_request') {
      const perMillion = p * 1_000_000
      return {
        label: `${(monthlyRequests / 1_000_000).toFixed(1)}M req × $${perMillion.toFixed(4)}/M req`,
        amount: p * monthlyRequests,
      }
    }
    if (pricingUnit === 'per_gb_second') {
      const durationS = avgDurationMs / 1000
      const memoryGb = memoryMb / 1024
      const cost = p * monthlyRequests * durationS * memoryGb
      return { label: `${monthlyRequests.toLocaleString()} req × ${avgDurationMs}ms × ${memoryMb}MB`, amount: cost }
    }
    if (pricingUnit === 'per_cluster_hour' || pricingUnit === 'per_vcpu_hour' || pricingUnit === 'per_gb_hour') {
      return { label: `${nodeCount} nodes × ${utilization}% × 730h`, amount: p * nodeCount * (utilization / 100) * HOURS }
    }
    // per_hour (compute / database)
    return { label: `${utilization}% × 730h`, amount: p * HOURS * (utilization / 100) }
  }

  function getRICostPreview(): number | null {
    if (!pricing || !riEnabled || pricingUnit !== 'per_hour') return null
    return getMonthlyRICost(
      riTerm === '1yr' ? pricing.price_per_hour_reserved_1y : pricing.price_per_hour_reserved_3y,
      pricing.price_per_hour_ondemand,
      utilization,
    )
  }

  const costPreview = getCostPreview()
  const riCostPreview = getRICostPreview()
  const riDiscount1y = pricing?.price_per_hour_reserved_1y != null && pricing.price_per_hour_ondemand > 0
    ? Math.round((1 - pricing.price_per_hour_reserved_1y / pricing.price_per_hour_ondemand) * 100)
    : null
  const riDiscount3y = pricing?.price_per_hour_reserved_3y != null && pricing.price_per_hour_ondemand > 0
    ? Math.round((1 - pricing.price_per_hour_reserved_3y / pricing.price_per_hour_ondemand) * 100)
    : null

  const canSubmit = typeof instanceTypeId === 'number'

  return (
    <>
      {externalOpen === undefined && (
        <Button onClick={handleOpen} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Service' : 'Add Service'}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? `Update the configuration for ${editService?.instanceName ?? 'this service'}.`
                : 'Configure a cloud resource for this application.'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          {(regionStatus === 'partial' || regionStatus === 'empty') && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {regionStatus === 'empty'
                  ? 'No pricing data available for this region. Instance list may be empty.'
                  : 'Limited pricing data available for this region. Some instance types may be missing.'}
              </p>
            </div>
          )}

          <div className="space-y-5">
            {/* Service type */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-service`}>Service Type</Label>
              <div className="relative">
                <select
                  id={`${formId}-service`}
                  value={categoryId}
                  onChange={(e) => handleCategoryChange(Number(e.target.value))}
                  disabled={loadingCats || isEditMode}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50"
                >
                  {loadingCats && <option>Loading…</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="capitalize">
                      {c.name.charAt(0).toUpperCase() + c.name.slice(1)}
                    </option>
                  ))}
                </select>
                {loadingCats && (
                  <Loader2 className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>

            {/* Instance */}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-instance`}>Instance / Resource</Label>
              <div className="relative">
                <select
                  id={`${formId}-instance`}
                  value={instanceTypeId}
                  onChange={(e) => setInstanceTypeId(e.target.value ? Number(e.target.value) : '')}
                  disabled={loadingInstances}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50"
                >
                  {loadingInstances ? (
                    <option>Loading…</option>
                  ) : instances.length === 0 ? (
                    <option value="" disabled>Aucune instance disponible pour cette région</option>
                  ) : (
                    <>
                      <option value="">Select a resource…</option>
                      {instances.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {i.vcpus || i.memory_gb ? ` — ${formatSpecs(i.vcpus, i.memory_gb, i.storage_info)}` : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {loadingInstances && (
                  <Loader2 className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
              {!loadingInstances && instances.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Aucune instance disponible pour cette région
                </p>
              )}
              {selectedInstance && !loadingPricing && pricing && (() => {
                const p = pricing.price_per_hour_ondemand
                if (pricingUnit === 'per_hour') {
                  return <p className="text-xs text-slate-500">${p.toFixed(4)}/hr · ~{formatCurrency(p * 730)}/mo</p>
                }
                if (pricingUnit === 'per_request') {
                  return <p className="text-xs text-slate-500">${(p * 1_000_000).toFixed(4)} per 1M requests</p>
                }
                if (pricingUnit === 'per_gb_second') {
                  return <p className="text-xs text-slate-500">${p.toFixed(8)}/GB-second</p>
                }
                if (pricingUnit === 'per_gb_month') {
                  return <p className="text-xs text-slate-500">${p.toFixed(4)}/GB-month</p>
                }
                return null
              })()}
              {selectedInstance && !pricing && !loadingPricing && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No pricing data for this instance in this region
                </p>
              )}
            </div>

            {/* ── Compute fields ─────────────────────────────────── */}
            {categoryName === 'compute' && (
              <>
                <UtilizationSlider formId={formId} utilization={utilization} onChange={setUtilization} />
                <RIPanel
                  formId={formId}
                  riEnabled={riEnabled}
                  setRiEnabled={setRiEnabled}
                  riTerm={riTerm}
                  setRiTerm={setRiTerm}
                  riDiscount1y={riDiscount1y}
                  riDiscount3y={riDiscount3y}
                />
              </>
            )}

            {/* ── Database fields ────────────────────────────────── */}
            {categoryName === 'database' && (
              <>
                <UtilizationSlider formId={formId} utilization={utilization} onChange={setUtilization} />

                <div className="space-y-2">
                  <Label>Deployment</Label>
                  <div className="flex gap-2">
                    {(['single-az', 'multi-az'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setDeploymentOption(opt)}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                          deploymentOption === opt
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400'
                        }`}
                      >
                        {opt === 'single-az' ? 'Single-AZ' : 'Multi-AZ'}
                      </button>
                    ))}
                  </div>
                </div>

                <RIPanel
                  formId={formId}
                  riEnabled={riEnabled}
                  setRiEnabled={setRiEnabled}
                  riTerm={riTerm}
                  setRiTerm={setRiTerm}
                  riDiscount1y={riDiscount1y}
                  riDiscount3y={riDiscount3y}
                />
              </>
            )}

            {/* ── Storage fields ─────────────────────────────────── */}
            {categoryName === 'storage' && (
              <NumericField
                id={`${formId}-vol`}
                label="Volume (GB)"
                value={volumeGb}
                onChange={setVolumeGb}
                min={1}
                step={10}
                suffix="GB"
              />
            )}

            {/* ── Serverless fields ──────────────────────────────── */}
            {categoryName === 'serverless' && (
              <div className="space-y-4">
                <NumericField
                  id={`${formId}-req`}
                  label="Requêtes par mois"
                  value={monthlyRequests}
                  onChange={setMonthlyRequests}
                  min={0}
                  step={100000}
                />
                {pricingUnit === 'per_gb_second' && (
                  <>
                    <NumericField
                      id={`${formId}-dur`}
                      label="Durée moyenne par requête"
                      value={avgDurationMs}
                      onChange={setAvgDurationMs}
                      min={1}
                      step={50}
                      suffix="ms"
                    />
                    <NumericField
                      id={`${formId}-mem`}
                      label="Mémoire allouée"
                      value={memoryMb}
                      onChange={setMemoryMb}
                      min={128}
                      step={128}
                      suffix="MB"
                    />
                  </>
                )}
              </div>
            )}

            {/* ── Containers fields ──────────────────────────────── */}
            {categoryName === 'containers' && (
              <>
                <NumericField
                  id={`${formId}-nodes`}
                  label="Nombre de nodes / clusters"
                  value={nodeCount}
                  onChange={setNodeCount}
                  min={1}
                  step={1}
                />
                {pricingUnit !== 'per_cluster_hour' && (
                  <UtilizationSlider formId={formId} utilization={utilization} onChange={setUtilization} />
                )}
                <RIPanel
                  formId={formId}
                  riEnabled={riEnabled}
                  setRiEnabled={setRiEnabled}
                  riTerm={riTerm}
                  setRiTerm={setRiTerm}
                  riDiscount1y={riDiscount1y}
                  riDiscount3y={riDiscount3y}
                />
              </>
            )}

            {/* ── Cost Preview ────────────────────────────────────── */}
            {costPreview !== null && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/40 dark:bg-slate-800/20">
                <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Monthly Cost Preview</p>
                <p className="text-xs text-slate-400 mb-2">{costPreview.label}</p>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-slate-500">{riEnabled && riCostPreview !== null ? 'On-Demand' : 'Estimated'}</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatCurrency(costPreview.amount)}</p>
                  </div>
                  {riCostPreview !== null && (
                    <>
                      <div className="text-slate-400 self-center">→</div>
                      <div>
                        <p className="text-xs text-slate-500">Reserved ({riTerm})</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(riCostPreview)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Monthly Saving</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency(costPreview.amount - riCostPreview)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || !pricing}>
              {isEditMode ? 'Save changes' : 'Add Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function UtilizationSlider({
  formId, utilization, onChange,
}: {
  formId: string; utilization: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Utilization Rate</Label>
        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{utilization}%</span>
      </div>
      <Slider min={0} max={100} step={5} value={[utilization]} onValueChange={([v]) => onChange(v)} />
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-600">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
  )
}

function RIPanel({
  formId, riEnabled, setRiEnabled, riTerm, setRiTerm, riDiscount1y, riDiscount3y,
}: {
  formId: string
  riEnabled: boolean
  setRiEnabled: (v: boolean) => void
  riTerm: RITerm
  setRiTerm: (v: RITerm) => void
  riDiscount1y: number | null
  riDiscount3y: number | null
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-slate-800 dark:text-slate-200">Reserved Instance</Label>
          <p className="text-xs text-slate-500 mt-0.5">Commit to a term for significant savings</p>
        </div>
        <Switch checked={riEnabled} onCheckedChange={setRiEnabled} />
      </div>
      {riEnabled && (
        <div className="flex gap-2 pt-1">
          {(['1yr', '3yr'] as RITerm[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRiTerm(t)}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                riTerm === t
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:border-slate-600'
              }`}
            >
              {t === '1yr' ? '1 Year' : '3 Years'}
              {t === '1yr' && riDiscount1y != null && (
                <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">(-{riDiscount1y}%)</span>
              )}
              {t === '3yr' && riDiscount3y != null && (
                <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">(-{riDiscount3y}%)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
