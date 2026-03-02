import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cleanupExpiredCockpitThreads } from './cockpit-cleanup-inline'

type Slot = {
  date: string
  scheduled_at: string | null
  pipeline_key: string
  pipeline_name: string
  description: string | null
  gen?: {
    length?: string
    min_words?: number | null
    max_words?: number | null
    must_start_with?: string | null
    must_end_question?: boolean
    include_cta?: boolean
    no_hashtags?: boolean
    no_emojis?: boolean
  }
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

type CockpitJobRow = {
  id: number
  user_id: string
  thread_id: number
  prompt: string
  selected_attachment_ids: number[] | null
  status: 'queued' | 'running' | 'done' | 'failed'
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const modelProvider = (process.env.MODEL_PROVIDER || 'stub').toLowerCase()
const codexModel = process.env.CODEX_MODEL || ''
const openAiApiKey = process.env.OPENAI_API_KEY || ''
const pollIntervalMs = Math.max(500, Number(process.env.GENERATION_WORKER_POLL_MS || 2000))
const weeklyCleanupEnabled = (process.env.COCKPIT_WEEKLY_CLEANUP || 'true').toLowerCase() !== 'false'
const weeklyCleanupEnabled = (process.env.COCKPIT_WEEKLY_CLEANUP || 'true').toLowerCase() !== 'false'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const stripTime = (isoOrDate: string) => isoOrDate.slice(0, 10)

const execFileAsync = promisify(execFile)

const buildPrompt = (slot: Slot, platform: string, recentExamples: string[], extraInstruction = '') => {
  const date = stripTime(slot.date)
  const desc = slot.description?.trim() || `Write a ${slot.pipeline_name} post.`
  const recentBlock = recentExamples.length
    ? `\nRecent posts to avoid repeating (do NOT reuse phrasing/structure):\n${recentExamples
        .slice(0, 20)
        .map((t, i) => `- (${i + 1}) ${t}`)
        .join('\n')}\n`
    : ''

  const rules = {
    length: slot.gen?.length || 'short',
    minWords: slot.gen?.min_words ?? null,
    maxWords: slot.gen?.max_words ?? null,
    mustStart: (slot.gen?.must_start_with || '').trim(),
    mustEndQ: Boolean(slot.gen?.must_end_question),
    includeCta: slot.gen?.include_cta !== false,
    noHashtags: slot.gen?.no_hashtags !== false,
    noEmojis: slot.gen?.no_emojis !== false
  }

  const lengthRule =
    rules.length === 'long'
      ? `- Length: long single post. Target ${rules.minWords || 600}-${rules.maxWords || 1000} words.`
      : rules.length === 'medium'
        ? `- Length: medium. Target ${rules.minWords || 150}-${rules.maxWords || 400} words.`
        : `- Length: short. Target ${rules.minWords || 20}-${rules.maxWords || 100} words.`

  const mustStartRule = rules.mustStart ? `- Must start with: ${JSON.stringify(rules.mustStart)}.` : ''
  const endQRule = rules.mustEndQ ? '- Must end with a question mark.' : ''
  const ctaRule = rules.includeCta ? '- Include a clear CTA (no fluff).' : ''
  const hashtagRule = rules.noHashtags ? '- No hashtags.' : ''
  const emojiRule = rules.noEmojis ? '- No emojis.' : ''

  return `You are an award-winning writer with 15 years of experience.
Write ONE ${platform} post for the pipeline "${slot.pipeline_name}".
Date: ${date}.

Pipeline instructions (follow strictly):
${desc}
${recentBlock}
Hard constraints:
- Output ONLY the post text. No headings, no markdown, no quotes.
- Make it engaging, curiosity-driven, and follower-growth oriented.
- Avoid repeating common phrases; make it feel fresh for this date.
- Keep it platform-appropriate.
${lengthRule}
${mustStartRule}
${endQRule}
${ctaRule}
${hashtagRule}
${emojiRule}
${extraInstruction ? `- ${extraInstruction}` : ''}

Return just the final post.`
}

const buildBatchPrompt = (slots: Slot[], platform: string, recentExamples: string[]) => {
  const first = slots[0]
  const desc = first.description?.trim() || `Write ${first.pipeline_name} posts.`

  const rules = {
    length: first.gen?.length || 'short',
    minWords: first.gen?.min_words ?? null,
    maxWords: first.gen?.max_words ?? null,
    mustStart: (first.gen?.must_start_with || '').trim(),
    mustEndQ: Boolean(first.gen?.must_end_question),
    includeCta: first.gen?.include_cta !== false,
    noHashtags: first.gen?.no_hashtags !== false,
    noEmojis: first.gen?.no_emojis !== false
  }

  const lengthRule =
    rules.length === 'long'
      ? `- Length: long single post. Target ${rules.minWords || 600}-${rules.maxWords || 1000} words.`
      : rules.length === 'medium'
        ? `- Length: medium. Target ${rules.minWords || 150}-${rules.maxWords || 400} words.`
        : `- Length: short. Target ${rules.minWords || 20}-${rules.maxWords || 100} words.`

  const mustStartRule = rules.mustStart ? `- Must start with: ${JSON.stringify(rules.mustStart)}.` : ''
  const endQRule = rules.mustEndQ ? '- Must end with a question mark.' : ''
  const ctaRule = rules.includeCta ? '- Include a clear CTA (no fluff).' : ''
  const hashtagRule = rules.noHashtags ? '- No hashtags.' : ''
  const emojiRule = rules.noEmojis ? '- No emojis.' : ''
  const scheduleBlock = slots
    .map((slot, i) => {
      const scheduledAt = slot.scheduled_at || `${stripTime(slot.date)}T09:00:00`
      return `${i + 1}. date=${stripTime(slot.date)} scheduled_at=${scheduledAt}`
    })
    .join('\n')
  const recentBlock = recentExamples.length
    ? `Recent pipeline posts to avoid reusing (last ${Math.min(20, recentExamples.length)}):\n${recentExamples
        .slice(0, 20)
        .map((t, i) => `- (${i + 1}) ${t}`)
        .join('\n')}\n`
    : ''

  return `You are an award-winning writer with 15 years of experience.
Create ${slots.length} distinct ${platform} posts for pipeline "${first.pipeline_name}" (${first.pipeline_key}).

Pipeline instructions:
${desc}

Target slots:
${scheduleBlock}

${recentBlock}Hard constraints:
- Output STRICT JSON only with no markdown and no extra text.
- Schema: {"items":[{"date":"YYYY-MM-DD","scheduled_at":"YYYY-MM-DDTHH:MM:SS|null","pipeline_key":"string","content":"string","title":"string (optional)"}]}
- Return exactly ${slots.length} items, one per target date, all with pipeline_key "${first.pipeline_key}".
- Rotate hook types across the batch (question, bold statement, contrarian take, personal observation, data point, challenge).
- Avoid repeated phrases/openings and avoid similar sentence structure between items.
- Do not reuse language from recent posts.
- No duplicates or near-duplicates within this batch.
- Keep it platform-appropriate.
${lengthRule}
${mustStartRule}
${endQRule}
${ctaRule}
${hashtagRule}
${emojiRule}

Return only valid JSON.`
}

const generateWithCodex = async (prompt: string) => {
  // Uses the local Codex CLI session (often OAuth-backed). No API key needed here.
  // `codex` outputs plain text. We pass -q for quiet where supported.
  const args = ['exec', '--full-auto', prompt]
  if (codexModel) {
    args.unshift('--model', codexModel)
  }

  const { stdout } = await execFileAsync('codex', args, {
    maxBuffer: 10 * 1024 * 1024
  })

  return String(stdout || '').trim()
}

const buildCockpitPrompt = ({
  userMessage,
  threadId,
  attachmentLines
}: {
  userMessage: string
  threadId: number
  attachmentLines: string[]
}) => {
  const attachmentBlock = attachmentLines.length
    ? `Selected attachments (signed URLs):\n${attachmentLines.map((line) => `- ${line}`).join('\n')}\n`
    : 'Selected attachments: none\n'

  return `You are Azul, the coding copilot for AzulBoard.
Context:
- Product: AzulBoard
- Surface: Coding Cockpit for async "vibe coding" requests.
- Your output should help the user implement real changes quickly.

Instructions:
- Respond with concrete, actionable engineering steps.
- When code changes are relevant, include focused diffs/snippets the user can apply.
- Call out assumptions, edge cases, and verification steps briefly.
- Keep the response direct and practical.

Thread ID: ${threadId}
User request:
${userMessage}

${attachmentBlock}
Return only the assistant response content for the cockpit chat.`
}

const generateDeterministicContent = (slot: Slot, platform: string) => {
  const date = stripTime(slot.date)
  const desc = slot.description?.trim() || `Focus on ${slot.pipeline_name}.`
  return `Good Morning — ${slot.pipeline_name} (${date}). ${desc}`
}

const normalizeForDedupe = (s: string) =>
  s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenSet = (s: string) => new Set(normalizeForDedupe(s).split(' ').filter((t) => t.length > 2))

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  a.forEach((v) => {
    if (b.has(v)) inter += 1
  })
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

const isNearDuplicate = (a: string, b: string) => {
  const an = normalizeForDedupe(a)
  const bn = normalizeForDedupe(b)
  if (!an || !bn) return false
  if (an === bn) return true
  if (an.length >= 80 && bn.length >= 80 && (an.includes(bn.slice(0, 80)) || bn.includes(an.slice(0, 80)))) return true
  return jaccard(tokenSet(an), tokenSet(bn)) >= 0.82
}

const parseBatchJson = (raw: string): Array<{ date: string; scheduled_at: string | null; pipeline_key: string; content: string; title?: string }> | null => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  const candidates = [trimmed]
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeFenceMatch?.[1]) candidates.push(codeFenceMatch[1].trim())
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { items?: Array<Record<string, unknown>> }
      if (!Array.isArray(parsed.items)) continue
      const items = parsed.items
        .map((item) => {
          const date = typeof item.date === 'string' ? stripTime(item.date) : ''
          const scheduledAtRaw = item.scheduled_at
          const scheduled_at =
            scheduledAtRaw == null ? null : typeof scheduledAtRaw === 'string' ? scheduledAtRaw.trim() || null : null
          const pipelineKey = typeof item.pipeline_key === 'string' ? item.pipeline_key.trim() : ''
          const content = typeof item.content === 'string' ? item.content.trim() : ''
          const title = typeof item.title === 'string' ? item.title.trim() : undefined
          if (!date || !pipelineKey || !content) return null
          return { date, scheduled_at, pipeline_key: pipelineKey, content, title }
        })
        .filter(Boolean) as Array<{ date: string; scheduled_at: string | null; pipeline_key: string; content: string; title?: string }>
      if (items.length > 0) return items
    } catch {
      // try next candidate
    }
  }

  return null
}

const generateContent = async (
  slot: Slot,
  platform: string,
  recentExamples: string[],
  extraInstruction = ''
) => {
  const prompt = buildPrompt(slot, platform, recentExamples, extraInstruction)

  if (modelProvider === 'codex') {
    const out = await generateWithCodex(prompt)
    if (!out) throw new Error('Codex returned empty output')

    // basic dedupe guard: if too similar to any recent example, try once more with stronger instruction
    const outNorm = normalizeForDedupe(out)
    const isTooSimilar = recentExamples.some((ex) => {
      const exNorm = normalizeForDedupe(ex)
      return exNorm && outNorm && (outNorm === exNorm || outNorm.includes(exNorm.slice(0, 60)))
    })

    if (isTooSimilar) {
      const retry = await generateWithCodex(
        prompt +
          `\n\nYou repeated phrasing too closely. Rewrite with a completely different hook and structure while still following the pipeline instructions.`
      )
      return String(retry || out).trim()
    }

    return out
  }

  // TODO: add openai provider support here if needed.
  return generateDeterministicContent(slot, platform)
}

const generateBatchForPipelineCodex = async (
  slots: Slot[],
  platform: string,
  recentExamples: string[]
) => {
  const raw = await generateWithCodex(buildBatchPrompt(slots, platform, recentExamples))
  const parsedItems = parseBatchJson(raw)
  if (!parsedItems) return null

  const byDate = new Map(parsedItems.map((item) => [stripTime(item.date), item]))
  const resolved = slots.map((slot) => {
    const item = byDate.get(stripTime(slot.date))
    if (!item) return null
    if (item.pipeline_key !== slot.pipeline_key) return null
    return {
      slot,
      title: item.title || `${slot.pipeline_name} post`,
      content: item.content
    }
  })

  if (resolved.some((r) => !r)) return null
  return resolved as Array<{ slot: Slot; title: string; content: string }>
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

const claimNextCockpitJob = async (): Promise<CockpitJobRow | null> => {
  const { data: queuedJobs, error: readError } = await supabase
    .from('cockpit_jobs')
    .select('id, user_id, thread_id, prompt, selected_attachment_ids, status')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (readError) throw readError
  const job = (queuedJobs || [])[0] as CockpitJobRow | undefined
  if (!job) return null

  const { data: claimed, error: claimError } = await supabase
    .from('cockpit_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      error: null
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('id, user_id, thread_id, prompt, selected_attachment_ids, status')
    .maybeSingle()

  if (claimError) throw claimError
  return (claimed as CockpitJobRow | null) || null
}

const processCockpitJob = async (job: CockpitJobRow) => {
  const attachmentIds = Array.isArray(job.selected_attachment_ids)
    ? job.selected_attachment_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : []

  let attachmentLines: string[] = []
  if (attachmentIds.length > 0) {
    const { data: attachments, error: attachmentError } = await supabase
      .from('cockpit_attachments')
      .select('id, storage_path, filename, content_type, size_bytes')
      .eq('thread_id', job.thread_id)
      .in('id', attachmentIds)

    if (attachmentError) throw attachmentError

    attachmentLines = await Promise.all(
      (attachments || []).map(async (attachment: any) => {
        const { data: signed, error: signedError } = await supabase.storage
          .from('cockpit')
          .createSignedUrl(String(attachment.storage_path || ''), 60 * 30)

        const filename = attachment.filename || `attachment_${attachment.id}`
        const contentType = attachment.content_type || 'unknown'
        const sizeBytes = Number(attachment.size_bytes || 0)

        if (signedError || !signed?.signedUrl) {
          return `${filename} (${contentType}, ${sizeBytes} bytes): signed URL unavailable`
        }
        return `${filename} (${contentType}, ${sizeBytes} bytes): ${signed.signedUrl}`
      })
    )
  }

  const prompt = buildCockpitPrompt({
    userMessage: job.prompt,
    threadId: job.thread_id,
    attachmentLines
  })
  const rawAssistantReply = await generateWithCodex(prompt)
  const assistantReply = rawAssistantReply || 'I could not generate a response. Please try again.'

  const { data: messageRow, error: insertMessageError } = await supabase
    .from('cockpit_messages')
    .insert({
      thread_id: job.thread_id,
      user_id: job.user_id,
      role: 'assistant',
      content: assistantReply
    })
    .select('id')
    .single()

  if (insertMessageError) throw insertMessageError

  await Promise.all([
    supabase
      .from('cockpit_jobs')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        result_message_id: messageRow.id,
        error: null
      })
      .eq('id', job.id),
    supabase.from('cockpit_threads').update({ updated_at: new Date().toISOString() }).eq('id', job.thread_id)
  ])
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

  // Pull recent posts for this pipeline to reduce repetition
  const recentByPipeline = new Map<string, string[]>()
  for (const key of keys) {
    const { data: recent, error: recentErr } = await supabase
      .from('content_items')
      .select('content')
      .eq('user_id', job.user_id)
      .eq('pipeline_key', key)
      .not('content', 'is', null)
      .order('date', { ascending: false })
      .limit(20)

    if (recentErr) throw recentErr
    recentByPipeline.set(
      key,
      (recent || []).map((r: any) => String(r.content || '').trim()).filter(Boolean)
    )
  }

  const rowsToInsert = [] as any[]
  const platform = job.platform || 'X'
  const slotsByPipeline = new Map<string, Slot[]>()
  for (const slot of newSlots) {
    const list = slotsByPipeline.get(slot.pipeline_key) || []
    list.push(slot)
    slotsByPipeline.set(slot.pipeline_key, list)
  }

  for (const pipelineKey of Array.from(slotsByPipeline.keys())) {
    const pipelineSlots = slotsByPipeline.get(pipelineKey) || []
    const recentExamples = recentByPipeline.get(pipelineKey) || []
    const sortedSlots = [...pipelineSlots].sort((a, b) => stripTime(a.date).localeCompare(stripTime(b.date)))
    let generated = [] as Array<{ slot: Slot; title: string; content: string }>

    if (modelProvider === 'codex') {
      try {
        const batchGenerated = await generateBatchForPipelineCodex(sortedSlots, platform, recentExamples)
        if (batchGenerated) generated = batchGenerated
      } catch (err) {
        console.warn(`[generation-worker] Batch generation failed for pipeline ${pipelineKey}; falling back`, err)
      }
    }

    if (generated.length === 0) {
      for (const slot of sortedSlots) {
        const content = await generateContent(slot, platform, recentExamples)
        generated.push({ slot, title: `${slot.pipeline_name} post`, content })
      }
    }

    // One regen pass for near-duplicates in the generated batch.
    const regenIndexes: number[] = []
    for (let i = 0; i < generated.length; i += 1) {
      for (let j = i + 1; j < generated.length; j += 1) {
        if (isNearDuplicate(generated[i].content, generated[j].content)) {
          if (!regenIndexes.includes(j)) regenIndexes.push(j)
        }
      }
    }

    if (regenIndexes.length > 0) {
      for (const idx of regenIndexes) {
        const target = generated[idx]
        const avoidTexts = [
          ...recentExamples,
          ...generated.filter((_, i) => i !== idx).map((g) => g.content)
        ]
        const refreshed = await generateContent(
          target.slot,
          platform,
          avoidTexts.slice(0, 20),
          'Use a clearly different hook type and sentence structure than all prior examples.'
        )
        generated[idx] = { ...target, content: refreshed }
      }
    }

    for (const item of generated) {
      rowsToInsert.push({
        user_id: job.user_id,
        date: stripTime(item.slot.date),
        scheduled_at: item.slot.scheduled_at || null,
        pipeline_key: item.slot.pipeline_key,
        type: item.slot.pipeline_key,
        title: item.title || `${item.slot.pipeline_name} post`,
        content: item.content,
        platform,
        status: 'draft'
      })
    }
  }

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

const failCockpitJob = async (jobId: number, reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || 'Unknown error')
  await supabase
    .from('cockpit_jobs')
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
  if (modelProvider === 'codex') {
    console.log('[generation-worker] Using local codex CLI for generation')
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const cockpitJob = await claimNextCockpitJob()
      if (cockpitJob) {
        console.log(`[generation-worker] Processing cockpit job #${cockpitJob.id} for user ${cockpitJob.user_id}`)
        try {
          await processCockpitJob(cockpitJob)
          console.log(`[generation-worker] Completed cockpit job #${cockpitJob.id}`)
        } catch (jobError) {
          console.error(`[generation-worker] Failed cockpit job #${cockpitJob.id}`, jobError)
          await failCockpitJob(cockpitJob.id, jobError)
        }
        continue
      }

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
