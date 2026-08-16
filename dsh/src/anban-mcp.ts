import type { Context, Fiber } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'

import { safeError } from './safe-error.js'

const API_KEY_REF = credentialRef('ANBAN_API_KEY')
const MCP_URL = 'https://creator.anbanai.com/mcp'
const SERVER_NAME = 'creator'
const TOOL_CALL_TIMEOUT_MS = 900_000

export const name = 'anban-mcp'
export const inject = ['credentials']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  let acceptingUpdates = true
  let activeChild: (Fiber & PromiseLike<Fiber>) | undefined
  let activeSecret: string | undefined
  let missingWarningIssued = false
  let queue: Promise<void> = Promise.resolve()

  async function disposeActiveChild(): Promise<void> {
    const child = activeChild
    const secret = activeSecret
    activeChild = undefined
    activeSecret = undefined

    if (child === undefined) {
      return
    }

    try {
      await child.dispose()
    } catch (error) {
      throw safeError(error, secret)
    }
  }

  async function reconcile(): Promise<void> {
    await disposeActiveChild()

    let resolved
    try {
      resolved = await ctx.credentials.resolve(API_KEY_REF)
    } catch (error) {
      throw safeError(error)
    }

    if (resolved === undefined) {
      if (!missingWarningIssued) {
        ctx.logger.warn(
          'anban-mcp: ANBAN_API_KEY is not configured; creator MCP tools are unavailable',
        )
        missingWarningIssued = true
      }
      return
    }

    let child: (Fiber & PromiseLike<Fiber>) | undefined
    try {
      child = ctx.plugin(mcpClient, {
        transport: 'streamable-http',
        serverName: SERVER_NAME,
        url: MCP_URL,
        headers: { Authorization: `Bearer ${resolved.value}` },
        toolCallTimeoutMs: TOOL_CALL_TIMEOUT_MS,
        failOnStartupError: false,
      })
      await child
    } catch (error) {
      if (child !== undefined) {
        try {
          await child.dispose()
        } catch {
          // Preserve the startup failure while containing cleanup diagnostics.
        }
      }
      throw safeError(error, resolved.value)
    }

    activeChild = child
    activeSecret = resolved.value
    missingWarningIssued = false
  }

  function enqueueRefresh(): Promise<void> {
    if (!acceptingUpdates) {
      return Promise.resolve()
    }

    const scheduled = queue.then(reconcile)
    queue = scheduled.catch(() => undefined)
    return scheduled
  }

  const removeListener = ctx.on('credentials/updated', (ref) => {
    if (!acceptingUpdates || ref !== API_KEY_REF) {
      return
    }
    return enqueueRefresh()
  })

  try {
    await enqueueRefresh()
  } catch (error) {
    acceptingUpdates = false
    removeListener()
    await queue
    try {
      await disposeActiveChild()
    } catch {
      // The already-sanitized startup failure remains the primary error.
    }
    throw error
  }

  return async () => {
    if (!acceptingUpdates) {
      return
    }

    acceptingUpdates = false
    removeListener()
    await queue
    await disposeActiveChild()
  }
}
