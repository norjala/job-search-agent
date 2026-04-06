import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_BASE = '/api'

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Types ───

export type PipelineStatus =
  | 'To Research' | 'Networking' | 'Ready to Apply' | 'Applied'
  | 'Interviewing' | 'Hold' | 'Rejected' | 'Closed'

export interface PipelineRow {
  rank: number
  company: string
  role: string
  roleUrl: string | null
  location: string
  status: PipelineStatus
  whyItMatters: string
  source: string
  dateFound: string
  lastTouched: string
  nextAction: string
  notes: string
}

export interface DigestData {
  html: string | null
  sections: { title: string; content: string }[]
  empty?: boolean
}

export interface CompanySummary {
  slug: string
  name: string
  hasResearch: boolean
  hasNetworking: boolean
  hasNotes: boolean
  hasPrep: boolean
  hasConversations: boolean
}

export interface CompanyDetail extends CompanySummary {
  researchHtml: string | null
  networkingHtml: string | null
  notesHtml: string | null
  prepHtml: string | null
}

export interface Connection {
  firstName: string
  lastName: string
  url: string
  company: string
  position: string
}

export interface NetworkData {
  networkHtml: string | null
  connections: Connection[]
}

export interface IntakeData {
  html: string | null
  sections: { title: string; content: string }[]
  empty?: boolean
}

// ─── React Query hooks ───

export function useDigest() {
  return useQuery<DigestData>({
    queryKey: ['digest'],
    queryFn: () => fetchJson('/digest'),
  })
}

export function usePipeline() {
  return useQuery<{ rows: PipelineRow[]; empty?: boolean }>({
    queryKey: ['pipeline'],
    queryFn: () => fetchJson('/pipeline'),
  })
}

export function useCompanies() {
  return useQuery<{ companies: CompanySummary[] }>({
    queryKey: ['companies'],
    queryFn: () => fetchJson('/companies'),
  })
}

export function useCompany(slug: string | null) {
  return useQuery<CompanyDetail>({
    queryKey: ['company', slug],
    queryFn: () => fetchJson(`/companies/${slug}`),
    enabled: !!slug,
  })
}

export function useNetwork() {
  return useQuery<NetworkData>({
    queryKey: ['network'],
    queryFn: () => fetchJson('/network'),
  })
}

export function useIntake() {
  return useQuery<IntakeData>({
    queryKey: ['intake'],
    queryFn: () => fetchJson('/intake'),
  })
}

export function useUpdateStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ company, status }: { company: string; status: string }) =>
      fetchJson(`/pipeline/${encodeURIComponent(company)}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })
}

export function useAddIntake() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { company: string; role: string; link: string; source: string; notes: string }) =>
      fetchJson('/intake', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake'] })
    },
  })
}

export function useRunAgent() {
  return useMutation({
    mutationFn: () =>
      fetchJson('/agent/run', { method: 'POST' }),
  })
}
