/*
  PassAble — RHS Hall Pass System
  FILE:    app/api/admin/teacher-auth/route.js
  ROUTE:   POST /api/admin/teacher-auth
  PURPOSE: Server-side Supabase Admin API calls for teacher account management.
           Uses service role key — never exposed to the client.
           Actions:
             create — create a new auth user with default passcode (room doubled)
             reset  — reset an existing user's password back to default passcode
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase auth.admin (requires SUPABASE_SERVICE_ROLE_KEY env var)
  UPDATED: 2026-06-20
*/

import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    // Validate env vars before creating client
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Server misconfiguration: missing Supabase env vars. Add SUPABASE_SERVICE_ROLE_KEY to Vercel.' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { action, email, password, auth_id } = body

    // ── CREATE: new teacher auth account ─────────────────────────────────────
    if (action === 'create') {
      if (!email || !password) {
        return Response.json({ error: 'email and password are required' }, { status: 400 })
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,   // skip email verification — admin is setting this up
      })

      if (error) {
        // If user already exists in auth, return a clear message
        if (error.message?.toLowerCase().includes('already') || error.status === 422) {
          return Response.json(
            { error: 'An auth account already exists for this email. Use Reset Passcode instead, or check Supabase Auth dashboard for their user ID.' },
            { status: 409 }
          )
        }
        return Response.json({ error: error.message }, { status: 400 })
      }

      return Response.json({ user_id: data.user.id })
    }

    // ── RESET: restore password to default passcode ───────────────────────────
    if (action === 'reset') {
      if (!auth_id || !password) {
        return Response.json({ error: 'auth_id and password are required' }, { status: 400 })
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, { password })

      if (error) {
        return Response.json({ error: error.message }, { status: 400 })
      }

      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err) {
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
