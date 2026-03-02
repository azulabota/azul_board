import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const BATCH_SIZE = Math.max(10, Number(process.env.COCKPIT_CLEANUP_BATCH_SIZE || 500))

async function run() {
  const nowIso = new Date().toISOString()

  const { data: rows, error: fetchError } = await supabase
    .from('cockpit_threads')
    .select('id')
    .not('archived_at', 'is', null)
    .lt('delete_after', nowIso)
    .order('delete_after', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchError) {
    throw fetchError
  }

  const ids = (rows || []).map((row: any) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0)

  if (ids.length === 0) {
    console.log('[cockpit-cleanup] no archived threads eligible for deletion')
    return
  }

  const { error: deleteError } = await supabase.from('cockpit_threads').delete().in('id', ids)
  if (deleteError) {
    throw deleteError
  }

  console.log(`[cockpit-cleanup] deleted ${ids.length} archived thread(s): ${ids.join(', ')}`)
}

run().catch((error) => {
  console.error('[cockpit-cleanup] failed', error)
  process.exit(1)
})
