/*
  PassAble — RHS Hall Pass System
  FILE:    app/api/calendar/route.js
  PURPOSE: Server-side proxy that fetches the RHS Events Google Calendar iCal
           feed and returns upcoming events as JSON. Caches for 30 minutes.
           Called by app/wire/page.jsx CalendarCard.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  UPDATED: 2026-06-24
*/

import { NextResponse } from 'next/server'

// RHS Events Calendar public iCal feed.
// Override via CW_ICAL_URL env var if the calendar ever changes.
const ICAL_URL =
  process.env.CW_ICAL_URL ||
  'https://calendar.google.com/calendar/ical/rjusd.org_3stf3viha1tl799q7u41j8a75g%40group.calendar.google.com/public/basic.ics'

// Return up to this many upcoming events
const MAX_EVENTS = 20

export async function GET() {
  try {
    const res = await fetch(ICAL_URL, {
      next: { revalidate: 1800 }, // cache 30 min on Vercel Edge
    })
    if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`)
    const text = await res.text()
    const events = parseIcal(text)
    return NextResponse.json({ events }, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' },
    })
  } catch (err) {
    console.error('[api/calendar]', err.message)
    return NextResponse.json({ events: [], error: err.message }, { status: 200 })
  }
}

// ── iCal parser ───────────────────────────────────────────────────────────────
// Handles:
//   DTSTART;TZID=America/Los_Angeles:20260623T080000
//   DTSTART;VALUE=DATE:20260623   (all-day)
//   DTSTART:20260623T150000Z      (UTC)
// Returns [{title, date, time?, location?, description?}] sorted ascending.

function parseIcal(raw) {
  // Unfold lines (CRLF + whitespace = continuation)
  const text = raw
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')

  const lines = text.split('\n')
  const events = []
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (trimmed === 'END:VEVENT') {
      if (current?.title && current?.date) events.push(current)
      current = null
      continue
    }
    if (!current) continue

    // Split key (with optional params) from value at first colon
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) continue
    const keyPart = trimmed.slice(0, colonIdx)   // e.g. "DTSTART;TZID=America/Los_Angeles"
    const val     = trimmed.slice(colonIdx + 1)  // e.g. "20260623T080000"
    const key     = keyPart.split(';')[0]        // e.g. "DTSTART"

    switch (key) {
      case 'SUMMARY':
        current.title = unescapeIcal(val)
        break
      case 'DTSTART': {
        const { date, time } = parseDateTime(val)
        current.date = date
        if (time) current.time = time
        break
      }
      case 'LOCATION':
        if (val.trim()) current.location = unescapeIcal(val)
        break
      case 'DESCRIPTION':
        if (val.trim()) current.description = unescapeIcal(val).slice(0, 200)
        break
    }
  }

  // Filter to today onward, sort, cap
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)

  return events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_EVENTS)
}

function parseDateTime(val) {
  // Strip trailing Z for uniform handling
  const clean = val.replace(/Z$/, '')
  const datePart = clean.slice(0, 8) // YYYYMMDD
  const y = datePart.slice(0, 4)
  const m = datePart.slice(4, 6)
  const d = datePart.slice(6, 8)
  const date = `${y}-${m}-${d}`

  let time = null
  if (clean.length >= 13 && clean.charAt(8) === 'T') {
    // HHMMSS
    const h   = parseInt(clean.slice(9, 11), 10)
    const min = clean.slice(11, 13)
    // Skip midnight (all-day events often encoded as T000000)
    if (!(h === 0 && min === '00')) {
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12  = h % 12 || 12
      time = `${h12}:${min} ${ampm}`
    }
  }

  return { date, time }
}

function unescapeIcal(str) {
  return str
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, ' ')
    .replace(/\\\\/g, '\\')
    .trim()
}
