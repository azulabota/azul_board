import { createClient } from '@supabase/supabase-js'

type Slot = {
  date: string
  scheduled_at: string | null
  pipeline_key: string
  pipeline_name: string
  description: string | null
}

type GenerationJobRow = {
  id: number
  user_id: string
  platform: string
  status: 'queued' | 'running' | 'done' | 'failed'
  payload: {
    slots?: Slot[]
    instructions?: {
      tone?: string
      goals?: string[]
      constraints?: string[]
    }
    result?: {
      generated: number
      inserted: number
      skipped_existing: number
    }
  } | null
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const modelProvider = (process.env.MODEL_PROVIDER || 'stub').toLowerCase()
const openAiApiKey = process.env.OPENAI_API_KEY || ''
const pollIntervalMs = Math.max(500, Number(process.env.GENERATION_WORKER_POLL_MS || 2000))

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const stripTime = (isoOrDate: string) => isoOrDate.slice(0, 10)

const generateDeterministicContent = (slot: Slot, platform: string) => {
  const date = stripTime(slot.date)
  const desc = slot.description?.trim() || `Focus on ${slot.pipeline_name}.`
  return [
    `${slot.pipeline_name} (${date})`,
    `Platform: ${platform}`,
    '',
    `Today: ${desc}`,
    `Angle: ${slot.pipeline_name} insight for ${date}.`,
    'CTA: Share one practical takeaway in the replies.'
  ].join('\n')
}

const claimNextJob = async (): Promise<GenerationJobRow | null> => {
  const { data: queuedJobs, error: readError } = await supabase
    .from('generation_jobs')
    .select('id, user_id, platform, status, payload')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (readError) throw readError
  const job = (queuedJobs || [])[0] as GenerationJobRow | undefined
  if (!job) return null

  const { data: claimed, error: claimError } = await supabase
    .from('generation_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      error: null
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('id, user_id, platform, status, payload')
    .maybeSingle()

  if (claimError) throw claimError
  return (claimed as GenerationJobRow | null) || null
}

const processJob = async (job: GenerationJobRow) => {
  const slots = Array.isArray(job.payload?.slots) ? job.payload!.slots! : []
  if (slots.length === 0) {
    await supabase
      .from('generation_jobs')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        payload: { ...(job.payload || {}), result: { generated: 0, inserted: 0, skipped_existing: 0 } }
      })
      .eq('id', job.id)
    return
  }

  const dates = Array.from(new Set(slots.map((s) => stripTime(s.date))))
  const keys = Array.from(new Set(slots.map((s) => s.pipeline_key)))
  const { data: existingItems, error: existingError } = await supabase
    .from('content_items')
    .select('date, pipeline_key, type')
    .eq('user_id', job.user_id)
    .in('date', dates)
    .in('pipeline_key', keys)

  if (existingError) throw existingError

  const existingSet = new Set((existingItems || []).map((r: any) => `${r.date}::${r.pipeline_key || r.type}`))
  const newSlots = slots.filter((slot) => !existingSet.has(`${stripTime(slot.date)}::${slot.pipeline_key}`))

  const rowsToInsert = newSlots.map((slot) => ({
    user_id: job.user_id,
    date: stripTime(slot.date),
    scheduled_at: slot.scheduled_at || null,
    pipeline_key: slot.pipeline_key,
    type: slot.pipeline_key,
    title: `${slot.pipeline_name} post`,
    content: generateDeterministicContent(slot, job.platform || 'X'),
    platform: job.platform || 'X',
    status: 'draft'
  }))

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('content_items').insert(rowsToInsert)
    if (insertError) throw insertError
  }

  await supabase
    .from('generation_jobs')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      payload: {
        ...(job.payload || {}),
        result: {
          generated: newSlots.length,
          inserted: rowsToInsert.length,
          skipped_existing: slots.length - newSlots.length
        }
      }
    })
    .eq('id', job.id)
}

const failJob = async (jobId: number, reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || 'Unknown error')
  await supabase
    .from('generation_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: message.slice(0, 2000)
    })
    .eq('id', jobId)
}

const main = async () => {
  console.log(`[generation-worker] Starting worker (provider=${modelProvider}, poll=${pollIntervalMs}ms)`)
  if (modelProvider === 'openai' && !openAiApiKey) {
    console.warn('[generation-worker] MODEL_PROVIDER=openai but OPENAI_API_KEY is missing; using placeholder generator.')
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextJob()
      if (!job) {
        await sleep(pollIntervalMs)
        continue
      }

      console.log(`[generation-worker] Processing job #${job.id} for user ${job.user_id}`)
      try {
        await processJob(job)
        console.log(`[generation-worker] Completed job #${job.id}`)
      } catch (jobError) {
        console.error(`[generation-worker] Failed job #${job.id}`, jobError)
        await failJob(job.id, jobError)
      }
    } catch (loopError) {
      console.error('[generation-worker] Loop error', loopError)
      await sleep(pollIntervalMs)
    }
  }
}

void main()
