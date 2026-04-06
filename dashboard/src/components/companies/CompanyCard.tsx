import { FileText, Users, StickyNote, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompanySummary } from '@/lib/api'
import { cn } from '@/lib/utils'

interface CompanyCardProps {
  company: CompanySummary
  onClick: () => void
}

export function CompanyCard({ company, onClick }: CompanyCardProps) {
  const indicators = [
    { label: 'Research', has: company.hasResearch, icon: FileText },
    { label: 'Networking', has: company.hasNetworking, icon: Users },
    { label: 'Notes', has: company.hasNotes, icon: StickyNote },
    { label: 'Prep', has: company.hasPrep, icon: BookOpen },
  ]

  const completedCount = indicators.filter((i) => i.has).length

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-foreground/20 hover:shadow-md',
        'group'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium group-hover:text-foreground transition-colors">
          {company.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-3 mt-1">
          {indicators.map(({ label, has, icon: Icon }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-1 text-[10px]',
                has ? 'text-foreground/70' : 'text-muted-foreground/30'
              )}
              title={label}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full',
                i < completedCount ? 'bg-emerald-500/60' : 'bg-muted'
              )}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
