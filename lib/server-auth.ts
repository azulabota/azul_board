import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { createSupabaseAdminClient, createSupabaseUserClient, hasSupabaseAdminEnv } from './supabase-admin'

type JwtAuthResult =
  | {
      userId: string
      email: string | null
      status: 'pending' | 'active' | 'disabled'
      canUseDevDashboard: boolean
      canUseScheduler: boolean
      token: string
    }
  | {
      error: string
      status: number
    }

type ApiKeyAuthResult =
  | {
      userId: string
      email: string | null
      keyId: number
      status: 'pending' | 'active' | 'disabled'
      canUseDevDashboard: boolean
      canUseScheduler: boolean
    }
  | {
      error: string
      status: number
    }

const getBearerToken = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7).trim()
}

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex')

export const authenticateBearerUser = async (request: NextRequest): Promise<JwtAuthResult> => {
  if (!hasSupabaseAdminEnv) {
    return { error: 'Server is missing Supabase environment variables', status: 500 }
  }

  const token = getBearerToken(request)
  if (!token) {
    return { error: 'Missing bearer token', status: 401 }
  }

  const userClient = createSupabaseUserClient(token)
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const [profileRes, permissionsRes] = await Promise.all([
    userClient.from('profiles').select('status').eq('id', user.id).maybeSingle(),
    userClient.from('user_permissions').select('can_use_dev_dashboard, can_use_scheduler').eq('user_id', user.id).maybeSingle()
  ])

  if (profileRes.error) {
    return { error: profileRes.error.message, status: 500 }
  }

  if (!profileRes.data) {
    return { error: 'Profile not found', status: 404 }
  }

  if (permissionsRes.error) {
    return { error: permissionsRes.error.message, status: 500 }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    status: profileRes.data.status,
    canUseDevDashboard: Boolean(permissionsRes.data?.can_use_dev_dashboard),
    canUseScheduler: Boolean(permissionsRes.data?.can_use_scheduler),
    token
  }
}

export const authenticateApiKey = async (request: NextRequest): Promise<ApiKeyAuthResult> => {
  if (!hasSupabaseAdminEnv) {
    return { error: 'Server is missing Supabase environment variables', status: 500 }
  }

  const plaintextKey = getBearerToken(request)
  if (!plaintextKey) {
    return { error: 'Missing API key bearer token', status: 401 }
  }

  const keyHash = sha256(plaintextKey)
  const adminClient = createSupabaseAdminClient()

  const { data: keyRow, error: keyError } = await adminClient
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle()

  if (keyError) {
    return { error: keyError.message, status: 500 }
  }

  if (!keyRow) {
    return { error: 'Invalid API key', status: 401 }
  }

  const [profileRes, permissionsRes] = await Promise.all([
    adminClient.from('profiles').select('email, status').eq('id', keyRow.user_id).maybeSingle(),
    adminClient.from('user_permissions').select('can_use_dev_dashboard, can_use_scheduler').eq('user_id', keyRow.user_id).maybeSingle()
  ])

  if (profileRes.error) {
    return { error: profileRes.error.message, status: 500 }
  }

  if (!profileRes.data) {
    return { error: 'Profile not found', status: 404 }
  }

  if (permissionsRes.error) {
    return { error: permissionsRes.error.message, status: 500 }
  }

  await adminClient.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)

  return {
    userId: keyRow.user_id,
    email: profileRes.data.email ?? null,
    keyId: keyRow.id,
    status: profileRes.data.status,
    canUseDevDashboard: Boolean(permissionsRes.data?.can_use_dev_dashboard),
    canUseScheduler: Boolean(permissionsRes.data?.can_use_scheduler)
  }
}

export const hashApiKey = sha256
