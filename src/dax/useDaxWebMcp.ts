import { useEffect, useRef } from 'react'
import {
  createDaxWebMcpTools,
  type DaxWebMcpSnapshot,
} from './webmcp'
import type { DaxAgentSupport } from './types'

export function useDaxWebMcp(
  snapshot: DaxWebMcpSnapshot,
  showSupport: (support: DaxAgentSupport) => void,
) {
  const latestSnapshot = useRef(snapshot)
  const latestShowSupport = useRef(showSupport)

  useEffect(() => {
    latestSnapshot.current = snapshot
  }, [snapshot])

  useEffect(() => {
    latestShowSupport.current = showSupport
  }, [showSupport])

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) {
      return
    }

    const registrationController = new AbortController()
    const tools = createDaxWebMcpTools(
      () => latestSnapshot.current,
      (support) => latestShowSupport.current(support),
    )

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
