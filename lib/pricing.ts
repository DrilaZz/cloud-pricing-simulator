// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'aws' | 'azure' | 'gcp'
export type ServiceCategory = 'compute' | 'database' | 'storage' | 'serverless' | 'containers'
export type RITerm = '1yr' | '3yr'

// ─── Constants ───────────────────────────────────────────────────────────────

export const HOURS_PER_MONTH = 730

export const PROVIDER_NAMES: Record<string, Provider> = {
  aws: 'aws',
  azure: 'azure',
  gcp: 'gcp',
}

// Maps region equivalents across providers (same geography)
export const CROSS_PROVIDER_REGIONS: Record<string, Record<Provider, string>> = {
  'us-east-1':       { aws: 'us-east-1',      azure: 'eastus',        gcp: 'us-central1' },
  'eastus':          { aws: 'us-east-1',      azure: 'eastus',        gcp: 'us-central1' },
  'us-central1':     { aws: 'us-east-1',      azure: 'eastus',        gcp: 'us-central1' },
  'eu-west-1':       { aws: 'eu-west-1',      azure: 'westeurope',    gcp: 'europe-west1' },
  'westeurope':      { aws: 'eu-west-1',      azure: 'westeurope',    gcp: 'europe-west1' },
  'europe-west1':    { aws: 'eu-west-1',      azure: 'westeurope',    gcp: 'europe-west1' },
  'ap-southeast-1':  { aws: 'ap-southeast-1', azure: 'southeastasia', gcp: 'asia-southeast1' },
  'southeastasia':   { aws: 'ap-southeast-1', azure: 'southeastasia', gcp: 'asia-southeast1' },
  'asia-southeast1': { aws: 'ap-southeast-1', azure: 'southeastasia', gcp: 'asia-southeast1' },
}

// ─── Price Calculation ───────────────────────────────────────────────────────

export function getMonthlyOnDemandCost(pricePerHour: number, utilization: number): number {
  return pricePerHour * HOURS_PER_MONTH * (utilization / 100)
}

export function getMonthlyRICost(
  pricePerHourRI: number | null,
  pricePerHourOnDemand: number,
  utilization: number,
): number {
  const hourly = pricePerHourRI ?? pricePerHourOnDemand
  return hourly * HOURS_PER_MONTH * (utilization / 100)
}

/** Compute monthly cost for a service, respecting pricing_unit semantics. */
export function getServiceMonthlyCost(service: {
  pricingUnit: string
  pricePerHourOndemand: number
  pricePerHourReserved1y: number | null
  pricePerHourReserved3y: number | null
  utilization: number
  riEnabled: boolean
  riTerm: RITerm
  monthlyRequests: number | null
  avgDurationMs: number | null
  memoryMb: number | null
  volumeGb: number | null
  nodeCount: number | null
}): number {
  const p = service.pricePerHourOndemand

  if (service.pricingUnit === 'per_gb_month') {
    return p * (service.volumeGb ?? 100)
  }

  if (service.pricingUnit === 'per_request') {
    return p * (service.monthlyRequests ?? 1_000_000)
  }

  if (service.pricingUnit === 'per_gb_second') {
    const reqs = service.monthlyRequests ?? 1_000_000
    const durS = (service.avgDurationMs ?? 200) / 1000
    const memGb = (service.memoryMb ?? 512) / 1024
    return p * reqs * durS * memGb
  }

  if (
    service.pricingUnit === 'per_cluster_hour' ||
    service.pricingUnit === 'per_vcpu_hour' ||
    service.pricingUnit === 'per_gb_hour'
  ) {
    return p * (service.nodeCount ?? 1) * (service.utilization / 100) * HOURS_PER_MONTH
  }

  // per_hour — compute / database
  if (service.riEnabled) {
    const riPrice =
      service.riTerm === '1yr' ? service.pricePerHourReserved1y : service.pricePerHourReserved3y
    return (riPrice ?? p) * HOURS_PER_MONTH * (service.utilization / 100)
  }
  return p * HOURS_PER_MONTH * (service.utilization / 100)
}

export function formatSpecs(vcpus: number | null, memoryGb: number | null, storageInfo: string | null): string {
  const parts: string[] = []
  if (vcpus != null) parts.push(`${vcpus} vCPU`)
  if (memoryGb != null) parts.push(`${memoryGb} GB RAM`)
  if (storageInfo) parts.push(storageInfo)
  return parts.join(' · ') || '—'
}
