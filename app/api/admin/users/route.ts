import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-auth'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'

type UserRecord = {
  id: string
  email: string | null
  first_name: string | null
  status: 'pending' | 'active' | 'disabled'
  can_use_dev_dashboard: boolean
  can_use_scheduler: boolean
  roles: string[]
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)
  if ('error' in adminCheck) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
  }

  const supabaseAdmin = createSupabaseAdminClient()

  const [profilesRes, permissionsRes, rolesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, first_name, status').order('created_at', { ascending: true }),
    supabaseAdmin.from('user_permissions').select('user_id, can_use_dev_dashboard, can_use_scheduler'),
    supabaseAdmin.from('user_roles').select('user_id, role')
  ])

  if (profilesRes.error || permissionsRes.error || rolesRes.error) {
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const permissionByUser = new Map(
    (permissionsRes.data || []).map((p) => [p.user_id, p])
  )

  const rolesByUser = new Map<string, string[]>()
  for (const row of rolesRes.data || []) {
    const existing = rolesByUser.get(row.user_id) || []
    existing.push(row.role)
    rolesByUser.set(row.user_id, existing)
  }

  const users: UserRecord[] = (profilesRes.data || []).map((profile) => {
    const permission = permissionByUser.get(profile.id)
    return {
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      status: profile.status,
      can_use_dev_dashboard: permission?.can_use_dev_dashboard || false,
      can_use_scheduler: permission?.can_use_scheduler || false,
      roles: rolesByUser.get(profile.id) || []
    }
  })

  return NextResponse.json({ users })
}
