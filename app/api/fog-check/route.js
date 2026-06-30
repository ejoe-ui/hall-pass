/*
  PassAble — RHS Hall Pass System
  FILE:    app/api/fog-check/route.js
  ROUTE:   GET /api/fog-check
  PURPOSE: Checks Southwest JPA fog delay page for Riverdale Joint Unified.
           Returns { active, school, plan, updatedAt, source }.
           Used by the Cowboy Wire teacher dashboard to surface delay banners.

  PARAMS:  ?test=true  → skip real fetch; return a fake 2-hour delay for testing
  DEPLOY:  No env vars needed. Works on Vercel Hobby plan (on-demand, not cron).
  UPDATED: 2026-06-29
*/

import { NextResponse } from 'next/server'

const JPA_URL     = 'https://www.southwestjpa.org/?q=node/19'
const SCHOOL_NAME = 'Riverdale Joint Unified'

// Plans that mean "no delay" — everything else triggers the banner.
// Delay plans seen in the wild: "Plan A", "Plan B", "Plan C", "2 Hour Late Start", etc.
const NORMAL_PLANS = ['regular schedule']

export const revalidate = 0  // always fresh — no Next.js caching

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  // ── Test mode — returns fake delay for UI development without a real fog day ──
  if (searchParams.get('test') === 'true') {
    return NextResponse.json({
      active: true,
      school: SCHOOL_NAME,
      plan: '2 Hour Late Start',
      updatedAt: new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: '2-digit',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }),
      source: 'test',
    })
  }

  // ── Live check ────────────────────────────────────────────────────────────────
  try {
    const res = await fetch(JPA_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RHS-FogCheck/1.0)' },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ active: false, error: `JPA returned ${res.status}` })
    }

    const html = await res.text()

    // Find the Riverdale row. Table structure:
    //   <td>Riverdale Joint Unified</td> <whitespace> <td>Regular Schedule</td>
    const rowMatch = html.match(
      /Riverdale Joint Unified[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
    )

    if (!rowMatch) {
      return NextResponse.json({ active: false, error: 'Riverdale row not found in JPA page' })
    }

    // Strip HTML tags (there usually aren't any, but be safe)
    const plan = rowMatch[1].replace(/<[^>]+>/g, '').trim()
    const isDelay = plan.length > 0 && !NORMAL_PLANS.includes(plan.toLowerCase())

    // Parse the "Last Updated" timestamp row if present
    const updatedMatch = html.match(
      /Last Updated[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
    )
    const updatedAt = updatedMatch
      ? updatedMatch[1].replace(/<[^>]+>/g, '').trim()
      : null

    return NextResponse.json({
      active: isDelay,
      school: SCHOOL_NAME,
      plan,
      updatedAt,
      source: 'live',
    })
  } catch (err) {
    // Never crash — just return inactive so the banner stays hidden
    return NextResponse.json({ active: false, error: err.message })
  }
}
