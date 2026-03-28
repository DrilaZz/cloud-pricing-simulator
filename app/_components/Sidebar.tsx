'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart2, Sun, Moon, Plus, Loader2, FolderOpen, Menu, X, LayoutTemplate, FileCode2, MoreVertical, Pencil, Trash2, AlertTriangle, LayoutDashboard, Database, CheckCircle2, XCircle } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { useSidebar } from './SidebarProvider'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog'
import { Label } from './ui/label'
import {
  fetchProjects, fetchProject, createProject, deleteProject, createApplication, deleteApplication,
  updateProject, updateApplication, createApplicationFromTemplate,
  getProviders, getRegions, listTemplates, getDataStatus,
  type ApiProjectListOut, type ApiProjectOut, type ApiProvider, type ApiRegion,
  type ApiTemplate, type TemplateServiceSpec, type DataStatus,
} from '@/lib/api'
import type { Provider } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'

const PROVIDER_COLOR: Record<Provider, string> = {
  aws: '#FF9900',
  azure: '#0078D4',
  gcp: '#4285F4',
}
const PROVIDER_LABEL: Record<Provider, string> = {
  aws: 'AWS',
  azure: 'Az',
  gcp: 'GCP',
}

// Category pill colours (matches the stacked chart colours)
const CATEGORY_COLOR: Record<string, string> = {
  Compute:    '#378ADD',
  Database:   '#1D9E75',
  Storage:    '#BA7517',
  Serverless: '#D4537E',
  Containers: '#7F77DD',
}

function groupLabel(equivalentGroup: string): string {
  if (equivalentGroup.startsWith('compute'))    return 'Compute'
  if (equivalentGroup.startsWith('db'))         return 'Database'
  if (equivalentGroup.startsWith('storage'))    return 'Storage'
  if (equivalentGroup.startsWith('serverless')) return 'Serverless'
  if (equivalentGroup.startsWith('containers')) return 'Containers'
  return 'Service'
}

function servicePills(services: TemplateServiceSpec[]): { label: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const svc of services) {
    const cat = groupLabel(svc.equivalent_group)
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  return Object.entries(counts).map(([label, count]) => ({ label, count }))
}

interface SidebarInnerProps {
  mobile?: boolean
  onClose?: () => void
}

function SidebarInner({ mobile, onClose }: SidebarInnerProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const { refreshKey, refreshSidebar } = useSidebar()

  const [projects, setProjects] = useState<ApiProjectListOut[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [currentProject, setCurrentProject] = useState<ApiProjectOut | null>(null)
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)

  // ── New project dialog ─────────────────────────────────────────────────────
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [savingProject, setSavingProject] = useState(false)

  // ── Context menus ──────────────────────────────────────────────────────────
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const [appMenuId, setAppMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  // ── Edit project dialog ────────────────────────────────────────────────────
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProjectTarget, setEditProjectTarget] = useState<ApiProjectListOut | null>(null)
  const [editProjName, setEditProjName] = useState('')
  const [editProjDesc, setEditProjDesc] = useState('')
  const [savingEditProject, setSavingEditProject] = useState(false)

  // ── Edit app dialog ────────────────────────────────────────────────────────
  const [editAppOpen, setEditAppOpen] = useState(false)
  const [editAppId, setEditAppId] = useState<string | null>(null)
  const [editAppName, setEditAppName] = useState('')
  const [editAppOriginalProvider, setEditAppOriginalProvider] = useState('')
  const [editAppOriginalRegionId, setEditAppOriginalRegionId] = useState(0)
  const [editAppProviders, setEditAppProviders] = useState<ApiProvider[]>([])
  const [editAppRegions, setEditAppRegions] = useState<ApiRegion[]>([])
  const [editAppProviderId, setEditAppProviderId] = useState<number>(0)
  const [editAppRegionId, setEditAppRegionId] = useState<number>(0)
  const [loadingEditRegions, setLoadingEditRegions] = useState(false)
  const [savingEditApp, setSavingEditApp] = useState(false)

  // ── Delete confirm dialogs ─────────────────────────────────────────────────
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [deleteAppId, setDeleteAppId] = useState<string | null>(null)

  // ── New application dialog ─────────────────────────────────────────────────
  const [addAppOpen, setAddAppOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'blank' | 'template'>('blank')
  const [appName, setAppName] = useState('')
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([])
  const [apiRegions, setApiRegions] = useState<ApiRegion[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number>(0)
  const [selectedRegionId, setSelectedRegionId] = useState<number>(0)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingRegions, setLoadingRegions] = useState(false)
  const [savingApp, setSavingApp] = useState(false)
  const [templates, setTemplates] = useState<ApiTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // ── URL parsing ────────────────────────────────────────────────────────────
  const projectMatch = pathname.match(/^\/project\/([^/]+)/)
  const appMatch = pathname.match(/^\/project\/[^/]+\/app\/([^/]+)/)
  const currentProjectId = projectMatch?.[1] ?? null
  const currentAppId = appMatch?.[1] ?? null

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadProjects = useCallback(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoadingProjects(false))
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects, refreshKey])

  useEffect(() => {
    getDataStatus().then(setDataStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!currentProjectId) { setCurrentProject(null); return }
    fetchProject(currentProjectId)
      .then(setCurrentProject)
      .catch(() => setCurrentProject(null))
  }, [currentProjectId, refreshKey])

  const loadTemplates = useCallback(() => {
    setLoadingTemplates(true)
    listTemplates()
      .then(setTemplates)
      .catch((err) => {
        console.error('[Sidebar] templates fetch error:', err)
        setTemplates([])
      })
      .finally(() => setLoadingTemplates(false))
  }, [])

  // Load providers when dialog opens
  useEffect(() => {
    if (!addAppOpen) return
    setLoadingProviders(true)
    getProviders()
      .then((providers) => {
        setApiProviders(providers)
        if (providers.length > 0) setSelectedProviderId(providers[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingProviders(false))
  }, [addAppOpen])

  // Load templates when the template tab is shown
  useEffect(() => {
    if (!addAppOpen || activeTab !== 'template') return
    loadTemplates()
  }, [addAppOpen, activeTab, loadTemplates])

  // Load regions when provider changes
  useEffect(() => {
    if (!addAppOpen || selectedProviderId <= 0) return
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
  }, [addAppOpen, selectedProviderId])

  // ── Edit app: load providers on dialog open ────────────────────────────────
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

  // ── Edit app: load regions on provider change ──────────────────────────────
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

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleCreateProject() {
    if (!projName.trim()) return
    setSavingProject(true)
    try {
      const created = await createProject(projName.trim(), projDesc.trim() || null)
      setProjName('')
      setProjDesc('')
      setAddProjectOpen(false)
      refreshSidebar()
      onClose?.()
      router.push(`/project/${created.id}`)
    } catch {
      // ignore
    } finally {
      setSavingProject(false)
    }
  }

  function openEditProject(proj: ApiProjectListOut) {
    setEditProjectTarget(proj)
    setEditProjName(proj.name)
    setEditProjDesc(proj.description ?? '')
    setProjectMenuId(null)
    setEditProjectOpen(true)
  }

  async function handleEditProject() {
    if (!editProjectTarget || !editProjName.trim()) return
    setSavingEditProject(true)
    try {
      await updateProject(editProjectTarget.id, {
        name: editProjName.trim(),
        description: editProjDesc.trim() || null,
      })
      setEditProjectOpen(false)
      refreshSidebar()
    } catch {
      // ignore
    } finally {
      setSavingEditProject(false)
    }
  }

  async function handleDeleteProject(projId: string) {
    try {
      await deleteProject(projId)
      setDeleteProjectId(null)
      refreshSidebar()
      if (currentProjectId === projId) router.push('/')
    } catch {
      // ignore
    }
  }

  function openEditApp(app: { id: string; name: string; provider: string; region_id: number }) {
    setEditAppId(app.id)
    setEditAppName(app.name)
    setEditAppOriginalProvider(app.provider)
    setEditAppOriginalRegionId(app.region_id)
    setEditAppProviders([])
    setEditAppRegions([])
    setEditAppProviderId(0)
    setEditAppRegionId(0)
    setAppMenuId(null)
    setEditAppOpen(true)
  }

  async function handleEditApp() {
    if (!editAppId || !editAppName.trim() || editAppProviderId <= 0 || editAppRegionId <= 0) return
    const selectedProvider = editAppProviders.find((p) => p.id === editAppProviderId)
    if (!selectedProvider) return
    setSavingEditApp(true)
    try {
      await updateApplication(editAppId, {
        name: editAppName.trim(),
        provider: selectedProvider.name,
        region_id: editAppRegionId,
      })
      setEditAppOpen(false)
      refreshSidebar()
      if (currentAppId === editAppId) {
        // Reload the current project data to reflect name change in the page header
      }
    } catch {
      // ignore
    } finally {
      setSavingEditApp(false)
    }
  }

  async function handleDeleteApp(appId: string) {
    try {
      await deleteApplication(appId)
      setDeleteAppId(null)
      refreshSidebar()
      if (currentAppId === appId && currentProjectId) router.push(`/project/${currentProjectId}`)
    } catch {
      // ignore
    }
  }

  const editAppSelectedProviderName = editAppProviders.find((p) => p.id === editAppProviderId)?.name
  const showEditAppWarning =
    (editAppSelectedProviderName !== undefined && editAppSelectedProviderName !== editAppOriginalProvider) ||
    (editAppRegionId !== 0 && editAppRegionId !== editAppOriginalRegionId)

  function openAddApp() {
    setAppName('')
    setActiveTab('blank')
    setSelectedTemplateId(null)
    setTemplates([])
    setApiProviders([])
    setApiRegions([])
    setSelectedProviderId(0)
    setSelectedRegionId(0)
    setAddAppOpen(true)
  }

  function selectTemplate(tpl: ApiTemplate) {
    setSelectedTemplateId(tpl.id)
    setAppName(tpl.name)
  }

  async function handleCreateApp() {
    if (!appName.trim() || !currentProjectId || selectedProviderId <= 0 || selectedRegionId <= 0) return
    const selectedProvider = apiProviders.find((p) => p.id === selectedProviderId)
    if (!selectedProvider) return
    setSavingApp(true)
    try {
      let created
      if (activeTab === 'template' && selectedTemplateId) {
        created = await createApplicationFromTemplate(currentProjectId, {
          name: appName.trim(),
          provider: selectedProvider.name,
          region_id: selectedRegionId,
          template_id: selectedTemplateId,
        })
      } else {
        created = await createApplication(currentProjectId, {
          name: appName.trim(),
          provider: selectedProvider.name,
          region_id: selectedRegionId,
        })
      }
      setAddAppOpen(false)
      refreshSidebar()
      onClose?.()
      router.push(`/project/${currentProjectId}/app/${created.id}`)
    } catch {
      // ignore
    } finally {
      setSavingApp(false)
    }
  }

  const canCreate =
    appName.trim().length > 0 &&
    selectedProviderId > 0 &&
    selectedRegionId > 0 &&
    (activeTab === 'blank' || !!selectedTemplateId) &&
    !savingApp

  const selectedRegionCode = apiRegions.find((r) => r.id === selectedRegionId)?.code
  const selectedProviderName = apiProviders.find((p) => p.id === selectedProviderId)?.name
  const addAppRegionStatus = dataStatus?.regions.find(
    (r) => r.region_code === selectedRegionCode && r.provider_name === selectedProviderName
  )?.status

  return (
    <div className="flex h-full flex-col bg-[#111827] border-r border-[#1F2937]">
      {/* Logo + actions */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-[#1F2937] flex-shrink-0">
        <Link href="/" onClick={onClose} className="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: '#534AB7' }}>
            <BarChart2 className="h-4 w-4 text-white" strokeWidth={2} />
          </div>
          <span className="text-sm font-bold text-white tracking-tight truncate">CloudSim</span>
        </Link>
        <div className="flex items-center gap-1">
          {mobile && (
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        {/* Dashboard link */}
        <div className="mb-1">
          <Link
            href="/"
            onClick={onClose}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
              pathname === '/'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 flex-shrink-0" />
            Dashboard
          </Link>
          <Link
            href="/data-status"
            onClick={onClose}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
              pathname === '/data-status'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Database className="h-3.5 w-3.5 flex-shrink-0" />
            Data Status
          </Link>
        </div>

        <div className="mb-1 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Projects</p>
        </div>

        {loadingProjects ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : projects.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-600">No projects yet</p>
        ) : (
          <div className="space-y-0.5">
            {projects.map((proj) => {
              const isSelected = proj.id === currentProjectId
              const projMenuOpen = projectMenuId === proj.id
              return (
                <div key={proj.id}>
                  {/* Project row */}
                  <div className={`group/proj relative flex items-center gap-1 rounded-lg transition-all ${
                    isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}>
                    <Link
                      href={`/project/${proj.id}`}
                      onClick={onClose}
                      className={`flex flex-1 items-center gap-2 px-2.5 py-2 min-w-0 ${
                        isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FolderOpen className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-[#8B83E6]' : 'text-slate-600 group-hover/proj:text-slate-400'}`} />
                      <span className="flex-1 min-w-0 text-xs font-medium truncate">{proj.name}</span>
                      <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>
                        {proj.application_count}
                      </span>
                      {proj.monthly_cost > 0 && (
                        <span className={`text-[10px] flex-shrink-0 font-medium ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {formatCurrency(proj.monthly_cost)}
                        </span>
                      )}
                    </Link>
                    {/* ⋮ button */}
                    <div className="relative flex-shrink-0 pr-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (projMenuOpen) {
                            setProjectMenuId(null)
                            setMenuPos(null)
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const MENU_HEIGHT = 72
                            const top = rect.bottom + window.innerHeight - rect.bottom < MENU_HEIGHT + 8
                              ? rect.top - MENU_HEIGHT - 4
                              : rect.bottom + 4
                            setMenuPos({ top, left: rect.left })
                            setAppMenuId(null)
                            setProjectMenuId(proj.id)
                          }
                        }}
                        className="opacity-0 group-hover/proj:opacity-100 flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Apps sub-list */}
                  {isSelected && currentProject && currentProject.applications.length > 0 && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[#1F2937] pl-2">
                      {currentProject.applications.map((app) => {
                        const provider = app.provider as Provider
                        const color = PROVIDER_COLOR[provider] ?? '#6366f1'
                        const label = PROVIDER_LABEL[provider] ?? app.provider
                        const isSelectedApp = app.id === currentAppId
                        const appMenuOpen = appMenuId === app.id
                        return (
                          <div
                            key={app.id}
                            className={`group/app relative flex items-center rounded-lg transition-all ${
                              isSelectedApp ? 'bg-white/10' : 'hover:bg-white/5'
                            }`}
                          >
                            <Link
                              href={`/project/${proj.id}/app/${app.id}`}
                              onClick={onClose}
                              className={`flex flex-1 items-center gap-2 px-2 py-1.5 min-w-0 ${
                                isSelectedApp ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              <span
                                className="text-[9px] font-bold flex-shrink-0 rounded px-1.5 py-0.5 leading-none"
                                style={{ backgroundColor: `${color}25`, color }}
                              >
                                {label}
                              </span>
                              <span className="flex-1 min-w-0 text-xs truncate">{app.name}</span>
                              {app.monthly_cost > 0 && (
                                <span className="text-[10px] text-slate-600 flex-shrink-0">{formatCurrency(app.monthly_cost)}</span>
                              )}
                            </Link>
                            {/* ⋮ button */}
                            <div className="relative flex-shrink-0 pr-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (appMenuOpen) {
                                    setAppMenuId(null)
                                    setMenuPos(null)
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const MENU_HEIGHT = 72
                                    const top = window.innerHeight - rect.bottom < MENU_HEIGHT + 8
                                      ? rect.top - MENU_HEIGHT - 4
                                      : rect.bottom + 4
                                    setMenuPos({ top, left: rect.left })
                                    setProjectMenuId(null)
                                    setAppMenuId(app.id)
                                  }
                                }}
                                className="opacity-0 group-hover/app:opacity-100 flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex-shrink-0 px-2 pb-3 space-y-1 border-t border-[#1F2937] pt-3">
        {currentProjectId && (
          <button
            onClick={openAddApp}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            New application
          </button>
        )}
        <button
          onClick={() => setAddProjectOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </button>

        {/* Pricing data indicator */}
        {(() => {
          const isoDate = dataStatus?.pricing_data_date ?? null
          const total = dataStatus?.total_prices ?? 0
          let dotColor: string
          let label: string
          if (total === 0 || !isoDate) {
            dotColor = 'bg-red-500'
            label = 'No pricing data'
          } else {
            const ageDays = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
            if (ageDays < 30) {
              dotColor = 'bg-emerald-500'
              label = 'Pricing data: up to date'
            } else if (ageDays < 90) {
              dotColor = 'bg-amber-400'
              label = `Pricing data: ${ageDays}d old`
            } else {
              dotColor = 'bg-red-500'
              label = `Pricing data: outdated (${ageDays}d)`
            }
          }
          return (
            <Link
              href="/data-status"
              onClick={onClose}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 transition-all hover:bg-white/5"
            >
              <div className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
              <span className="text-[10px] text-slate-600 truncate">{label}</span>
            </Link>
          )
        })()}
      </div>

      {/* ── Context menu portal (fixed, escapes overflow clipping) ───────── */}
      {(projectMenuId || appMenuId) && menuPos && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setProjectMenuId(null); setAppMenuId(null); setMenuPos(null) }}
          />
          {/* The dropdown itself */}
          <div
            className="fixed z-50 w-36 rounded-lg border border-[#1F2937] bg-[#0D1117] shadow-xl overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {projectMenuId && (() => {
              const proj = projects.find((p) => p.id === projectMenuId)
              if (!proj) return null
              return (
                <>
                  <button
                    onClick={() => { setMenuPos(null); openEditProject(proj) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => { setProjectMenuId(null); setMenuPos(null); setDeleteProjectId(proj.id) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </>
              )
            })()}
            {appMenuId && (() => {
              const app = currentProject?.applications.find((a) => a.id === appMenuId)
              if (!app) return null
              return (
                <>
                  <button
                    onClick={() => { setMenuPos(null); openEditApp({ id: app.id, name: app.name, provider: app.provider, region_id: app.region_id }) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => { setAppMenuId(null); setMenuPos(null); setDeleteAppId(app.id) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* ── Edit project dialog ────────────────────────────────────────────── */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sidebar-edit-proj-name">Project Name *</Label>
              <input
                id="sidebar-edit-proj-name"
                value={editProjName}
                onChange={(e) => setEditProjName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditProject()}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-edit-proj-desc">Description (optional)</Label>
              <input
                id="sidebar-edit-proj-desc"
                value={editProjDesc}
                onChange={(e) => setEditProjDesc(e.target.value)}
                placeholder="e.g. Main product stack on AWS"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
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
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Changing the provider or region may affect pricing for existing services. Services with no pricing available in the new region will be flagged.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="sidebar-edit-app-name">Application Name *</Label>
              <input
                id="sidebar-edit-app-name"
                value={editAppName}
                onChange={(e) => setEditAppName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
                        type="button"
                        onClick={() => { setEditAppProviderId(p.id); setEditAppRegionId(0) }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-all ${
                          isSelected ? 'shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400'
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
              <Label htmlFor="sidebar-edit-app-region">Region</Label>
              <div className="relative">
                <select
                  id="sidebar-edit-app-region"
                  value={editAppRegionId}
                  onChange={(e) => setEditAppRegionId(Number(e.target.value))}
                  disabled={loadingEditRegions || editAppRegions.length === 0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50 appearance-none"
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

      {/* ── Delete project confirm ───────────────────────────────────────────── */}
      <Dialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              This will permanently delete the project and all its applications. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteProjectId && handleDeleteProject(deleteProjectId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete app confirm ───────────────────────────────────────────────── */}
      <Dialog open={!!deleteAppId} onOpenChange={() => setDeleteAppId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Application</DialogTitle>
            <DialogDescription>
              This will delete the application and all its services. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAppId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAppId && handleDeleteApp(deleteAppId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New project dialog ─────────────────────────────────────────────── */}
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a project to group related cloud applications.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sidebar-proj-name">Project Name *</Label>
              <input
                id="sidebar-proj-name"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                placeholder="e.g. Production Infrastructure"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-proj-desc">Description (optional)</Label>
              <input
                id="sidebar-proj-desc"
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
                placeholder="e.g. Main product stack on AWS"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={!projName.trim() || savingProject}>
              {savingProject ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New application dialog ─────────────────────────────────────────── */}
      <Dialog open={addAppOpen} onOpenChange={setAddAppOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>New Application</DialogTitle>
            <DialogDescription>
              {currentProject
                ? `Add an application to "${currentProject.name}".`
                : 'Configure provider, region, and optionally start from a template.'}
            </DialogDescription>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex-shrink-0 flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => { setActiveTab('blank'); setSelectedTemplateId(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                activeTab === 'blank'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Start blank
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('template')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                activeTab === 'template'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              From template
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-0.5">

            {/* ── Template grid ──────────────────────────────────────────── */}
            {activeTab === 'template' && (
              <div>
                {loadingTemplates ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
                  </div>
                ) : templates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">No templates available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {templates.map((tpl) => {
                      const isSelected = selectedTemplateId === tpl.id
                      const pills = servicePills(tpl.services)
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => selectTemplate(tpl)}
                          className={`text-left rounded-xl border-2 px-3 py-3 transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/25 dark:border-indigo-400'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600'
                          }`}
                        >
                          {/* Name + badge */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className={`text-xs font-semibold leading-tight ${
                              isSelected ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-900 dark:text-slate-100'
                            }`}>
                              {tpl.name}
                            </span>
                            {tpl.is_default && (
                              <span className="flex-shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                Default
                              </span>
                            )}
                          </div>
                          {/* Description */}
                          {tpl.description && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 line-clamp-2 leading-relaxed">
                              {tpl.description}
                            </p>
                          )}
                          {/* Service pills */}
                          <div className="flex flex-wrap gap-1">
                            {pills.map(({ label, count }) => {
                              const c = CATEGORY_COLOR[label] ?? '#6366f1'
                              return (
                                <span
                                  key={label}
                                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                  style={{ backgroundColor: `${c}18`, color: c }}
                                >
                                  {count > 1 ? `${count}× ` : ''}{label}
                                </span>
                              )
                            })}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Config form (always shown) ─────────────────────────────── */}
            <div className="space-y-3 pb-1">
              <div className="space-y-1.5">
                <Label htmlFor="sidebar-app-name">Application Name *</Label>
                <input
                  id="sidebar-app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreateApp()}
                  placeholder="e.g. Backend API"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Provider</Label>
                {loadingProviders ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {apiProviders.map((p) => {
                      const color = PROVIDER_COLOR[p.name as Provider]
                      const isSelected = selectedProviderId === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProviderId(p.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold uppercase tracking-wide transition-all ${
                            isSelected
                              ? ''
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400'
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

              <div className="space-y-1.5">
                <Label htmlFor="sidebar-app-region">Region</Label>
                <div className="relative">
                  <select
                    id="sidebar-app-region"
                    value={selectedRegionId}
                    onChange={(e) => setSelectedRegionId(Number(e.target.value))}
                    disabled={loadingRegions || apiRegions.length === 0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50 appearance-none"
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
                {(addAppRegionStatus === 'partial' || addAppRegionStatus === 'empty') && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <p className="text-[11px] text-amber-600">
                      {addAppRegionStatus === 'empty'
                        ? 'No pricing data available for this region'
                        : 'Limited pricing data available for this region'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => setAddAppOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateApp} disabled={!canCreate}>
              {savingApp
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</>
                : activeTab === 'template' && !selectedTemplateId
                  ? 'Select a template first'
                  : 'Create Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col h-full">
        <SidebarInner />
      </aside>

      {/* Mobile burger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-md bg-[#111827] border border-[#1F2937] text-slate-300 hover:text-white shadow-lg"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 h-full">
            <SidebarInner mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
