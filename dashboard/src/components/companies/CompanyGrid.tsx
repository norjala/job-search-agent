import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useCompanies } from '@/lib/api'
import { CompanyCard } from './CompanyCard'
import { CompanyDetail } from './CompanyDetail'

export function CompanyGrid() {
  const { data, isLoading, error } = useCompanies()
  const [search, setSearch] = useState('')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const companies = data?.companies || []

  const filtered = search
    ? companies.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : companies

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading companies...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        Failed to load companies: {error.message}
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">No companies tracked yet.</p>
        <p className="text-muted-foreground/60 text-xs">
          Add roles to the pipeline and run the agent to generate company research.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} companies
        </p>
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((company) => (
          <CompanyCard
            key={company.slug}
            company={company}
            onClick={() => setSelectedSlug(company.slug)}
          />
        ))}
      </div>

      {selectedSlug && (
        <CompanyDetail
          slug={selectedSlug}
          onClose={() => setSelectedSlug(null)}
        />
      )}
    </div>
  )
}
