import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[ws] Connected')
          if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current)
            reconnectTimer.current = null
          }
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'file-changed') {
              const path: string = data.path || ''

              // Invalidate relevant queries based on which file changed
              if (path.includes('pipeline.md')) {
                queryClient.invalidateQueries({ queryKey: ['pipeline'] })
              } else if (path.includes('_daily-digest.md')) {
                queryClient.invalidateQueries({ queryKey: ['digest'] })
              } else if (path.includes('_intake.md')) {
                queryClient.invalidateQueries({ queryKey: ['intake'] })
              } else if (path.includes('my-network.md') || path.includes('linkedin-connections.csv')) {
                queryClient.invalidateQueries({ queryKey: ['network'] })
              } else if (path.includes('/companies/')) {
                queryClient.invalidateQueries({ queryKey: ['companies'] })
                // Also invalidate specific company if we can extract slug
                const match = path.match(/companies\/([^/]+)/)
                if (match) {
                  queryClient.invalidateQueries({ queryKey: ['company', match[1]] })
                }
              } else {
                // Unknown file — invalidate everything
                queryClient.invalidateQueries()
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        ws.onclose = () => {
          console.log('[ws] Disconnected, reconnecting in 3s...')
          wsRef.current = null
          reconnectTimer.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [queryClient])
}
