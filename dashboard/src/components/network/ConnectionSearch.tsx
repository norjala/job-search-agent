import { useState, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Connection } from '@/lib/api'

interface ConnectionSearchProps {
  connections: Connection[]
}

export function ConnectionSearch({ connections }: ConnectionSearchProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return connections.slice(0, 100)
    const lower = search.toLowerCase()
    return connections.filter(
      (c) =>
        c.firstName.toLowerCase().includes(lower) ||
        c.lastName.toLowerCase().includes(lower) ||
        c.company.toLowerCase().includes(lower) ||
        c.position.toLowerCase().includes(lower)
    )
  }, [connections, search])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {connections.length} LinkedIn connections
        </p>
        <Input
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[300px] h-8 text-sm"
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Position</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                  {search ? `No connections matching "${search}"` : 'No connections loaded'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.slice(0, 100).map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm font-medium">
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.company}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {c.position}
                  </TableCell>
                  <TableCell>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 100 && (
        <p className="text-[11px] text-muted-foreground/50">
          Showing first 100 of {filtered.length} matches
        </p>
      )}
    </div>
  )
}
