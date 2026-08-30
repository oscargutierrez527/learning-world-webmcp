import OpenAI from 'openai'
import {
  parseDaxCoachSelection,
  validateDaxCoachSnapshot,
  type DaxCoachSelection,
  type DaxCoachSnapshot,
} from '../../src/dax/activeCoachContract.ts'

export const DEFAULT_ACTIVE_COACH_MODEL = 'gpt-5.6-luna'
export const ACTIVE_COACH_BODY_LIMIT = 12_000
export const ACTIVE_COACH_TIMEOUT_MS = 7_000

export const config = {
  path: '/api/active-coach',
  rateLimit: {
    windowLimit: 16,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}

const activeCoachInstruction = `You are the Active Learning Coach for a DAX CALCULATE and Filter Context mission. Select exactly one bounded assistance strategy for the current incorrect learner attempt: socratic, explanation, or filter_trace. The answer was already evaluated deterministically by Learning World. Do not solve the exercise, calculate or reveal a numeric result, create learning evidence, or diagnose the learner. A possible misconception is only a compatibility signal. Use the exercise semantics, incorrect attempt trajectory, demonstrated skills, and prior interventions to adapt how to help. Socratic support surfaces a conceptual distinction; explanation clarifies filter behavior; filter_trace scaffolds before-context, the filter operation, and what remains. Consider a useful strategy change after repeated failure, but repeat a strategy when appropriate. Return only the structured selection.`

const activeCoachOutputSchema = {
  type: 'object',
  properties: {
    intervention: {
      type: 'string',
      enum: ['socratic', 'explanation', 'filter_trace'],
    },
  },
  required: ['intervention'],
  additionalProperties: false,
}

interface DaxOpenAiClient {
  responses: {
    create(
      body: Record<string, unknown>,
      options?: {
        maxRetries?: number
        signal?: AbortSignal
        timeout?: number
      },
    ): Promise<{ output_text: string }>
  }
}

export class DaxCoachServerError extends Error {
  readonly code: 'missing_key' | 'invalid_model_output'

  constructor(code: DaxCoachServerError['code']) {
    super(code)
    this.name = 'DaxCoachServerError'
    this.code = code
  }
}

export async function selectDaxCoachIntervention(
  snapshot: DaxCoachSnapshot,
  signal: AbortSignal,
  options: {
    apiKey?: string
    model?: string
    client?: DaxOpenAiClient
  } = {},
): Promise<DaxCoachSelection> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new DaxCoachServerError('missing_key')
  }

  const model =
    options.model ??
    process.env.ACTIVE_COACH_MODEL ??
    DEFAULT_ACTIVE_COACH_MODEL
  const client =
    options.client ??
    (new OpenAI({ apiKey }) as unknown as DaxOpenAiClient)
  const response = await client.responses.create(
    {
      model,
      instructions: activeCoachInstruction,
      input: JSON.stringify(snapshot),
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'dax_coach_selection',
          strict: true,
          schema: activeCoachOutputSchema,
        },
        verbosity: 'low',
      },
      max_output_tokens: 256,
      store: false,
    },
    {
      signal,
      timeout: ACTIVE_COACH_TIMEOUT_MS,
      maxRetries: 1,
    },
  )

  let modelOutput: unknown
  try {
    modelOutput = JSON.parse(response.output_text)
  } catch {
    throw new DaxCoachServerError('invalid_model_output')
  }

  const selection = parseDaxCoachSelection(modelOutput)
  if (!selection) {
    throw new DaxCoachServerError('invalid_model_output')
  }

  return selection
}

type DaxCoachSelector = (
  snapshot: DaxCoachSnapshot,
  signal: AbortSignal,
) => Promise<DaxCoachSelection>

function jsonResponse(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export function createActiveCoachHandler(
  selectIntervention: DaxCoachSelector = selectDaxCoachIntervention,
) {
  return async function activeCoachHandler(request: Request) {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405)
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (Number.isFinite(contentLength) && contentLength > ACTIVE_COACH_BODY_LIMIT) {
      return jsonResponse({ error: 'payload_too_large' }, 413)
    }

    let bodyText: string
    try {
      bodyText = await request.text()
    } catch {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }
    if (bodyText.length > ACTIVE_COACH_BODY_LIMIT) {
      return jsonResponse({ error: 'payload_too_large' }, 413)
    }

    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    const validation = validateDaxCoachSnapshot(body)
    if (!validation.valid) {
      return jsonResponse(
        { error: 'invalid_snapshot', reason: validation.reason },
        validation.reason === 'unknown_exercise' ? 404 : 422,
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      ACTIVE_COACH_TIMEOUT_MS,
    )

    try {
      const selection = await selectIntervention(
        validation.snapshot,
        controller.signal,
      )
      const safeSelection = parseDaxCoachSelection(selection)
      if (!safeSelection) {
        return jsonResponse({ error: 'invalid_model_output' }, 502)
      }

      return jsonResponse(safeSelection, 200)
    } catch (error) {
      if (controller.signal.aborted) {
        return jsonResponse({ error: 'coach_timeout' }, 504)
      }
      if (error instanceof DaxCoachServerError && error.code === 'missing_key') {
        return jsonResponse({ error: 'coach_unavailable' }, 503)
      }
      if (
        error instanceof DaxCoachServerError &&
        error.code === 'invalid_model_output'
      ) {
        return jsonResponse({ error: 'invalid_model_output' }, 502)
      }

      return jsonResponse({ error: 'coach_unavailable' }, 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}

export default createActiveCoachHandler()
