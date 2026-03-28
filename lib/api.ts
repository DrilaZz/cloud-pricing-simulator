const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

import { formatSpecs, type Provider, type RITerm, type ServiceCategory } from '@/lib/pricing'
import type { Service, Application, Project } from '@/lib/store'

// ─── API Response Types (pricing) ───────────────────────────────────────────

export interface ApiProvider {
  id: number
  name: string
  display_name: string
}

export interface ApiRegion {
  id: number
  provider_id: number
  code: string
  display_name: string
}

export interface ApiServiceCategory {
  id: number
  name: string
}

export interface ApiInstanceType {
  id: number
  provider_id: number
  service_category_id: number
  name: string
  vcpus: number | null
  memory_gb: number | null
  storage_info: string | null
  equivalent_group: string | null
  pricing_unit: string | null
  storage_tier: string | null
}

export interface ApiPricing {
  id: number
  instance_type_id: number
  region_id: number
  price_per_hour_ondemand: number
  price_per_hour_reserved_1y: number | null
  price_per_hour_reserved_3y: number | null
  currency: string
  last_updated: string
}

export interface ApiPricingDetail {
  instance_type: ApiInstanceType
  region: ApiRegion
  provider: ApiProvider
  price_per_hour_ondemand: number
  price_per_hour_reserved_1y: number | null
  price_per_hour_reserved_3y: number | null
  currency: string
  last_updated: string
}

// ─── API Response Types (projects) ──────────────────────────────────────────

export interface ApiAppServiceOut {
  id: string
  application_id: string
  instance_type_id: number
  utilization_rate: number
  reserved: boolean
  reserved_term: string | null
  created_at: string
  // Category-specific params
  volume_gb: number | null
  monthly_requests: number | null
  avg_duration_ms: number | null
  memory_mb: number | null
  node_count: number | null
  deployment_option: string | null
  // Joined data
  instance_type: ApiInstanceType
  service_category_name: string | null
  price_per_hour_ondemand: number | null
  price_per_hour_reserved_1y: number | null
  price_per_hour_reserved_3y: number | null
}

export interface ApiApplicationOut {
  id: string
  project_id: string
  name: string
  provider: string
  region_id: number
  region: ApiRegion
  created_at: string
  updated_at: string
  services: ApiAppServiceOut[]
  monthly_cost: number
}

export interface ApiProjectOut {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  applications: ApiApplicationOut[]
  monthly_cost: number
}

export interface ApiProjectListOut {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  application_count: number
  monthly_cost: number
  providers: string[]
}

// ─── Data Status ─────────────────────────────────────────────────────────────

export interface RegionDataStatus {
  region_id: number
  provider_name: string
  region_code: string
  region_display_name: string
  total_instance_types: number
  last_updated: string | null
  status: 'complete' | 'partial' | 'empty'
  breakdown: Partial<Record<string, number>>
}

export interface ProviderStatusSummary {
  complete: number
  partial: number
  empty: number
}

export interface DataStatus {
  total_prices: number
  pricing_data_date: string | null
  data_source: string
  providers_status: Record<string, ProviderStatusSummary>
  regions: RegionDataStatus[]
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`
  console.log('[API]', url)

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new ApiError('Backend non connecté. Lancez le serveur sur localhost:8000')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = JSON.stringify(body.detail ?? body)
    } catch {}
    const msg = `API ${res.status}: ${detail || res.statusText}`
    console.error('[API ERROR]', url, msg)
    throw new ApiError(msg, res.status)
  }

  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`
  console.log('[API POST]', url)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Backend non connecté')
  }
  if (!res.ok) {
    let detail = ''
    try { const b = await res.json(); detail = JSON.stringify(b.detail ?? b) } catch {}
    throw new ApiError(`API ${res.status}: ${detail || res.statusText}`, res.status)
  }
  return res.json() as Promise<T>
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Backend non connecté')
  }
  if (!res.ok) {
    let detail = ''
    try { const b = await res.json(); detail = JSON.stringify(b.detail ?? b) } catch {}
    throw new ApiError(`API ${res.status}: ${detail || res.statusText}`, res.status)
  }
  return res.json() as Promise<T>
}

async function apiDelete(path: string): Promise<void> {
  const url = `${BASE_URL}${path}`
  console.log('[API DELETE]', url)
  let res: Response
  try {
    res = await fetch(url, { method: 'DELETE' })
  } catch {
    throw new ApiError('Backend non connecté')
  }
  if (!res.ok) {
    let detail = ''
    try { const b = await res.json(); detail = JSON.stringify(b.detail ?? b) } catch {}
    throw new ApiError(`API ${res.status}: ${detail || res.statusText}`, res.status)
  }
}

// ─── Pricing API ────────────────────────────────────────────────────────────

export function getProviders(): Promise<ApiProvider[]> {
  return apiFetch('/api/providers')
}

export function getRegions(providerId: number): Promise<ApiRegion[]> {
  return apiFetch(`/api/providers/${providerId}/regions`)
}

export function getInstanceTypes(
  providerId: number,
  serviceCategoryName?: string,
  regionId?: number,
): Promise<ApiInstanceType[]> {
  const params = new URLSearchParams()
  if (serviceCategoryName) params.set('service_category', serviceCategoryName)
  if (regionId != null) params.set('region_id', String(regionId))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/api/providers/${providerId}/instance-types${qs}`)
}

export function getServiceCategories(): Promise<ApiServiceCategory[]> {
  return apiFetch('/api/service-categories')
}

export function getPricing(
  instanceTypeId: number,
  regionId: number,
): Promise<ApiPricing[]> {
  return apiFetch(
    `/api/pricing?instance_type_id=${instanceTypeId}&region_id=${regionId}`,
  )
}

export function getMultiCloudComparison(
  equivalentGroup: string,
  regionCodes: string[],
): Promise<ApiPricingDetail[]> {
  return apiFetch(
    `/api/pricing/compare?equivalent_group=${encodeURIComponent(equivalentGroup)}&region_codes=${encodeURIComponent(regionCodes.join(','))}`,
  )
}

// ─── New app-level compare ────────────────────────────────────────────────────

export interface CompareServiceInput {
  service_id: string
  instance_type_id: number
  region_id: number
  utilization_rate: number
  reserved: boolean
  reserved_term: string | null
  pricing_unit: string | null
  volume_gb: number | null
  monthly_requests: number | null
  avg_duration_ms: number | null
  memory_mb: number | null
  node_count: number | null
}

export interface ServiceEquivalentOut {
  instance_name: string
  region_code: string
  region_display_name: string
  price_per_hour_ondemand: number
  price_per_hour_reserved_1y: number | null
  price_per_hour_reserved_3y: number | null
  monthly_cost_ondemand: number
  monthly_cost_effective: number
}

export interface ServiceComparisonOut {
  service_id: string
  original_instance: string
  original_monthly_cost: number
  equivalent_group: string | null
  equivalents: Record<string, ServiceEquivalentOut | null>
}

export interface ProviderTotalsOut {
  total_monthly_ondemand: number
  total_monthly_effective: number
  mapped_services: number
  total_services: number
  region_display_name: string
}

export interface CompareAppResponse {
  services: ServiceComparisonOut[]
  provider_totals: Record<string, ProviderTotalsOut>
}

export function compareApp(services: CompareServiceInput[]): Promise<CompareAppResponse> {
  return apiPost('/api/pricing/compare-app', { services })
}

export function checkHealth(): Promise<{ status: string }> {
  return apiFetch('/health')
}

export function getDataStatus(): Promise<DataStatus> {
  return apiFetch<DataStatus>('/api/data-status')
}

// ─── Projects API ───────────────────────────────────────────────────────────

export function fetchProjects(): Promise<ApiProjectListOut[]> {
  return apiFetch('/api/projects')
}

export function fetchProject(id: string): Promise<ApiProjectOut> {
  return apiFetch(`/api/projects/${id}`)
}

export function createProject(name: string, description: string | null): Promise<ApiProjectOut> {
  return apiPost('/api/projects', { name, description })
}

export function updateProject(
  id: string,
  data: { name: string; description?: string | null },
): Promise<ApiProjectOut> {
  return apiPut(`/api/projects/${id}`, data)
}

export function deleteProject(id: string): Promise<void> {
  return apiDelete(`/api/projects/${id}`)
}

export function createApplication(
  projectId: string,
  data: { name: string; provider: string; region_id: number },
): Promise<ApiApplicationOut> {
  return apiPost(`/api/projects/${projectId}/applications`, data)
}

export function updateApplication(
  appId: string,
  data: { name?: string; provider?: string; region_id?: number },
): Promise<ApiApplicationOut> {
  return apiPut(`/api/applications/${appId}`, data)
}

export function deleteApplication(appId: string): Promise<void> {
  return apiDelete(`/api/applications/${appId}`)
}

export interface ServiceCreatePayload {
  instance_type_id: number
  utilization_rate: number
  reserved: boolean
  reserved_term: string | null
  volume_gb?: number | null
  monthly_requests?: number | null
  avg_duration_ms?: number | null
  memory_mb?: number | null
  node_count?: number | null
  deployment_option?: string | null
}

export function createService(
  appId: string,
  data: ServiceCreatePayload,
): Promise<ApiAppServiceOut> {
  return apiPost(`/api/applications/${appId}/services`, data)
}

export function updateService(
  serviceId: string,
  data: Partial<ServiceCreatePayload>,
): Promise<ApiAppServiceOut> {
  return apiPut(`/api/services/${serviceId}`, data)
}

export function deleteService(serviceId: string): Promise<void> {
  return apiDelete(`/api/services/${serviceId}`)
}

// ─── Mapping (API → frontend types) ────────────────────────────────────────

// ─── Templates API ──────────────────────────────────────────────────────────

export interface TemplateServiceSpec {
  equivalent_group: string
  label: string
  utilization_rate: number
  reserved: boolean
  reserved_term: string | null
  volume_gb: number | null
  monthly_requests: number | null
  avg_duration_ms: number | null
  memory_mb: number | null
  node_count: number | null
  deployment_option: string | null
}

export interface ApiTemplate {
  id: string
  name: string
  description: string | null
  is_default: boolean
  services: TemplateServiceSpec[]
  created_at: string
  updated_at: string
}

export function listTemplates(): Promise<ApiTemplate[]> {
  return apiFetch('/api/templates')
}

export function createTemplate(data: { name: string; description?: string | null; services: TemplateServiceSpec[] }): Promise<ApiTemplate> {
  return apiPost('/api/templates', data)
}

export function deleteTemplate(id: string): Promise<void> {
  return apiDelete(`/api/templates/${id}`)
}

export function createApplicationFromTemplate(
  projectId: string,
  data: { name: string; provider: string; region_id: number; template_id: string },
): Promise<ApiApplicationOut> {
  return apiPost(`/api/projects/${projectId}/applications/from-template`, data)
}

// ─── Mapping (API → frontend types) ────────────────────────────────────────

export function mapApiService(svc: ApiAppServiceOut): Service {
  return {
    id: svc.id,
    instanceTypeId: svc.instance_type_id,
    instanceName: svc.instance_type.name,
    instanceSpecs: formatSpecs(svc.instance_type.vcpus, svc.instance_type.memory_gb, svc.instance_type.storage_info),
    serviceCategoryName: (svc.service_category_name ?? 'compute') as ServiceCategory,
    equivalentGroup: svc.instance_type.equivalent_group,
    pricingUnit: svc.instance_type.pricing_unit ?? 'per_hour',
    pricePerHourOndemand: svc.price_per_hour_ondemand ?? 0,
    pricePerHourReserved1y: svc.price_per_hour_reserved_1y,
    pricePerHourReserved3y: svc.price_per_hour_reserved_3y,
    utilization: Math.round(svc.utilization_rate * 100),
    riEnabled: svc.reserved,
    riTerm: (svc.reserved_term === '3y' ? '3yr' : '1yr') as RITerm,
    monthlyRequests: svc.monthly_requests,
    avgDurationMs: svc.avg_duration_ms,
    memoryMb: svc.memory_mb,
    volumeGb: svc.volume_gb,
    nodeCount: svc.node_count,
    deploymentOption: svc.deployment_option,
  }
}

export function mapApiApplication(app: ApiApplicationOut): Application {
  return {
    id: app.id,
    name: app.name,
    provider: app.provider as Provider,
    providerId: app.region.provider_id,
    region: app.region.code,
    regionId: app.region_id,
    regionDisplayName: app.region.display_name,
    services: app.services.map(mapApiService),
  }
}

export function mapApiProject(proj: ApiProjectOut): Project {
  return {
    id: proj.id,
    name: proj.name,
    description: proj.description ?? '',
    applications: proj.applications.map(mapApiApplication),
    createdAt: new Date(proj.created_at).getTime(),
  }
}

// ─── Dashboard API ───────────────────────────────────────────────────────────

export interface DashboardCostByProvider {
  provider_name: string
  total_monthly_cost: number
  percentage: number
}

export interface DashboardCostByCategory {
  category_name: string
  total_monthly_cost: number
  percentage: number
}

export interface DashboardTopApp {
  app_id: string
  app_name: string
  project_name: string
  provider: string
  monthly_cost: number
}

export interface DashboardProjectSummary {
  id: string
  name: string
  app_count: number
  monthly_cost: number
  savings: number
  ri_coverage: number
}

export interface DashboardOut {
  total_monthly_cost: number
  total_annual_cost: number
  total_savings: number
  global_ri_coverage: number
  project_count: number
  application_count: number
  service_count: number
  cost_by_provider: DashboardCostByProvider[]
  cost_by_service_category: DashboardCostByCategory[]
  top_5_applications: DashboardTopApp[]
  projects_summary: DashboardProjectSummary[]
}

export function getDashboard(): Promise<DashboardOut> {
  return apiFetch('/api/dashboard')
}
