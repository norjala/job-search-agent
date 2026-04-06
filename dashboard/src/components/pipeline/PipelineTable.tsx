import { useState, useMemo } from 'react'
import { ExternalLink, ArrowUpDown, Inbox } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusSelect, statusColor } from './StatusSelect'
import { usePipeline, type PipelineRow, type PipelineStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const RANK_COLORS: Record<number, string> = {
  1: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  4: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

const ALL_STATUSES: PipelineStatus[] = [
  'To Research', 'Networking', 'Ready to Apply', 'Applied',
  'Interviewing', 'Hold', 'Rejected', 'Closed',
]

type SortField = 'rank' | 'company' | 'lastTouched'
type SortDir = 'asc' | 'desc'

export function PipelineTable() {
  const { data, isLoading, error } = usePipeline()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterRank, setFilterRank] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows = data?.rows || []

  const filtered = useMemo(() => {
    let result = rows
    if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus)
    }
    if (filterRank !== 'all') {
      result = result.filter((r) => r.rank === parseInt(filterRank))
    }
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'rank') cmp = a.rank - b.rank
      else if (sortField === 'company') cmp = a.company.localeCompare(b.company)
      else if (sortField === 'lastTouched') cmp = a.lastTouched.localeCompare(b.lastTouched)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [rows, filterStatus, filterRank, sortField, sortDir])

  const stats = useMemo(() => {
    const byRank: Record<number, number> = {}
    const byStatus: Record<string, number> = {}
    for (const row of rows) {
      byRank[row.rank] = (byRank[row.rank] || 0) + 1
      byStatus[row.status] = (byStatus[row.status] || 0) + 1
    }
    return { byRank, byStatus, total: rows.length }
  }, [rows])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading pipeline...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        Failed to load pipeline: {error.message}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Inbox className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">No roles in the pipeline yet.</p>
        <p className="text-muted-foreground/60 text-xs">
          Add roles via the intake form or run the agent to discover new opportunities.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground font-medium">{stats.total} roles</span>
        <span className="text-border">|</span>
        {[1, 2, 3, 4].map((rank) => (
          <button
            key={rank}
            onClick={() => setFilterRank(filterRank === String(rank) ? 'all' : String(rank))}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs cursor-pointer transition-colors',
              filterRank === String(rank) ? RANK_COLORS[rank] : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', rank === 1 ? 'bg-emerald-400' : rank === 2 ? 'bg-blue-400' : rank === 3 ? 'bg-yellow-400' : 'bg-zinc-400')} />
            Rank {rank}: {stats.byRank[rank] || 0}
          </button>
        ))}
        <span className="text-border">|</span>
        {Object.entries(stats.byStatus).sort().map(([status, count]) => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs cursor-pointer transition-colors',
              filterStatus === status ? statusColor(status as PipelineStatus) : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {status}: {count}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterRank} onValueChange={setFilterRank}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="All ranks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All ranks</SelectItem>
            {[1, 2, 3, 4].map((r) => (
              <SelectItem key={r} value={String(r)} className="text-xs">Rank {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterStatus !== 'all' || filterRank !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterStatus('all'); setFilterRank('all') }}
            className="text-xs h-8 text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[60px]">
                <button onClick={() => toggleSort('rank')} className="flex items-center gap-1 cursor-pointer">
                  Rank <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('company')} className="flex items-center gap-1 cursor-pointer">
                  Company <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[120px]">Location</TableHead>
              <TableHead className="w-[145px]">Status</TableHead>
              <TableHead className="hidden xl:table-cell">Why</TableHead>
              <TableHead>Next Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row, i) => (
              <PipelineRow key={`${row.company}-${row.role}-${i}`} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground/50">
        Showing {filtered.length} of {rows.length} roles
      </p>
    </div>
  )
}

function PipelineRow({ row }: { row: PipelineRow }) {
  return (
    <TableRow>
      <TableCell>
        <Badge
          variant="outline"
          className={cn('text-[10px] font-mono tabular-nums', RANK_COLORS[row.rank])}
        >
          {row.rank}
        </Badge>
      </TableCell>
      <TableCell className="font-medium text-sm">{row.company}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{row.role}</span>
          {row.roleUrl && (
            <a
              href={row.roleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.location}</TableCell>
      <TableCell>
        <StatusSelect company={row.company} currentStatus={row.status} />
      </TableCell>
      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
        {row.whyItMatters}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
        {row.nextAction}
      </TableCell>
    </TableRow>
  )
}
