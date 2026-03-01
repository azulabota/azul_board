import { NextRequest } from 'next/server'
import { createSupabaseUserClient, hasSupabaseAdminEnv } from './supabase-admin'

export const requireAdmin = async (request: NextRequest) => {
  if (!hasSupabaseAdminEnv) {
    return { error: 'Server is missing Supabase admin environment variables', status: 500 as const }
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing bearer token', status: 401 as const }
  }

  const token = authHeader.slice(7)
  const userClient = createSupabaseUserClient(token)

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return { error: 'Unauthorized', status: 401 as const }
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin', { uid: user.id })

  if (adminError || !isAdmin) {
    return { error: 'Forbidden', status: 403 as const }
  }

  return { user }
}
