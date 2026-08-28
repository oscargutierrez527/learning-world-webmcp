import { useEffect, useRef } from 'react'
import {
  createDaxWebMcpTools,
  type DaxWebMcpSnapshot,
} from './webmcp'

export function useDaxWebMcp(snapshot: DaxWebMcpSnapshot) {
  const latestSnapshot = useRef(snapshot)

  useEffect(() => {
    latestSnapshot.current = snapshot
  }, [snapshot])

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) {
      return
    }

    const registrationController = new AbortController()
    const tools = createDaxWebMcpTools(() => latestSnapshot.current)

    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, {
          signal: registrationController.signal,
        }),
      ),
    ).catch(() => undefined)

    return () => registrationController.abort()
  }, [])
}
