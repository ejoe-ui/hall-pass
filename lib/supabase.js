import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Returns the teachers table record for the currently logged-in user
export async function getCurrentTeacher() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('auth_id', session.user.id)
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data
}

// Returns true if the current user is an admin
export async function isAdmin() {
  const teacher = await getCurrentTeacher()
  return teacher?.is_admin === true
}
