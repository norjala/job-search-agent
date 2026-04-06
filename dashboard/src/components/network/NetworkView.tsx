import { Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useNetwork } from '@/lib/api'
import { ConnectionSearch } from './ConnectionSearch'

export function NetworkView() {
  const { data, isLoading, error } = useNetwork()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading network...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        Failed to load network: {error.message}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Users className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">No network data yet.</p>
        <p className="text-muted-foreground/60 text-xs">
          Export your LinkedIn connections CSV and add it to the job-search directory.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {data.networkHtml && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Network Map</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <ScrollArea className="max-h-[400px]">
              <div
                className="prose text-sm"
                dangerouslySetInnerHTML={{ __html: data.networkHtml }}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <ConnectionSearch connections={data.connections} />
    </div>
  )
}
