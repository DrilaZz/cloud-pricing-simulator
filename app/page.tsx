'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, FolderOpen, Trash2, ChevronRight, LayoutGrid, Loader2,
  DollarSign, Server, TrendingDown, ShieldCheck, Layers, Activity,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from './_components/ui/card'
import { Button } from './_components/ui/button'
import { Badge } from './_components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './_components/ui/dialog'
import { Label } from './_components/ui/label'
import {
  fetchProjects, createProject, deleteProject, getDashboard,
  type ApiProjectListOut, type DashboardOut,
} from '@/lib/api'
import type { Provider } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import { useSidebar } from './_components/SidebarProvider'

const PROVIDER_BADGE: Record<Provider, 'aws' | 'azure' | 'gcp'> = {
  aws: 'aws', azure: 'azure', gcp: 'gcp',
}
const PROVIDER_LABEL: Record<Provider, string> = {
  aws: 'AWS', azure: 'Azure', gcp: 'GCP',
}

// Provider colors for charts
const PROVIDER_COLORS: Record<string, string> = {
  aws:   '#FF9900',
  azure: '#0078D4',
  gcp:   '#4285F4',
}

// Category colors for charts
const CATEGORY_COLORS: Record<string, string> = {
  compute:    '#378ADD',
  database:   '#1D9E75',
  storage:    '#BA7517',
  serverless: '#D4537E',
  containers: '#7F77DD',
}

const FALLBACK_COLORS = [
  '#534AB7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
]

interface DonutChartProps {
  data: { name: string; value: number; color: string }[]
  centerLabel: string
}

function DonutChart({ data, centerLabel }: DonutChartProps) {
  return (
    <div className="relative flex items-center justify-center" style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs text-slate-400 font-medium">Total</span>
        <span className="text-sm font-bold text-slate-900">{centerLabel}</span>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { refreshKey, refreshSidebar } = useSidebar()
  const [projects, setProjects] = useState<ApiProjectListOut[]>([])
  const [dashboard, setDashboard] = useState<DashboardOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([fetchProjects(), getDashboard()])
      .then(([projs, dash]) => {
        setProjects(projs)
        setDashboard(dash)
      })
      .catch((e) => console.error('[HomePage] fetch error', e))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh, refreshKey])

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createProject(name.trim(), description.trim() || null)
      setName('')
      setDescription('')
      setAddOpen(false)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[HomePage] create error', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id)
      setDeleteId(null)
      refresh()
      refreshSidebar()
    } catch (e) {
      console.error('[HomePage] delete error', e)
    }
  }

  const hasDashboard = dashboard && dashboard.service_count > 0

  return (
    <div className="px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of all your cloud costs</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#EEEDFE] border border-[#C0BCEF] mb-4">
            <LayoutGrid className="h-8 w-8 text-[#534AB7]" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">No projects yet</h3>
          <p className="text-sm text-slate-500 max-w-xs mb-6">
            Create a project to start building and comparing cloud architectures.
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create your first project
          </Button>
        </div>
      )}

      {/* Dashboard content */}
      {!loading && projects.length > 0 && dashboard && (
        <div className="space-y-6">

          {/* ── 4 big metric cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Monthly total */}
            <div className="rounded-xl border border-[#BBDAF5] bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60">
                  <DollarSign className="h-3.5 w-3.5 text-[#378ADD]" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0C447C]">Monthly Cost</p>
              </div>
              <p className="text-2xl font-bold text-[#0C447C]">
                {hasDashboard ? formatCurrency(dashboard.total_monthly_cost) : '—'}
              </p>
              <p className="text-[11px] text-[#378ADD] mt-1">effective (with RIs)</p>
            </div>

            {/* Annual total */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
                  <Activity className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Annual Cost</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {hasDashboard ? formatCurrency(dashboard.total_annual_cost) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">projected 12-month spend</p>
            </div>

            {/* Total savings */}
            <div className={`rounded-xl border p-4 ${
              hasDashboard && dashboard.total_savings > 0
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#E1F5EE]'
                : 'border-slate-200 bg-white'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${hasDashboard && dashboard.total_savings > 0 ? 'bg-white/60' : 'bg-slate-50'}`}>
                  <TrendingDown className={`h-3.5 w-3.5 ${hasDashboard && dashboard.total_savings > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">RI Savings</p>
              </div>
              <p className={`text-2xl font-bold ${hasDashboard && dashboard.total_savings > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                {hasDashboard && dashboard.total_savings > 0
                  ? formatCurrency(dashboard.total_savings)
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">vs on-demand pricing</p>
            </div>

            {/* RI Coverage */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEEDFE]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#534AB7]" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">RI Coverage</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {hasDashboard ? `${dashboard.global_ri_coverage}%` : '—'}
              </p>
              {hasDashboard && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(dashboard.global_ri_coverage, 100)}%`, backgroundColor: '#534AB7' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── 3 count cards ── */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEEDFE]">
                  <FolderOpen className="h-4 w-4 text-[#534AB7]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{dashboard.project_count}</p>
                  <p className="text-[11px] text-slate-400">Projects</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#E6F1FB]">
                  <Layers className="h-4 w-4 text-[#378ADD]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{dashboard.application_count}</p>
                  <p className="text-[11px] text-slate-400">Applications</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#E1F5EE]">
                  <Server className="h-4 w-4 text-[#1D9E75]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{dashboard.service_count}</p>
                  <p className="text-[11px] text-slate-400">Services</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Charts row ── */}
          {hasDashboard && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cost by provider */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700">Cost by Provider</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <DonutChart
                    data={dashboard.cost_by_provider.map((d, i) => ({
                      name: d.provider_name.toUpperCase(),
                      value: d.total_monthly_cost,
                      color: PROVIDER_COLORS[d.provider_name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                    }))}
                    centerLabel={formatCurrency(dashboard.total_monthly_cost)}
                  />
                  <div className="mt-3 space-y-2">
                    {dashboard.cost_by_provider.map((d, i) => {
                      const color = PROVIDER_COLORS[d.provider_name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
                      return (
                        <div key={d.provider_name} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-slate-600 uppercase font-medium w-12">{d.provider_name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-1.5 rounded-full" style={{ width: `${d.percentage}%`, background: color }} />
                          </div>
                          <span className="text-slate-400 w-10 text-right">{d.percentage}%</span>
                          <span className="font-semibold text-slate-700 w-20 text-right">{formatCurrency(d.total_monthly_cost)}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Cost by service category */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700">Cost by Service Category</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <DonutChart
                    data={dashboard.cost_by_service_category.map((d, i) => ({
                      name: d.category_name,
                      value: d.total_monthly_cost,
                      color: CATEGORY_COLORS[d.category_name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                    }))}
                    centerLabel={formatCurrency(dashboard.total_monthly_cost)}
                  />
                  <div className="mt-3 space-y-2">
                    {dashboard.cost_by_service_category.map((d, i) => {
                      const color = CATEGORY_COLORS[d.category_name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
                      return (
                        <div key={d.category_name} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-slate-600 capitalize font-medium w-20 truncate">{d.category_name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-1.5 rounded-full" style={{ width: `${d.percentage}%`, background: color }} />
                          </div>
                          <span className="text-slate-400 w-10 text-right">{d.percentage}%</span>
                          <span className="font-semibold text-slate-700 w-20 text-right">{formatCurrency(d.total_monthly_cost)}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Top 5 Applications ── */}
          {hasDashboard && dashboard.top_5_applications.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-700">Top 5 Most Expensive Applications</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-3">
                  {dashboard.top_5_applications.map((app, i) => {
                    const maxCost = dashboard.top_5_applications[0].monthly_cost
                    const pct = maxCost > 0 ? (app.monthly_cost / maxCost) * 100 : 0
                    const provColor = PROVIDER_COLORS[app.provider] ?? '#6366f1'
                    return (
                      <div key={app.app_id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-4 text-right">{i + 1}</span>
                        <Badge variant={(PROVIDER_BADGE[app.provider as Provider] ?? 'default') as 'aws' | 'azure' | 'gcp'} className="text-[10px] w-12 justify-center flex-shrink-0">
                          {(PROVIDER_LABEL[app.provider as Provider] ?? app.provider).toUpperCase()}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 mb-1.5">
                            <span className="text-xs font-medium text-slate-800 truncate">{app.app_name}</span>
                            <span className="text-[10px] text-slate-400 truncate">· {app.project_name}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: provColor }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-20 text-right flex-shrink-0">
                          {formatCurrency(app.monthly_cost)}<span className="font-normal text-slate-400">/mo</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Projects summary ── */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Projects</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const providers = project.providers as Provider[]
                const summaryEntry = dashboard.projects_summary.find((s) => s.id === project.id)
                return (
                  <Card key={project.id} className="group relative hover:border-slate-300 hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEEDFE] border border-[#C0BCEF]">
                            <FolderOpen className="h-4 w-4 text-[#534AB7]" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                            {project.description && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{project.description}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.preventDefault(); setDeleteId(project.id) }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Monthly Cost</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">
                            {project.monthly_cost > 0 ? formatCurrency(project.monthly_cost) : '—'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Applications</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">
                            {project.application_count}
                          </p>
                        </div>
                      </div>

                      {summaryEntry && summaryEntry.savings > 0 && (
                        <div className="mb-3">
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <TrendingDown className="h-3 w-3" />
                            {formatCurrency(summaryEntry.savings)}/mo saved with RIs
                          </span>
                        </div>
                      )}

                      {providers.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-4">
                          {providers.map((p) => (
                            <Badge key={p} variant={PROVIDER_BADGE[p]} className="text-[10px]">
                              {PROVIDER_LABEL[p]}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <Link
                        href={`/project/${project.id}`}
                        className="flex items-center justify-between w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 hover:border-[#534AB7]/30 hover:text-[#534AB7] hover:bg-[#EEEDFE]/50 transition-colors"
                      >
                        <span>Open project</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add project dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a project to group related cloud applications.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project Name *</Label>
              <input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="e.g. Production Infrastructure"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description (optional)</Label>
              <input
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Main product stack on AWS"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#534AB7]/40 focus:border-[#534AB7]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!name.trim() || saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              This will permanently delete the project and all its applications. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
