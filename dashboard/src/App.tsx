import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { TabNav } from '@/components/layout/TabNav'
import { DigestView } from '@/components/digest/DigestView'
import { PipelineTable } from '@/components/pipeline/PipelineTable'
import { CompanyGrid } from '@/components/companies/CompanyGrid'
import { NetworkView } from '@/components/network/NetworkView'
import { CommandPalette } from '@/components/CommandPalette'
import { useWebSocket } from '@/hooks/useWebSocket'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

function DashboardInner() {
  const [activeTab, setActiveTab] = useState('pipeline')
  const [darkMode, setDarkMode] = useState(true)

  useWebSocket()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Initialize dark mode on mount
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabNav
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <main className="px-6 py-6">
          <TabsContent value="digest">
            <DigestView />
          </TabsContent>
          <TabsContent value="pipeline">
            <PipelineTable />
          </TabsContent>
          <TabsContent value="companies">
            <CompanyGrid />
          </TabsContent>
          <TabsContent value="network">
            <NetworkView />
          </TabsContent>
        </main>
      </Tabs>

      <CommandPalette onNavigate={setActiveTab} />
      <Toaster
        position="bottom-right"
        theme={darkMode ? 'dark' : 'light'}
        richColors
      />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardInner />
    </QueryClientProvider>
  )
}
