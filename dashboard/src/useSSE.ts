import { useEffect, useRef, useState } from 'react'

export interface SSEEvent {
  type: string
  summary: string
  agentId?: string
  chatId?: string
  metadata?: Record<string, unknown>
  timestamp: number
}

export function useSSE(url: string, maxEvents = 100) {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data)
        setEvents(prev => [event, ...prev].slice(0, maxEvents))
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      esRef.current = null
    }
  }, [url, maxEvents])

  return { events, connected }
}
