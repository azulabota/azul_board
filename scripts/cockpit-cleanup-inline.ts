// Inline cleanup logic used by the generation worker (weekly)
import type { SupabaseClient } from '@supabase/supabase-js'

export async function cleanupExpiredCockpitThreads(supabase: SupabaseClient) {
  const now = new Date().toISOString()

  // Fetch threads eligible for hard-delete
  const { data: threads, error: fetchErr } = await supabase
    .from('cockpit_threads')
    .select('id')
    .not('delete_after', 'is', null)
    .lt('delete_after', now)
    .limit(500)

  if (fetchErr) throw fetchErr

  const ids = (threads || []).map((t: any) => t.id)
  if (ids.length === 0) return { deleted: 0 }

  const { error: delErr } = await supabase.from('cockpit_threads').delete().in('id', ids)
  if (delErr) throw delErr

  return { deleted: ids.length }
}
