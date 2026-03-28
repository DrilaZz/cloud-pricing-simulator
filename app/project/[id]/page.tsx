'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, ChevronRight, Trash2, Server, CloudOff, Loader2, DollarSign, Calendar, Pencil, AlertTriangle } from 'lucide-react'
import AppComparison from '@/app/_components/AppComparison'
import { Card, CardContent } from '@/app/_components/ui/card'
import { Button } from '@/app/_components/ui/button'
import { Badge } from '@/app/_components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/app/_components/ui/dialog'
import { Label } from '@/app/_components/ui/label'
import {
  fetchProject, createApplication, deleteApplication, updateProject, updateApplication,
  getProviders, getRegions, mapApiApplication,
  type ApiProjectOut, type ApiApplicationOut, type ApiProvider, type ApiRegion,
} from '@/lib/api'
import type { Provider } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import { useSidebar } from '@/app/_components/SidebarProvider'

const PROVIDER_BADGE: Record<Provider, 'aws' | 'azure' | 'gcp'> = { aws: 'aws', azure: 'azure', gcp: 'gcp' }
const PROVIDER_LABEL: Record<Provider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' }
const PROVIDER_COLOR: Record<Provider, string> = {
  aws: '#FF9900',
  azure: '#0078D4',
  gcp: '#4285F4',
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { refreshKey, refreshSidebar } = useSidebar()
  const [project, setProject] = useState<ApiProjectOut | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Add app dialog ─────────────────────────────────────────────────────────
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([])
  const [apiRegions, setApiRegions] = useState<ApiRegion[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingRegions, setLoadingRegions] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [appName, setAppName] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState<number>(0)
  const [selectedRegionId, setSelectedRegionId] = useState<number>(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Edit project dialog ────────────────────────────────────────────────────
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProjName, setEditProjName] = useState('')
  const [editProjDesc, setEditProjDesc] = useState('')
  const [savingEditProject, setSavingEditProject] = useState(false)

  // ── Edit app dialog ────────────────────────────────────────────────────────
  const [editAppOpen, setEditAppOpen] = useState(false)
  const [editAppTarget, setEditAppTarget] = useState<ApiApplicationOut | null>(null)
  const [editAppName, setEditAppName] = useState('')
  const [editAppOriginalProvider, setEditAppOriginalProvider] = useState('')
  const [editAppOriginalRegionId, setEditAppOriginalRegionId] = useState(0)
  const [editAppProviders, setEditAppProviders] = useState<ApiProvider[]>([])
  const [editAppRegions, setEditAppRegions] = useState<ApiRegion[]>([])
  const [editAppProviderId, setEditAppProviderId] = useState<number>(0)
  const [editAppRegionId, setEditAppRegionId] = useState<number>(0)
  const [loadingEditRegions, setLoadingEditRegions] = useState(false)
  const [savingEditApp, setSavingEditApp] = useState(false)

  const refresh = useCallback(() => {
    fetchProject(id)
      .then(setProject)
      .catch((e) => console.error('[ProjectPage] fetch error', e))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { refresh() }, [refresh, refreshKey])

  useEffect(() => {
    if (!addOpen) return
    setLoadingProviders(true)
    getProviders()
      .then((providers) => {
        setApiProviders(providers)
        if (providers.length > 0 && selectedProviderId === 0) {
          setSelectedProviderId(providers[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProviders(false))
  }, [addOpen, selectedProviderId])

  useEffect(() => {
    if (!addOpen || selectedProviderId <= 0) return
    setLoadingRegions(true)
    setApiRegions([])
    setSelectedRegionId(0)
    getRegions(selectedProviderId)
      .then((regions) => {
        setApiRegions(regions)
        if (regions.length > 0) setSelectedRegionId(regions[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingRegions(false))
  }, [addOpen, selectedProviderId])

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
    const originalRegionId = editAppOriginalRegionId
    const originalProvider = editAppOriginalProvider
    getRegions(editAppProviderId)
      .then((regions) => {
        setEditAppRegions(regions)
        const currentProviderName = editAppProviders.find((p) => p.id === editAppProviderId)?.name
        if (currentProviderName === originalProvider && originalRegionId > 0) {
          const orig = regions.find((r) => r.id === originalRegionId)
          setEditAppRegionId(orig?.id ?? (regions[0]?.id ?? 0))
        } else if (regions.length > 0) {
          setEditAppRegionId(regions[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEditRegions(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAppOpen, editAppProviderId])

  const selectedProvider = apiProviders.find((p) => p.id === selectedProviderId)
  const selectedRegion = apiRegions.find((r) => r.id === selectedRegionId)

  async function handleAddApp() {
    if (!appName.trim() || !project || !selectedProvider || !selectedRegion) return
    setSaving(true)
    try {
      await createApplication(id, {
        name: appName.trim(),
        provider: selectedProvider.name,
        region_id: selectedRegion.id,
      })
      setAppName('')
      setAddOpen(false)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[ProjectPage] create app error', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteApp(appId: string) {
    try {
      await deleteApplication(appId)
      setDeleteId(null)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[ProjectPage] delete app error', e)
    }
  }

  function openEditProject() {
    if (!project) return
    setEditProjName(project.name)
    setEditProjDesc(project.description ?? '')
    setEditProjectOpen(true)
  }

  async function handleEditProject() {
    if (!project || !editProjName.trim()) return
    setSavingEditProject(true)
    try {
      await updateProject(id, {
        name: editProjName.trim(),
        description: editProjDesc.trim() || null,
      })
      setEditProjectOpen(false)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[ProjectPage] edit project error', e)
    } finally {
      setSavingEditProject(false)
    }
  }

  function openEditApp(apiApp: ApiApplicationOut) {
    setEditAppTarget(apiApp)
    setEditAppName(apiApp.name)
    setEditAppOriginalProvider(apiApp.provider)
    setEditAppOriginalRegionId(apiApp.region_id)
    setEditAppProviders([])
    setEditAppRegions([])
    setEditAppProviderId(0)
    setEditAppRegionId(0)
    setEditAppOpen(true)
  }

  async function handleEditApp() {
    if (!editAppTarget || !editAppName.trim() || editAppProviderId <= 0 || editAppRegionId <= 0) return
    const selectedEditProvider = editAppProviders.find((p) => p.id === editAppProviderId)
    if (!selectedEditProvider) return
    setSavingEditApp(true)
    try {
      await updateApplication(editAppTarget.id, {
        name: editAppName.trim(),
        provider: selectedEditProvider.name,
        region_id: editAppRegionId,
      })
      setEditAppOpen(false)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[ProjectPage] edit app error', e)
    } finally {
      setSavingEditApp(false)
    }
  }

  const editAppSelectedProviderName = editAppProviders.find((p) => p.id === editAppProviderId)?.name
  const editAppProviderChanged = editAppSelectedProviderName !== undefined && editAppSelectedProviderName !== editAppOriginalProvider
  const editAppRegionChanged = editAppRegionId !== 0 && editAppRegionId !== editAppOriginalRegionId
  const showEditAppWarning = editAppProviderChanged || editAppRegionChanged

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading project…
      </div>
    )
  }

  if (!project) {
    return <div className="px-6 lg:px-8 py-8 text-slate-500">Project not found.</div>
  }

  const mappedApps = project.applications.map(mapApiApplication)
  const totalAnnual = project.monthly_cost * 12

  return (
    <div className="px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <button
              onClick={openEditProject}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#534AB7] hover:bg-[#EEEDFE] transition-all"
              title="Edit project"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 mt-1">{project.description}</p>
          )}
          <p className="text-sm text-slate-400 mt-1">
            {project.applications.length} application{project.applications.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          Add Application
        </Button>
      </div>

      {/* Aggregate metric cards */}
      {project.monthly_cost > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-xl border border-[#BBDAF5] bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-[#378ADD]" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0C447C]">Monthly total</p>
            </div>
            <p className="text-2xl font-bold text-[#0C447C]">{formatCurrency(project.monthly_cost)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Annual total</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalAnnual)}</p>
          </div>
        </div>
      )}

      {/* Applications */}
      {project.applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 mb-4">
            <CloudOff className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">No applications yet</h3>
          <p className="text-sm text-slate-500 max-w-xs mb-5">
            Add an application to define a provider, region, and cloud services.
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Application
          </Button>
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {project.applications.map((apiApp) => {
            const provider = apiApp.provider as Provider
            const color = PROVIDER_COLOR[provider]
            return (
              <div
                key={apiApp.id}
                className="group relative flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-slate-300 hover:shadow-sm"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
                  <Server className="h-4 w-4 text-slate-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{apiApp.name}</span>
                    <Badge variant={PROVIDER_BADGE[provider]} className="text-[10px]">
                      {PROVIDER_LABEL[provider]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {apiApp.region.display_name} · {apiApp.services.length} service{apiApp.services.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Monthly</p>
                  <p className="text-base font-bold text-slate-900">
                    {apiApp.monthly_cost > 0 ? formatCurrency(apiApp.monthly_cost) : '—'}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditApp(apiApp)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-400 hover:text-[#534AB7] hover:bg-[#EEEDFE] transition-all"
                    title="Edit application"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(apiApp.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete application"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Link
                    href={`/project/${id}/app/${apiApp.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-[#534AB7]/30 hover:text-[#534AB7] hover:bg-[#EEEDFE]/50 transition-colors"
                  >
                    Open
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* App comparison */}
      <AppComparison apps={mappedApps} />

      {/* ── Edit project dialog ─────────────────────────────────────────────── */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-proj-name">Project Name *</Label>
              <input
                id="edit-proj-name"
                value={editProjName}
                onChange={(e) => setEditProjName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditProject()}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-proj-desc">Description (optional)</Label>
              <input
                id="edit-proj-desc"
                value={editProjDesc}
                onChange={(e) => setEditProjDesc(e.target.value)}
                placeholder="e.g. Main product stack on AWS"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleEditProject} disabled={!editProjName.trim() || savingEditProject}>
              {savingEditProject ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit app dialog ─────────────────────────────────────────────────── */}
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
              <Label htmlFor="edit-app-name">Application Name *</Label>
              <input
                id="edit-app-name"
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
                    const color = PROVIDER_COLOR[p.name as Provider]
                    const isSelected = editAppProviderId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setEditAppProviderId(p.id); setEditAppRegionId(0) }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-all ${
                          isSelected ? 'shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                        style={isSelected ? { borderColor: color, backgroundColor: `${color}15`, color } : {}}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {p.name.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-app-region">Region</Label>
              <div className="relative">
                <select
                  id="edit-app-region"
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

      {/* ── Add app dialog ──────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Application</DialogTitle>
            <DialogDescription>Define the provider and region for this application.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-name">Application Name *</Label>
              <input
                id="app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddApp()}
                placeholder="e.g. Backend API"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              {loadingProviders ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
                </div>
              ) : (
                <div className="flex gap-2">
                  {apiProviders.map((p) => {
                    const color = PROVIDER_COLOR[p.name as Provider]
                    const selected = selectedProviderId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProviderId(p.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-all ${
                          selected ? 'shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                        style={selected ? { borderColor: color, backgroundColor: `${color}15`, color } : {}}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {p.name.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-region">Region</Label>
              <div className="relative">
                <select
                  id="app-region"
                  value={selectedRegionId}
                  onChange={(e) => setSelectedRegionId(Number(e.target.value))}
                  disabled={loadingRegions || apiRegions.length === 0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 disabled:opacity-50"
                >
                  {loadingRegions && <option>Loading regions…</option>}
                  {apiRegions.map((r) => (
                    <option key={r.id} value={r.id}>{r.display_name} ({r.code})</option>
                  ))}
                </select>
                {loadingRegions && (
                  <Loader2 className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddApp} disabled={!appName.trim() || selectedProviderId <= 0 || selectedRegionId <= 0 || saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding…</> : 'Add Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Application</DialogTitle>
            <DialogDescription>
              This will delete the application and all its services. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDeleteApp(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
