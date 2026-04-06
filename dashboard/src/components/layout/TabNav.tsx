import { Sun, Moon, Zap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRunAgent } from '@/lib/api'
import { toast } from 'sonner'

interface TabNavProps {
  darkMode: boolean
  onToggleDark: () => void
}

export function TabNav({ darkMode, onToggleDark }: TabNavProps) {
  const runAgent = useRunAgent()

  const handleRunAgent = () => {
    toast.info('Agent started...', { description: 'Running daily workflow' })
    runAgent.mutate(undefined, {
      onSuccess: () => {
        toast.success('Agent completed', { description: 'Daily workflow finished' })
      },
      onError: (err) => {
        toast.error('Agent failed', { description: err.message })
      },
    })
  }

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Job Search
          </h1>
          <TabsList className="bg-muted/60">
            <TabsTrigger value="digest" className="text-xs">
              Digest
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="text-xs">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="companies" className="text-xs">
              Companies
            </TabsTrigger>
            <TabsTrigger value="network" className="text-xs">
              Network
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
            <span className="text-xs">&#8984;</span>K
          </kbd>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRunAgent}
            disabled={runAgent.isPending}
            className="gap-1.5 text-xs"
          >
            {runAgent.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            Run Agent
          </Button>

          <Button variant="ghost" size="icon" onClick={onToggleDark} className="h-8 w-8">
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  )
}
