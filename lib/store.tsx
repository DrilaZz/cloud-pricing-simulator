import type { Provider, RITerm, ServiceCategory } from '@/lib/pricing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Service {
  id: string
  /** Backend instance_type.id */
  instanceTypeId: number
  /** Cached display fields */
  instanceName: string
  instanceSpecs: string
  serviceCategoryName: ServiceCategory
  equivalentGroup: string | null
  /** Pricing unit (per_hour, per_request, per_gb_second, per_gb_month, etc.) */
  pricingUnit: string
  /** Raw price stored in DB (semantics depend on pricingUnit) */
  pricePerHourOndemand: number
  pricePerHourReserved1y: number | null
  pricePerHourReserved3y: number | null
  /** User config */
  utilization: number
  riEnabled: boolean
  riTerm: RITerm
  /** Serverless params */
  monthlyRequests: number | null
  avgDurationMs: number | null
  memoryMb: number | null
  /** Storage param */
  volumeGb: number | null
  /** Container param */
  nodeCount: number | null
  /** Database param */
  deploymentOption: string | null
}

export interface Application {
  id: string
  name: string
  provider: Provider
  providerId: number
  region: string
  regionId: number
  regionDisplayName: string
  services: Service[]
}

export interface Project {
  id: string
  name: string
  description: string
  applications: Application[]
  createdAt: number
}
