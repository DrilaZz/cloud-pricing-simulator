'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CloudOff, Loader2, DollarSign, Calendar, TrendingDown, Shield, Plus, BookmarkPlus, ChevronDown, FileText, Sheet, Pencil, AlertTriangle } from 'lucide-react'
import ServiceForm from '@/app/_components/ServiceForm'
import ServiceCard from '@/app/_components/ServiceCard'
import AppCostPieChart from '@/app/_components/AppCostPieChart'
import MultiCloudSimulation from '@/app/_components/MultiCloudSimulation'
import { Badge } from '@/app/_components/ui/badge'
import { Button } from '@/app/_components/ui/button'
import { Card, CardContent } from '@/app/_components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/app/_components/ui/dialog'
import { Label } from '@/app/_components/ui/label'
import {
  fetchProject, createService, updateService, deleteService, createTemplate, updateApplication,
  getProviders, getRegions, mapApiApplication, getDataStatus,
  type ApiProjectOut, type ServiceCreatePayload, type TemplateServiceSpec,
  type ApiProvider, type ApiRegion,
} from '@/lib/api'
import type { Provider } from '@/lib/pricing'
import type { Service } from '@/lib/store'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { computeServiceStats } from '@/app/_components/Summary'
import { useSidebar } from '@/app/_components/SidebarProvider'

const PROVIDER_COLOR: Record<Provider, string> = {
  aws: '#FF9900',
  azure: '#0078D4',
  gcp: '#4285F4',
}
const PROVIDER_LABEL: Record<Provider, string> = {
  aws: 'AWS', azure: 'Azure', gcp: 'GCP',
}

export default function AppDetailPage() {
  const { id, appId } = useParams<{ id: string; appId: string }>()
  const { refreshKey, refreshSidebar } = useSidebar()
  const [project, setProject] = useState<ApiProjectOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [addServiceOpen, setAddServiceOpen] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState<'pdf' | 'csv' | null>(null)

  // ── Edit app dialog ──────────────────────────────────────────────────────
  const [editAppOpen, setEditAppOpen] = useState(false)
  const [editAppName, setEditAppName] = useState('')
  const [editAppOriginalProvider, setEditAppOriginalProvider] = useState('')
  const [editAppOriginalRegionId, setEditAppOriginalRegionId] = useState(0)
  const [editAppProviders, setEditAppProviders] = useState<ApiProvider[]>([])
  const [editAppRegions, setEditAppRegions] = useState<ApiRegion[]>([])
  const [editAppProviderId, setEditAppProviderId] = useState<number>(0)
  const [editAppRegionId, setEditAppRegionId] = useState<number>(0)
  const [loadingEditRegions, setLoadingEditRegions] = useState(false)
  const [savingEditApp, setSavingEditApp] = useState(false)
  const [regionStatus, setRegionStatus] = useState<'complete' | 'partial' | 'empty' | undefined>(undefined)

  const refresh = useCallback(() => {
    fetchProject(id)
      .then(setProject)
      .catch((e) => console.error('[AppDetailPage] fetch error', e))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { refresh() }, [refresh, refreshKey])

  const appRegionId = project?.applications.find((a) => a.id === appId)?.region_id

  // Fetch data status to show region coverage warning in ServiceForm
  useEffect(() => {
    if (!appRegionId) return
    getDataStatus()
      .then((status) => {
        const match = status.regions.find((r) => r.region_id === appRegionId)
        setRegionStatus(match?.status)
      })
      .catch(() => {})
  }, [appRegionId])

  useEffect(() => {
    if (!editAppOpen || !editAppOriginalProvider) return
    getProviders()
      .then((providers) => {
        setEditAppProviders(providers)
        const matched = providers.find((p) => p.name === editAppOriginalProvider)
        if (matched) setEditAppProviderId(matched.id)
      })
      .catch(() => {})
  }, [editAppOpen, editAppOriginalProvider])

  useEffect(() => {
    if (!editAppOpen || editAppProviderId <= 0) return
    setLoadingEditRegions(true)
    setEditAppRegions([])
    const origRegId = editAppOriginalRegionId
    const origProv = editAppOriginalProvider
    getRegions(editAppProviderId)
      .then((regions) => {
        setEditAppRegions(regions)
        const curProvName = editAppProviders.find((p) => p.id === editAppProviderId)?.name
        if (curProvName === origProv && origRegId > 0) {
          const orig = regions.find((r) => r.id === origRegId)
          setEditAppRegionId(orig?.id ?? (regions[0]?.id ?? 0))
        } else if (regions.length > 0) {
          setEditAppRegionId(regions[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEditRegions(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAppOpen, editAppProviderId])

  const apiAppRef = project?.applications.find((a) => a.id === appId)

  function openEditApp() {
    if (!apiAppRef) return
    setEditAppName(apiAppRef.name)
    setEditAppOriginalProvider(apiAppRef.provider)
    setEditAppOriginalRegionId(apiAppRef.region_id)
    setEditAppProviders([])
    setEditAppRegions([])
    setEditAppProviderId(0)
    setEditAppRegionId(0)
    setEditAppOpen(true)
  }

  async function handleEditApp() {
    if (!editAppName.trim() || editAppProviderId <= 0 || editAppRegionId <= 0) return
    const selectedProvider = editAppProviders.find((p) => p.id === editAppProviderId)
    if (!selectedProvider) return
    setSavingEditApp(true)
    try {
      await updateApplication(appId, {
        name: editAppName.trim(),
        provider: selectedProvider.name,
        region_id: editAppRegionId,
      })
      setEditAppOpen(false)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[AppDetailPage] edit app error', e)
    } finally {
      setSavingEditApp(false)
    }
  }

  const editAppSelectedProviderName = editAppProviders.find((p) => p.id === editAppProviderId)?.name
  const showEditAppWarning =
    (editAppSelectedProviderName !== undefined && editAppSelectedProviderName !== editAppOriginalProvider) ||
    (editAppRegionId !== 0 && editAppRegionId !== editAppOriginalRegionId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading…
      </div>
    )
  }

  const apiApp = project?.applications.find((a) => a.id === appId)

  if (!project || !apiApp) {
    return <div className="px-6 lg:px-8 py-8 text-slate-500">Application not found.</div>
  }

  const app = mapApiApplication(apiApp)
  const stats = computeServiceStats(app.services)
  const provider = app.provider as Provider
  const color = PROVIDER_COLOR[provider]

  async function handleAddService(data: ServiceCreatePayload) {
    try {
      await createService(appId, data)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[AppDetailPage] create service error', e)
    }
  }

  async function handleRemoveService(serviceId: string) {
    try {
      await deleteService(serviceId)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[AppDetailPage] delete service error', e)
    }
  }

  async function handleUpdateService(serviceId: string, data: ServiceCreatePayload) {
    try {
      await updateService(serviceId, data)
      setEditingService(null)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[AppDetailPage] update service error', e)
    }
  }

  async function handleExport(format: 'pdf' | 'csv') {
    if (!apiApp) return
    setExportLoading(format)
    setExportOpen(false)
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/applications/${appId}/export-${format}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const projectName = project?.name ?? 'project'
      const fileName = `${projectName.replace(/\s+/g, '_')}_${apiApp.name.replace(/\s+/g, '_')}_estimate.${format}`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      console.error('[AppDetailPage] export error', e)
    } finally {
      setExportLoading(null)
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || !apiApp) return
    setSavingTemplate(true)
    try {
      const templateServices: TemplateServiceSpec[] = apiApp.services
        .filter((svc) => svc.instance_type.equivalent_group)
        .map((svc) => ({
          equivalent_group: svc.instance_type.equivalent_group!,
          label: svc.instance_type.name,
          utilization_rate: svc.utilization_rate,
          reserved: svc.reserved,
          reserved_term: svc.reserved_term,
          volume_gb: svc.volume_gb,
          monthly_requests: svc.monthly_requests,
          avg_duration_ms: svc.avg_duration_ms,
          memory_mb: svc.memory_mb,
          node_count: svc.node_count,
          deployment_option: svc.deployment_option,
        }))
      await createTemplate({
        name: templateName.trim(),
        description: templateDesc.trim() || null,
        services: templateServices,
      })
      setSaveTemplateOpen(false)
      setTemplateName('')
      setTemplateDesc('')
    } catch (e) {
      console.error('[AppDetailPage] save template error', e)
    } finally {
      setSavingTemplate(false)
    }
  }

  return (
    <div className="px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* App header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{app.name}</h1>
            <span
              className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${color}18`, color, borderColor: `${color}40` }}
            >
              {PROVIDER_LABEL[provider]}
            </span>
            <button
              onClick={openEditApp}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#534AB7] hover:bg-[#EEEDFE] transition-all"
              title="Edit application"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-slate-400">
            {app.regionDisplayName} · {app.services.length} service{app.services.length !== 1 ? 's' : ''}
          </p>
        </div>
        {app.services.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Export dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen((v) => !v)}
                disabled={!!exportLoading}
                className="gap-1.5"
              >
                {exportLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Export
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                    <button
                      onClick={() => handleExport('pdf')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-red-500" />
                      Export PDF
                    </button>
                    <button
                      onClick={() => handleExport('csv')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Sheet className="h-4 w-4 text-emerald-500" />
                      Export CSV
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Save as template */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setTemplateName(app.name); setTemplateDesc(''); setSaveTemplateOpen(true) }}
              className="gap-1.5"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save as template
            </Button>
          </div>
        )}
      </div>

      {/* 4 metric cards */}
      {app.services.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {/* Monthly */}
          <div className="rounded-xl border border-[#BBDAF5] bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-[#378ADD]" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0C447C]">Monthly cost</p>
            </div>
            <p className="text-xl font-bold text-[#0C447C]">
              {formatCurrency(stats.totalEffectiveMonthly)}
            </p>
            {stats.totalSavingsMonthly > 0 && (
              <p className="text-[11px] text-[#378ADD] mt-0.5">
                vs <span className="line-through">{formatCurrency(stats.totalOnDemandMonthly)}</span>
              </p>
            )}
          </div>

          {/* Annual */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Annual cost</p>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(stats.totalAnnual)}
            </p>
          </div>

          {/* RI Coverage */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-[#534AB7]" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">RI coverage</p>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatPercent(stats.riCoverageRate)}
            </p>
            <div className="mt-2 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${stats.riCoverageRate}%`, backgroundColor: '#534AB7' }}
              />
            </div>
          </div>

          {/* Savings */}
          <div className={`rounded-xl border p-4 ${
            stats.totalSavingsMonthly > 0
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#E1F5EE]'
              : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className={`h-4 w-4 ${stats.totalSavingsMonthly > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total savings</p>
            </div>
            <p className={`text-xl font-bold ${stats.totalSavingsMonthly > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
              {formatCurrency(stats.totalSavingsMonthly)}
            </p>
          </div>
        </div>
      )}

      {/* Services + chart */}
      {app.services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 mb-4">
            <CloudOff className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">No services yet</h3>
          <p className="text-sm text-slate-500 max-w-xs mb-5">
            Add services to start building this application&apos;s architecture.
          </p>
          <ServiceForm
            providerId={app.providerId}
            regionId={app.regionId}
            onAdd={handleAddService}
            regionStatus={regionStatus}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Services list */}
          <div className="space-y-2">
            {app.services.map((svc) => (
              <ServiceCard
                key={svc.id}
                service={svc}
                appProvider={app.provider}
                appRegionDisplay={app.regionDisplayName}
                onRemove={handleRemoveService}
                onEdit={setEditingService}
              />
            ))}

            {/* Dashed add service button */}
            <button
              onClick={() => setAddServiceOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-400 transition-colors hover:border-[#534AB7]/40 hover:text-[#534AB7]"
            >
              <Plus className="h-4 w-4" />
              Add service
            </button>
          </div>

          {/* Chart */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <Card>
              <CardContent className="pt-5">
                <AppCostPieChart services={app.services} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Multi-cloud comparison */}
      {app.services.length > 0 && (
        <div className="mt-6">
          <MultiCloudSimulation app={app} />
        </div>
      )}

      {/* ServiceForm — add mode */}
      {app.services.length > 0 && (
        <ServiceForm
          providerId={app.providerId}
          regionId={app.regionId}
          onAdd={handleAddService}
          externalOpen={addServiceOpen}
          onExternalClose={() => setAddServiceOpen(false)}
          regionStatus={regionStatus}
        />
      )}

      {/* ServiceForm — edit mode */}
      <ServiceForm
        providerId={app.providerId}
        regionId={app.regionId}
        onAdd={handleAddService}
        editService={editingService ?? undefined}
        onUpdate={handleUpdateService}
        externalOpen={editingService !== null}
        onExternalClose={() => setEditingService(null)}
        regionStatus={regionStatus}
      />

      {/* ── Edit app dialog ──────────────────────────────────────────────── */}
      <Dialog open={editAppOpen} onOpenChange={setEditAppOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Application</DialogTitle>
            <DialogDescription>Update the name, provider, or region of this application.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {showEditAppWarning && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Changing the provider or region may affect pricing for existing services. Services with no pricing available in the new region will be flagged.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-app-name-detail">Application Name *</Label>
              <input
                id="edit-app-name-detail"
                value={editAppName}
                onChange={(e) => setEditAppName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              {editAppProviders.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
                </div>
              ) : (
                <div className="flex gap-2">
                  {editAppProviders.map((p) => {
                    const pColor = PROVIDER_COLOR[p.name as Provider]
                    const isSelected = editAppProviderId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setEditAppProviderId(p.id); setEditAppRegionId(0) }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-all ${
                          isSelected ? 'shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                        style={isSelected ? { borderColor: pColor, backgroundColor: `${pColor}15`, color: pColor } : {}}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pColor }} />
                        {p.name.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-app-region-detail">Region</Label>
              <div className="relative">
                <select
                  id="edit-app-region-detail"
                  value={editAppRegionId}
                  onChange={(e) => setEditAppRegionId(Number(e.target.value))}
                  disabled={loadingEditRegions || editAppRegions.length === 0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 disabled:opacity-50"
                >
                  {loadingEditRegions && <option>Loading regions…</option>}
                  {editAppRegions.map((r) => (
                    <option key={r.id} value={r.id}>{r.display_name} ({r.code})</option>
                  ))}
                </select>
                {loadingEditRegions && (
                  <Loader2 className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAppOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditApp}
              disabled={!editAppName.trim() || editAppProviderId <= 0 || editAppRegionId <= 0 || savingEditApp}
            >
              {savingEditApp ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save this application&apos;s architecture as a reusable template.
              {apiApp && apiApp.services.filter((s) => !s.instance_type.equivalent_group).length > 0 && (
                <span className="block mt-1 text-amber-600">
                  {apiApp.services.filter((s) => !s.instance_type.equivalent_group).length} service(s) without an equivalent group will be skipped.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template Name *</Label>
              <input
                id="tpl-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. My Production Stack"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description (optional)</Label>
              <input
                id="tpl-desc"
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="Describe the architecture..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            {apiApp && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Services to include</p>
                {apiApp.services.map((svc) => (
                  <div key={svc.id} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${svc.instance_type.equivalent_group ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={`text-xs ${svc.instance_type.equivalent_group ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                      {svc.instance_type.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim() || savingTemplate || (apiApp?.services.filter((s) => s.instance_type.equivalent_group).length === 0)}
            >
              {savingTemplate ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
