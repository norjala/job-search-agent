import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateStatus, type PipelineStatus } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: PipelineStatus[] = [
  'To Research',
  'Networking',
  'Ready to Apply',
  'Applied',
  'Interviewing',
  'Hold',
  'Rejected',
  'Closed',
]

const STATUS_COLORS: Record<PipelineStatus, string> = {
  'To Research': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  'Networking': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Ready to Apply': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Applied': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Interviewing': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Hold': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Rejected': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Closed': 'bg-zinc-600/20 text-zinc-500 border-zinc-600/30',
}

export function statusColor(status: PipelineStatus): string {
  return STATUS_COLORS[status] || STATUS_COLORS['To Research']
}

interface StatusSelectProps {
  company: string
  currentStatus: PipelineStatus
}

export function StatusSelect({ company, currentStatus }: StatusSelectProps) {
  const updateStatus = useUpdateStatus()

  const handleChange = (newStatus: string) => {
    if (newStatus === currentStatus) return
    updateStatus.mutate(
      { company, status: newStatus },
      {
        onSuccess: () => {
          toast.success(`${company} moved to ${newStatus}`)
        },
        onError: (err) => {
          toast.error(`Failed to update ${company}`, { description: err.message })
        },
      }
    )
  }

  return (
    <div className="relative">
      {updateStatus.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded-md">
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )}
      <Select value={currentStatus} onValueChange={handleChange}>
        <SelectTrigger
          className={cn(
            'h-7 w-[130px] text-xs border rounded-md font-medium',
            STATUS_COLORS[currentStatus]
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status} className="text-xs">
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
