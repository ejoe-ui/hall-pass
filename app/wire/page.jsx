/*
  PassAble — RHS Hall Pass System
  FILE:    app/wire/page.jsx
  ROUTE:   /wire
  PARAMS:  ?uid=XXXXXX  NFC UID (6 chars, optional — personalizes pass history)
           ?room=27     Room override (optional — inferred from student if uid given)
  PURPOSE: Student-facing Cowboy Wire display for Chromebooks.
           Left column: locked cards — bell schedule, calendar, class objectives.
           Right column: modular configurable cards with localStorage prefs.
           Always present: header, status bar (15-min rule), period hero.
           Always included (no toggle): ad spot.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase — teachers, students, passes, student_periods,
           teacher_objectives, cw_fortunes, cw_cowboy_code, cw_sports,
           cw_ads, cw_countdowns, cw_releases, cw_news, cw_fun_facts, settings
  DATA:    Weather   → Open-Meteo (free, no key)
           Calendar  → Google Apps Script endpoint (CW_CALENDAR_URL)
           Lunch     → CW2 menu endpoint (CW_MENU_URL)
  AUTH:    None — public page
  UPDATED: 2026-06-24 — initial build
*/

'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import {
  SCHEDULES, SCHEDULE_LABELS,
  fetchTodayScheduleType, getCurrentPeriodInfo, getCheckoutStatus,
} from '../../lib/schedules'

// ── Config ────────────────────────────────────────────────────────────────────
// Calendar is fetched server-side via /api/calendar (no env var needed here).
// Menu: set NEXT_PUBLIC_CW_MENU_URL in Vercel if you have a GAS endpoint.
const CW_MENU_URL        = process.env.NEXT_PUBLIC_CW_MENU_URL || ''
const WEATHER_LAT        = process.env.NEXT_PUBLIC_WEATHER_LAT || '36.73'
const WEATHER_LON        = process.env.NEXT_PUBLIC_WEATHER_LON || '-119.79'
const SELF_CHECKOUT_BASE = '/self-checkout'

const RHS_GREEN = '#006938'
const RHS_DARK  = '#004d29'

// ── Cowboy Code (rotates weekly) ──────────────────────────────────────────────
const COWBOY_CODE = [
  { trait: 'Integrity',      definition: 'Do the right thing even when no one is watching.' },
  { trait: 'Respect',        definition: 'Treat everyone the way you want to be treated.' },
  { trait: 'Responsibility', definition: 'Own your actions and their consequences.' },
  { trait: 'Perseverance',   definition: 'Keep going even when it gets hard.' },
  { trait: 'Pride',          definition: 'Represent Riverdale with class and character.' },
  { trait: 'Compassion',     definition: "Look out for others — that's what Cowboys do." },
  { trait: 'Courage',        definition: 'Speak up. Stand up. Do what\'s right.' },
]

// ── Fortune Cookie Finds (rotates daily; also pulled from cw_fortunes if exists) ──
const BUILTIN_FORTUNES = [
  "The expert in anything was once a beginner who refused to quit.",
  "You don't have to be perfect to be amazing.",
  "Hard work beats talent when talent doesn't work hard.",
  "Every accomplishment starts with the decision to try.",
  "The only way to do great work is to love what you do.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Believe you can and you're halfway there.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "It always seems impossible until it's done.",
  "Don't watch the clock — do what it does. Keep going.",
  "Your only limit is your mind.",
  "Great things never come from comfort zones.",
  "Push yourself because no one else is going to do it for you.",
  "Sometimes later becomes never. Do it now.",
  "Little things make big days.",
  "It's going to be hard, but hard is not impossible.",
  "Don't stop until you're proud.",
  "Wake up with determination. Go to bed with satisfaction.",
  "Do something today that your future self will thank you for.",
  "The key to success is to focus on goals, not obstacles.",
]

// ── Component Registry ────────────────────────────────────────────────────────
// alwaysOn: true → included always, no toggle (but user can reorder)
// defaultOn: initial state for new visitors
const COMPONENT_REGISTRY = [
  { id: 'weather',     label: 'Weather',          icon: 'ti-cloud',          defaultOn: true,  alwaysOn: false },
  { id: 'lunch',       label: 'Lunch Menu',       icon: 'ti-tool-kitchen-2', defaultOn: true,  alwaysOn: false },
  { id: 'passHistory', label: 'Pass History',     icon: 'ti-id-badge-2',     defaultOn: true,  alwaysOn: false },
  { id: 'fortune',     label: 'Fortune Cookie',   icon: 'ti-sparkles',       defaultOn: true,  alwaysOn: false },
  { id: 'cowboyCode',  label: 'Cowboy Code',      icon: 'ti-star',           defaultOn: true,  alwaysOn: false },
  { id: 'releases',    label: 'Release Times',    icon: 'ti-clock-play',     defaultOn: true,  alwaysOn: false },
  { id: 'countdowns',  label: 'Countdowns',       icon: 'ti-hourglass',      defaultOn: true,  alwaysOn: false },
  { id: 'sports',      label: 'Sports',           icon: 'ti-trophy',         defaultOn: false, alwaysOn: false },
  { id: 'birthdays',   label: 'Birthdays',        icon: 'ti-cake',           defaultOn: false, alwaysOn: false },
  { id: 'funFacts',    label: 'Fun Facts',        icon: 'ti-bulb',           defaultOn: false, alwaysOn: false },
  { id: 'news',        label: 'School News',      icon: 'ti-news',           defaultOn: false, alwaysOn: false },
  { id: 'ads',         label: 'Ad Spot',          icon: 'ti-speakerphone',   defaultOn: true,  alwaysOn: true  },
]

// Default order for right column slots
const DEFAULT_ORDER = [
  'weather','lunch','passHistory','fortune','cowboyCode',
  'releases','countdowns','sports','birthdays','funFacts','news','ads',
]

const PREFS_KEY = 'rhs-wire-prefs-v1'

function getDefaultPrefs() {
  return {
    enabled: Object.fromEntries(COMPONENT_REGISTRY.map(c => [c.id, c.defaultOn || c.alwaysOn])),
    order: [...DEFAULT_ORDER],
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtTime(date) {
  if (!date) return ''
  const h = date.getHours(), m = date.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDateLong(date) {
  if (!date) return ''
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December']
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`
}
function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
function weekOfYear(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
}
function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
}
function normalizeUid(raw) {
  return (raw || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '').slice(-6)
}
function weatherCodeToLabel(code) {
  if (code === 0) return 'Sunny'
  if (code <= 3)  return 'Partly Cloudy'
  if (code <= 49) return 'Foggy'
  if (code <= 69) return 'Rainy'
  if (code <= 79) return 'Snowy'
  if (code <= 82) return 'Showers'
  return 'Stormy'
}
function weatherCodeToEmoji(code) {
  if (code === 0) return '☀️'
  if (code <= 3)  return '⛅'
  if (code <= 49) return '🌫️'
  if (code <= 69) return '🌧️'
  if (code <= 79) return '❄️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}

// ── Shared card shell ─────────────────────────────────────────────────────────
function Card({ children, locked = false, style = {} }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 10,
      border: locked ? `0.5px solid #c0d8c8` : '0.5px solid #e0ddd8',
      borderLeft: locked ? `2.5px solid ${RHS_GREEN}` : undefined,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}
function CardHeader({ label, tag, locked = false, draggable = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 13px', borderBottom: '0.5px solid #eeece8',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.11em',
        textTransform: 'uppercase', color: locked ? RHS_GREEN : '#999',
      }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {tag && <span style={{ fontSize: 10, color: '#bbb' }}>{tag}</span>}
        {locked && (
          <span style={{
            fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: RHS_GREEN, background: '#e8f5ee', padding: '1px 7px', borderRadius: 8,
          }}>🔒 locked</span>
        )}
        {draggable && !locked && (
          <i className="ti ti-grip-vertical" aria-hidden="true"
             style={{ fontSize: 13, color: '#ddd', cursor: 'grab' }} />
        )}
      </span>
    </div>
  )
}
function CardBody({ children, compact = false }) {
  return (
    <div style={{ padding: compact ? '8px 13px' : '11px 13px' }}>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// LOCKED LEFT COLUMN CARDS
// ════════════════════════════════════════════════════════════════════════════════

function ScheduleCard({ periodInfo, scheduleType }) {
  if (!periodInfo || !scheduleType) return (
    <Card locked>
      <CardHeader label="Bell Schedule" locked />
      <CardBody><p style={{ fontSize: 12, color: '#aaa' }}>Loading schedule…</p></CardBody>
    </Card>
  )

  const schedule = SCHEDULES[scheduleType]?.periods || []
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()

  function parseMins(t) {
    if (!t) return 0
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  function fmt12(t) {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <Card locked>
      <CardHeader label="Bell Schedule" tag={SCHEDULE_LABELS[scheduleType] || scheduleType} locked />
      <CardBody compact>
        {schedule.map((slot, i) => {
          const startM = parseMins(slot.start)
          const endM   = parseMins(slot.end)
          const isNow  = nowMins >= startM && nowMins < endM
          const isPast = nowMins >= endM
          const isBreak = slot.break || slot.label?.toLowerCase().includes('lunch') ||
                          slot.label?.toLowerCase().includes('brunch') ||
                          slot.label?.toLowerCase().includes('passing')
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 7px', borderRadius: 6, marginBottom: 2,
              background: isNow ? '#f0f8f4' : 'transparent',
              border: isNow ? `0.5px solid #c0dece` : '0.5px solid transparent',
              opacity: (isPast && !isNow) ? 0.38 : 1,
            }}>
              <span style={{
                fontSize: 12, fontWeight: 500, color: '#1a1a18', minWidth: 90,
                color: isBreak ? '#999' : '#1a1a18',
              }}>
                {slot.label}
              </span>
              <span style={{ fontSize: 11, color: '#999', flex: 1 }}>
                {fmt12(slot.start)} – {fmt12(slot.end)}
              </span>
              {isNow && (
                <span style={{
                  fontSize: 9, fontWeight: 500, color: RHS_GREEN, background: '#e0f0e8',
                  padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>now</span>
              )}
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}

function CalendarCard({ events }) {
  const today = new Date()
  const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  function labelFor(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    const diffDays = Math.round((d - new Date(today.toDateString())) / 86400000)
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays > 0 && diffDays < 7) return DAYS[d.getDay()]
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  }

  const displayEvents = (events || []).slice(0, 5)

  return (
    <Card locked>
      <CardHeader label="Calendar & Events" locked />
      <CardBody compact>
        {displayEvents.length === 0 ? (
          <p style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>No upcoming events</p>
        ) : displayEvents.map((ev, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '5px 0', borderBottom: i < displayEvents.length - 1 ? '0.5px solid #f0eeea' : 'none',
          }}>
            <span style={{ fontSize: 10, color: '#999', minWidth: 52, paddingTop: 1 }}>
              {labelFor(ev.date)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18', lineHeight: 1.4 }}>
              {ev.title}{ev.time ? ` · ${ev.time}` : ''}
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function ObjectivesCard({ objectives, loading }) {
  if (loading) return (
    <Card locked>
      <CardHeader label="Today's Class" locked />
      <CardBody><p style={{ fontSize: 12, color: '#aaa' }}>Loading…</p></CardBody>
    </Card>
  )

  if (!objectives) return (
    <Card locked>
      <CardHeader label="Today's Class" locked />
      <CardBody>
        <p style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>
          No objectives posted yet — check back soon.
        </p>
      </CardBody>
    </Card>
  )

  const items = Array.isArray(objectives.objectives) ? objectives.objectives : []

  return (
    <Card locked>
      <CardHeader label="Today's Class" tag={objectives.period ? `Period ${objectives.period}` : undefined} locked />
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: RHS_GREEN }}>
            {objectives.class_name || 'Class'}
          </span>
          {objectives.topic && (
            <span style={{ fontSize: 12, color: '#aaa' }}>{objectives.topic}</span>
          )}
        </div>
        {items.length > 0 && (
          <>
            <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ccc', marginBottom: 6 }}>
              Learning objectives
            </p>
            {items.map((obj, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: RHS_GREEN, minWidth: 16, flexShrink: 0, lineHeight: 1.55 }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.55 }}>{obj}</span>
              </div>
            ))}
          </>
        )}
        {objectives.do_now && (
          <div style={{
            background: '#f5f9f6', borderRadius: 7,
            borderLeft: `2.5px solid ${RHS_GREEN}`, borderTopLeftRadius: 3, borderBottomLeftRadius: 3,
            padding: '8px 11px', marginTop: 10,
          }}>
            <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: RHS_GREEN, marginBottom: 4 }}>
              Do Now
            </p>
            <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.55 }}>
              {objectives.do_now}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PERIOD HERO (top of right col, always shown)
// ════════════════════════════════════════════════════════════════════════════════

function PeriodHeroCard({ periodInfo, checkoutStatus, selfCheckoutEnabled, checkoutUrl }) {
  if (!periodInfo) return null
  const { status, current, minutesLeftInCurrent } = periodInfo

  const isPassOpen = checkoutStatus === 'ok' || checkoutStatus === 'warning20'
  const isFirst15  = checkoutStatus === 'first15'
  const isLast15   = checkoutStatus === 'last15'
  const isPassing  = status === 'break' || status === 'passing'

  let periodLabel = ''
  let timeDisplay = ''
  let sublabel    = ''

  if (status === 'period' && current) {
    periodLabel = current.label
    timeDisplay = minutesLeftInCurrent != null ? `${minutesLeftInCurrent}` : '—'
    sublabel    = `Bell at ${current.end ? (() => {
      const [h, m] = current.end.split(':').map(Number)
      return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    })() : '—'}`
  } else if (status === 'break' && current) {
    periodLabel = current.label
    timeDisplay = periodInfo.minutesUntilNext != null ? `${periodInfo.minutesUntilNext}` : '—'
    sublabel    = periodInfo.next ? `Next: ${periodInfo.next.label}` : ''
  } else if (status === 'before') {
    periodLabel = 'Before School'
    timeDisplay = periodInfo.minutesUntilNext != null ? `${periodInfo.minutesUntilNext}` : '—'
    sublabel    = periodInfo.next ? `${periodInfo.next.label} starts soon` : ''
  } else if (status === 'after') {
    periodLabel = 'School Day Complete'
    timeDisplay = '🎉'
    sublabel    = 'See you tomorrow!'
  }

  const showCheckout = selfCheckoutEnabled && status === 'period'
  const checkoutGray = !isPassOpen

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: RHS_GREEN, marginBottom: 3 }}>
            {periodLabel}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 42, fontWeight: 500, color: '#1a1a18', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {timeDisplay}
            </span>
            {status === 'period' && (
              <span style={{ fontSize: 13, color: '#888', marginLeft: 2 }}>min left</span>
            )}
            {(status === 'break' || status === 'before') && (
              <span style={{ fontSize: 13, color: '#888', marginLeft: 2 }}>min</span>
            )}
          </div>
          {sublabel && <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sublabel}</p>}
        </div>
        {showCheckout && (
          <div style={{ textAlign: 'right' }}>
            <a
              href={checkoutGray ? undefined : checkoutUrl}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: checkoutGray ? '#f0eeea' : RHS_GREEN,
                color: checkoutGray ? '#bbb' : 'white',
                fontSize: 11, fontWeight: 500, padding: '8px 14px', borderRadius: 7,
                border: checkoutGray ? '0.5px solid #e0ddd8' : 'none',
                textDecoration: 'none',
                pointerEvents: checkoutGray ? 'none' : 'auto',
                letterSpacing: '0.03em',
              }}
            >
              <i className="ti ti-door-exit" aria-hidden="true" style={{ fontSize: 13 }} />
              Self Check-Out
            </a>
            {checkoutGray && (
              <p style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
                {isFirst15 ? 'Not yet — first 15 min' : isLast15 ? 'Closed — last 15 min' : 'Unavailable'}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURABLE CARDS
// ════════════════════════════════════════════════════════════════════════════════

function WeatherCard({ weather }) {
  if (!weather) return null
  return (
    <Card>
      <CardHeader label="Weather · Riverdale" tag={fmtTime(new Date())} draggable />
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <div>
            <div style={{ fontSize: 44, fontWeight: 500, color: '#1a1a18', lineHeight: 1 }}>
              {Math.round(weather.temperature_2m)}°
            </div>
            <div style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
              Feels like {Math.round(weather.apparent_temperature)}°
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34, lineHeight: 1 }}>{weatherCodeToEmoji(weather.weather_code)}</div>
            <div style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>
              {weatherCodeToLabel(weather.weather_code)}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'Humidity', value: `${Math.round(weather.relative_humidity_2m)}%` },
            { label: 'Wind',     value: `${Math.round(weather.wind_speed_10m)} mph` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#f7f6f3', borderRadius: 6, padding: '6px 9px', border: '0.5px solid #eee' }}>
              <div style={{ fontSize: 9, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#222' }}>{value}</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function LunchCard({ menu, nextBellLabel }) {
  if (!menu || menu.length === 0) return null
  return (
    <Card>
      <CardHeader label="Brunch + Lunch" tag={nextBellLabel || 'Today'} draggable />
      <div style={{ padding: '8px 13px' }}>
        {menu.map((item, i) => (
          <div key={i} style={{
            fontSize: i === 0 ? 13 : 12, fontWeight: 500,
            color: i === 0 ? RHS_GREEN : '#222',
            padding: '5px 0',
            borderBottom: i < menu.length - 1 ? '0.5px solid #f0eeea' : 'none',
            lineHeight: 1.4,
          }}>
            {item}
          </div>
        ))}
      </div>
    </Card>
  )
}

function PassHistoryCard({ student, activePass, weekPassCount, weekPassTotal }) {
  if (!student) {
    return (
      <Card>
        <CardHeader label="Pass Status" draggable />
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.5 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#f0f8f4', border: '1px dashed #a0c8b0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="ti ti-qrcode" aria-hidden="true" style={{ fontSize: 20, color: RHS_GREEN }} />
            </div>
            <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
              Scan your QR code or NFC sticker to see your pass history
            </p>
          </div>
        </CardBody>
      </Card>
    )
  }

  // Active pass ring
  const elapsed = activePass
    ? Math.floor((Date.now() - new Date(activePass.time_out).getTime()) / 60000)
    : null
  const ringPct = elapsed != null ? Math.min(elapsed / 15, 1) : 0
  const circumference = 2 * Math.PI * 18
  const ringColor = elapsed == null ? '#e0f0e8'
    : elapsed < 10 ? RHS_GREEN
    : elapsed < 15 ? '#d97706'
    : '#dc2626'

  return (
    <Card>
      <CardHeader
        label={activePass ? 'Pass Active' : 'Pass Status'}
        tag={activePass ? 'Out of class' : 'In class'}
        draggable
      />
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activePass ? (
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="26" cy="26" r="18" fill="none" stroke="#e0f0e8" strokeWidth="5" />
                <circle cx="26" cy="26" r="18" fill="none" stroke={ringColor} strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - ringPct)} />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: ringColor, fontVariantNumeric: 'tabular-nums' }}>
                  {elapsed != null ? `${elapsed}m` : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#f0f8f4', border: `1.5px solid #c8e6d4`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 22, color: RHS_GREEN }} />
            </div>
          )}
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a18' }}>{student.full_name}</p>
            {activePass && (
              <p style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{activePass.reason}</p>
            )}
            <p style={{ fontSize: 10, color: RHS_GREEN, marginTop: 3 }}>
              {weekPassCount != null ? `${ordinal(weekPassCount)} pass this week` : ''}
              {weekPassTotal ? ` · ${weekPassTotal} min total` : ''}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function FortuneCard({ fortune }) {
  if (!fortune) return null
  return (
    <div style={{
      background: '#faf6ed', borderRadius: 10,
      border: '0.5px solid #e8e0cc', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 13px', borderBottom: '0.5px solid #e8e0cc',
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#a07820' }}>
          <i className="ti ti-sparkles" aria-hidden="true" style={{ fontSize: 11, marginRight: 5 }} />
          Fortune Cookie Finds
        </span>
        <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#d4c090', cursor: 'grab' }} />
      </div>
      <div style={{ padding: '11px 13px' }}>
        <p style={{ fontSize: 13, color: '#3a2a05', lineHeight: 1.65, fontStyle: 'italic', marginBottom: 6 }}>
          "{fortune.text}"
        </p>
        {fortune.source && (
          <p style={{ fontSize: 10, color: '#b09040', letterSpacing: '0.06em' }}>
            — {fortune.source}
          </p>
        )}
        <p style={{ fontSize: 9, color: '#c0a840', letterSpacing: '0.06em', marginTop: fortune.source ? 2 : 0 }}>
          {fmtDateLong(new Date())}
        </p>
      </div>
    </div>
  )
}

function CowboyCodeCard({ trait }) {
  if (!trait) return null
  return (
    <div style={{
      background: '#f5f8f5', borderRadius: 10,
      border: '0.5px solid #d0e4d8', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 13px', borderBottom: '0.5px solid #d0e4d8',
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: RHS_GREEN }}>
          <i className="ti ti-star" aria-hidden="true" style={{ fontSize: 11, marginRight: 5 }} />
          Cowboy Code
        </span>
        <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#b0ccc0', cursor: 'grab' }} />
      </div>
      <div style={{ padding: '12px 13px', textAlign: 'center' }}>
        <p style={{ fontSize: 20, fontWeight: 500, color: RHS_GREEN, marginBottom: 5 }}>{trait.trait}</p>
        <p style={{ fontSize: 12, color: '#444', lineHeight: 1.55 }}>{trait.definition}</p>
        <p style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 8 }}>
          Character trait of the week
        </p>
      </div>
    </div>
  )
}

function ReleasesCard({ releases }) {
  if (!releases || releases.length === 0) return null
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  function fmtRel(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    const diffDays = Math.round((d - new Date(today.toDateString())) / 86400000)
    if (diffDays === 0) return `Today · ${DAYS[d.getDay()]}`
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays < 7) return DAYS[d.getDay()]
    return `${DAYS[d.getDay()]} ${d.getDate()}`
  }
  return (
    <Card>
      <CardHeader label="Release Times · This Week" draggable />
      <div style={{ padding: '7px 13px' }}>
        {releases.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 0', borderBottom: i < releases.length - 1 ? '0.5px solid #f0eeea' : 'none',
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>{fmtRel(r.date)}</div>
              {r.note && <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{r.note}</div>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: RHS_GREEN, whiteSpace: 'nowrap' }}>
              {r.time}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SportsCard({ sports }) {
  if (!sports || sports.length === 0) return null
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  function fmtSport(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    const diffDays = Math.round((d - new Date(today.toDateString())) / 86400000)
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays < 7) return DAYS[d.getDay()]
    return `${DAYS[d.getDay()]} ${d.getDate()}`
  }
  return (
    <Card>
      <CardHeader label="Sports · This Week" draggable />
      <div style={{ padding: '7px 13px' }}>
        {sports.slice(0, 4).map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 0', borderBottom: i < Math.min(sports.length, 4) - 1 ? '0.5px solid #f0eeea' : 'none',
          }}>
            <span style={{ fontSize: 10, color: '#999', minWidth: 42 }}>{fmtSport(s.date)}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18', flex: 1 }}>
              {s.team} {s.home_away === 'away' ? '@' : 'vs.'} {s.opponent}
            </span>
            <span style={{ fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>
              {s.home_away === 'home' ? 'Home' : 'Away'} · {s.time}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function BirthdaysCard({ birthdays }) {
  if (!birthdays || birthdays.length === 0) return null
  return (
    <Card>
      <CardHeader label="Birthdays" draggable />
      <CardBody compact>
        {birthdays.map((b, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 0', borderBottom: i < birthdays.length - 1 ? '0.5px solid #f0eeea' : 'none',
          }}>
            <span style={{ fontSize: 16 }}>🎂</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>{b.name}</div>
              {b.note && <div style={{ fontSize: 10, color: '#aaa' }}>{b.note}</div>}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function CountdownsCard({ countdowns }) {
  if (!countdowns || countdowns.length === 0) return null
  const today = new Date()
  function daysUntil(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return Math.max(0, Math.round((d - new Date(today.toDateString())) / 86400000))
  }
  return (
    <Card>
      <CardHeader label="Countdowns" draggable />
      <div style={{ padding: '7px 13px' }}>
        {countdowns.map((c, i) => {
          const days = daysUntil(c.target_date)
          const soon = days <= 14
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0', borderBottom: i < countdowns.length - 1 ? '0.5px solid #f0eeea' : 'none',
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>{c.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: soon ? '#b06010' : RHS_GREEN, whiteSpace: 'nowrap' }}>
                {days === 0 ? 'Today!' : `${days} days`}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function FunFactCard({ fact }) {
  if (!fact) return null
  return (
    <Card>
      <CardHeader label="Fun Fact" draggable />
      <CardBody>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
          <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.6 }}>{fact}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function NewsCard({ news }) {
  if (!news || news.length === 0) return null
  return (
    <Card>
      <CardHeader label="School News" draggable />
      <CardBody compact>
        {news.slice(0, 3).map((n, i) => (
          <div key={i} style={{
            padding: '6px 0', borderBottom: i < Math.min(news.length, 3) - 1 ? '0.5px solid #f0eeea' : 'none',
          }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18', lineHeight: 1.4, marginBottom: 2 }}>
              {n.headline}
            </p>
            {n.body && <p style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>{n.body}</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function AdCard({ ad }) {
  if (!ad) return null
  return (
    <div style={{ background: RHS_GREEN, borderRadius: 10, padding: '13px 13px' }}>
      <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>
        {ad.category || 'Announcement'}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'white', marginBottom: 3 }}>{ad.title}</p>
      {ad.subtitle && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{ad.subtitle}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// CONFIG PANEL (settings drawer)
// ════════════════════════════════════════════════════════════════════════════════

function ConfigPanel({ prefs, setPrefs, open, setOpen }) {
  function toggle(id) {
    const reg = COMPONENT_REGISTRY.find(c => c.id === id)
    if (!reg || reg.alwaysOn) return
    setPrefs(p => ({
      ...p,
      enabled: { ...p.enabled, [id]: !p.enabled[id] },
    }))
  }

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Customize your display"
        style={{
          position: 'fixed', bottom: 16, right: 16,
          width: 40, height: 40, borderRadius: '50%',
          background: open ? '#1a1a18' : RHS_GREEN,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 100,
          transition: 'background 0.15s',
        }}
      >
        <i className={`ti ${open ? 'ti-x' : 'ti-settings'}`} aria-hidden="true"
           style={{ fontSize: 18, color: 'white' }} />
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 66, right: 16,
          width: 300, background: 'white',
          borderRadius: 12, border: '0.5px solid #e0ddd8',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 99,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0eeea' }}>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>
              Your display
            </p>
            <p style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
              Toggle cards on or off · locked items always show
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: 8, gap: 2 }}>
            {/* Locked items */}
            {['Schedule','Calendar','Objectives'].map(label => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`ti ${label === 'Schedule' ? 'ti-calendar-week' : label === 'Calendar' ? 'ti-calendar-event' : 'ti-notebook'}`}
                     aria-hidden="true" style={{ fontSize: 15, color: RHS_GREEN }} />
                </div>
                <span style={{ fontSize: 9, color: RHS_GREEN, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                <div style={{ width: 28, height: 14, background: '#e0ece6', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 9, color: RHS_GREEN }} />
                </div>
              </div>
            ))}
            {/* Configurable items */}
            {COMPONENT_REGISTRY.map(c => {
              const isOn = prefs.enabled[c.id]
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 4px', background: 'none', border: 'none', cursor: c.alwaysOn ? 'default' : 'pointer',
                    borderRadius: 8,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isOn ? '#f0f8f4' : '#f5f5f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`ti ${c.icon}`} aria-hidden="true"
                       style={{ fontSize: 15, color: isOn ? RHS_GREEN : '#ccc' }} />
                  </div>
                  <span style={{ fontSize: 9, color: isOn ? '#555' : '#bbb', textAlign: 'center', lineHeight: 1.3 }}>
                    {c.label}
                  </span>
                  {c.alwaysOn ? (
                    <div style={{ width: 28, height: 14, background: '#e0ece6', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 9, color: RHS_GREEN }} />
                    </div>
                  ) : (
                    <div style={{
                      width: 28, height: 14, borderRadius: 7, position: 'relative',
                      background: isOn ? RHS_GREEN : '#ddd',
                      transition: 'background 0.15s',
                    }}>
                      <div style={{
                        position: 'absolute', top: 2,
                        left: isOn ? 'calc(100% - 12px)' : 2,
                        width: 10, height: 10, borderRadius: '50%', background: 'white',
                        transition: 'left 0.15s',
                      }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE CONTENT
// ════════════════════════════════════════════════════════════════════════════════

function WireContent() {
  const searchParams = useSearchParams()
  const rawUid  = searchParams.get('uid') || ''
  const roomParam = searchParams.get('room') || ''
  const uid = normalizeUid(rawUid)

  // ── Clock ──────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(null) // null until mounted (avoids hydration mismatch)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Schedule ───────────────────────────────────────────────────────────────
  const [scheduleType, setScheduleType] = useState(null)  // string key e.g. 'regular'
  const [scheduleObj,  setScheduleObj]  = useState(null)  // { name, periods } object
  const [periodInfo,   setPeriodInfo]   = useState(null)
  const [checkoutStatus, setCheckoutStatus] = useState('ok')

  useEffect(() => {
    async function loadSchedule() {
      const result = await fetchTodayScheduleType()
      setScheduleType(result?.type || null)
      setScheduleObj(result?.schedule || null)
    }
    loadSchedule()
  }, [])

  useEffect(() => {
    if (!scheduleObj) return
    function tick() {
      const info = getCurrentPeriodInfo(scheduleObj)
      const cs   = getCheckoutStatus(info)
      setPeriodInfo(info)
      setCheckoutStatus(cs)
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [scheduleObj])

  // ── Teacher + student lookup ───────────────────────────────────────────────
  const [teacher,  setTeacher]  = useState(null)
  const [student,  setStudent]  = useState(null)
  const [activePass, setActivePass] = useState(null)
  const [weekPassCount, setWeekPassCount] = useState(null)
  const [weekPassTotal, setWeekPassTotal] = useState(null)
  const [objectives, setObjectives] = useState(null)
  const [objectivesLoading, setObjectivesLoading] = useState(true)
  const [selfCheckoutEnabled, setSelfCheckoutEnabled] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState(SELF_CHECKOUT_BASE)

  useEffect(() => {
    async function load() {
      let resolvedRoom = roomParam
      let resolvedTeacher = null
      let resolvedStudent = null

      // 1. Look up student by UID
      if (uid) {
        const { data: stu } = await supabase
          .from('students')
          .select('*')
          .eq('nfc_uid', uid)
          .single()
        if (stu) {
          resolvedStudent = stu
          setStudent(stu)
          // Get their active period to find room
          if (!resolvedRoom) {
            const period = periodInfo?.current?.covers?.[0] || periodInfo?.current?.value || '1'
            const { data: sp } = await supabase
              .from('student_periods')
              .select('room, period')
              .eq('student_id', stu.id)
              .eq('period', period)
              .single()
            if (sp) resolvedRoom = sp.room
          }
        }
      }

      // 2. Look up teacher by room
      if (resolvedRoom) {
        const { data: t } = await supabase
          .from('teachers')
          .select('*')
          .ilike('room', `%${resolvedRoom}%`)
          .eq('is_active', true)
          .single()
        if (t) {
          resolvedTeacher = t
          setTeacher(t)
        }
      }

      // 3. Self-checkout enabled?
      if (resolvedRoom) {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', `self_checkout_enabled_${resolvedRoom}`)
          .single()
        const enabled = setting?.value === 'true' || setting?.value === true
        setSelfCheckoutEnabled(enabled)
        const url = `${SELF_CHECKOUT_BASE}?room=${resolvedRoom}${uid ? `&uid=${uid}` : ''}`
        setCheckoutUrl(url)
      }

      // 4. Student's pass history this week
      if (resolvedStudent) {
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday
        weekStart.setHours(0, 0, 0, 0)

        const { data: passes } = await supabase
          .from('passes')
          .select('*')
          .eq('student_id', resolvedStudent.id)
          .gte('time_out', weekStart.toISOString())
          .order('time_out', { ascending: false })

        if (passes) {
          // Active pass = most recent with no time_in
          const active = passes.find(p => !p.time_in)
          setActivePass(active || null)
          // Week count
          setWeekPassCount(passes.length)
          // Total minutes
          const completedMins = passes
            .filter(p => p.time_in)
            .reduce((acc, p) => acc + Math.round((new Date(p.time_in) - new Date(p.time_out)) / 60000), 0)
          setWeekPassTotal(completedMins)
        }
      }

      // 5. Objectives
      setObjectivesLoading(true)
      if (resolvedTeacher) {
        const period = periodInfo?.current?.covers?.[0] || periodInfo?.current?.value || null
        let q = supabase
          .from('teacher_objectives')
          .select('*')
          .eq('teacher_id', resolvedTeacher.id)
          .order('updated_at', { ascending: false })
          .limit(1)
        if (period) q = q.eq('period', String(period))
        const { data: obj } = await q
        setObjectives(obj?.[0] || null)
      } else {
        setObjectives(null)
      }
      setObjectivesLoading(false)
    }
    load()
  }, [uid, roomParam, periodInfo?.current?.value])

  // ── Weather ────────────────────────────────────────────────────────────────
  const [weather, setWeather] = useState(null)
  useEffect(() => {
    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
        const res = await fetch(url)
        const json = await res.json()
        setWeather(json.current)
      } catch (e) { /* graceful fallback — card won't render */ }
    }
    fetchWeather()
    const id = setInterval(fetchWeather, 600000) // every 10 min
    return () => clearInterval(id)
  }, [])

  // ── Calendar (via /api/calendar → RHS Events iCal) ────────────────────────
  const [calendarEvents, setCalendarEvents] = useState([])
  useEffect(() => {
    async function fetchCal() {
      try {
        const res = await fetch('/api/calendar')
        const json = await res.json()
        setCalendarEvents((json.events || []).slice(0, 6))
      } catch (e) { /* graceful fallback: card stays empty */ }
    }
    fetchCal()
    const id = setInterval(fetchCal, 1800000) // refresh every 30 min
    return () => clearInterval(id)
  }, [])

  // ── Lunch ──────────────────────────────────────────────────────────────────
  const [menu, setMenu] = useState([])
  useEffect(() => {
    if (!CW_MENU_URL) return
    async function fetchMenu() {
      try {
        const res = await fetch(CW_MENU_URL)
        const json = await res.json()
        const items = Array.isArray(json) ? json : json.menu || json.items || []
        setMenu(items.filter(Boolean).slice(0, 5))
      } catch (e) { /* fallback: card won't render */ }
    }
    fetchMenu()
    const id = setInterval(fetchMenu, 3600000) // every hour
    return () => clearInterval(id)
  }, [])

  // ── Supabase content tables ────────────────────────────────────────────────
  const [cwFortune,    setCwFortune]    = useState(null)
  const [cwSports,     setCwSports]     = useState([])
  const [cwAds,        setCwAds]        = useState([])
  const [cwCountdowns, setCwCountdowns] = useState([])
  const [cwReleases,   setCwReleases]   = useState([])
  const [cwNews,       setCwNews]       = useState([])
  const [cwFunFact,    setCwFunFact]    = useState(null)
  const [cwBirthdays,  setCwBirthdays]  = useState([])
  const [adIndex,      setAdIndex]      = useState(0)

  useEffect(() => {
    const today = new Date()
    const doy   = dayOfYear(today)
    const woy   = weekOfYear(today)

    async function loadAll() {
      // Fortunes — try DB first, fall back to built-in
      try {
        const { data: fortunes } = await supabase
          .from('cw_fortunes')
          .select('text, source')
          .eq('active', true)
        if (fortunes?.length) {
          setCwFortune(fortunes[doy % fortunes.length])
        } else {
          setCwFortune({ text: BUILTIN_FORTUNES[doy % BUILTIN_FORTUNES.length] })
        }
      } catch {
        setCwFortune({ text: BUILTIN_FORTUNES[doy % BUILTIN_FORTUNES.length] })
      }

      // Sports — next 7 days
      try {
        const next7 = new Date(today); next7.setDate(today.getDate() + 7)
        const { data } = await supabase
          .from('cw_sports')
          .select('*')
          .gte('date', today.toISOString().slice(0, 10))
          .lte('date', next7.toISOString().slice(0, 10))
          .order('date')
          .limit(6)
        setCwSports(data || [])
      } catch { setCwSports([]) }

      // Ads — active, ordered
      try {
        const { data } = await supabase
          .from('cw_ads')
          .select('*')
          .eq('active', true)
          .order('order_num')
        setCwAds(data || [])
      } catch { setCwAds([]) }

      // Countdowns — active future dates
      try {
        const { data } = await supabase
          .from('cw_countdowns')
          .select('*')
          .eq('active', true)
          .gte('target_date', today.toISOString().slice(0, 10))
          .order('target_date')
          .limit(5)
        setCwCountdowns(data || [])
      } catch { setCwCountdowns([]) }

      // Releases — this week + next 7 days
      try {
        const next7 = new Date(today); next7.setDate(today.getDate() + 7)
        const { data } = await supabase
          .from('cw_releases')
          .select('*')
          .gte('date', today.toISOString().slice(0, 10))
          .lte('date', next7.toISOString().slice(0, 10))
          .order('date')
        setCwReleases(data || [])
      } catch { setCwReleases([]) }

      // News — active
      try {
        const { data } = await supabase
          .from('cw_news')
          .select('*')
          .eq('active', true)
          .order('published_at', { ascending: false })
          .limit(3)
        setCwNews(data || [])
      } catch { setCwNews([]) }

      // Fun facts — daily rotation
      try {
        const { data } = await supabase
          .from('cw_fun_facts')
          .select('text')
          .eq('active', true)
        if (data?.length) setCwFunFact(data[doy % data.length].text)
      } catch { setCwFunFact(null) }

      // Birthdays — today and tomorrow
      try {
        const mm = String(today.getMonth() + 1).padStart(2, '0')
        const dd = String(today.getDate()).padStart(2, '0')
        const tom = new Date(today); tom.setDate(today.getDate() + 1)
        const mm2 = String(tom.getMonth() + 1).padStart(2, '0')
        const dd2 = String(tom.getDate()).padStart(2, '0')
        const { data } = await supabase
          .from('cw_birthdays')
          .select('name, date, note')
          .in('month_day', [`${mm}-${dd}`, `${mm2}-${dd2}`])
        setCwBirthdays(data || [])
      } catch { setCwBirthdays([]) }
    }

    loadAll()
  }, [])

  // Ad rotation every 12 seconds
  useEffect(() => {
    if (cwAds.length <= 1) return
    const id = setInterval(() => setAdIndex(i => (i + 1) % cwAds.length), 12000)
    return () => clearInterval(id)
  }, [cwAds.length])

  // ── Prefs (localStorage) ───────────────────────────────────────────────────
  const [prefs, setPrefs] = useState(getDefaultPrefs())
  const [configOpen, setConfigOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY)
      if (saved) setPrefs({ ...getDefaultPrefs(), ...JSON.parse(saved) })
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
  }, [prefs])

  // ── Status bar helpers ─────────────────────────────────────────────────────
  function statusBarStyle() {
    if (checkoutStatus === 'first15' || checkoutStatus === 'last15') return { background: '#b91c1c' }
    if (checkoutStatus === 'warning20') return { background: '#92400e' }
    return { background: RHS_DARK }
  }
  function statusText() {
    if (!periodInfo) return 'Loading…'
    const { status, current, minutesLeftInCurrent } = periodInfo
    if (checkoutStatus === 'first15') {
      const [h, m] = (current?.start || '00:00').split(':').map(Number)
      const openMins = h * 60 + m + 15
      const oh = Math.floor(openMins / 60), om = openMins % 60
      return `No passes · first 15 min · opens at ${oh % 12 || 12}:${om.toString().padStart(2,'0')} ${oh >= 12 ? 'PM' : 'AM'}`
    }
    if (checkoutStatus === 'last15') return `No passes · last 15 min of period`
    if (checkoutStatus === 'warning20') return `Passes open · ${minutesLeftInCurrent} min left · last call approaching`
    if (checkoutStatus === 'ok') return `Passes open · safe window · ${minutesLeftInCurrent} min left in period`
    if (status === 'break' || status === 'passing') return `${current?.label || 'Break'} · no passes during transitions`
    if (status === 'before') return 'Before school · no passes yet'
    if (status === 'after') return 'School day complete'
    return 'Loading…'
  }
  function statusRight() {
    if (!periodInfo || !periodInfo.current) return ''
    const { status, current } = periodInfo
    if ((checkoutStatus === 'first15' || checkoutStatus === 'ok' || checkoutStatus === 'warning20') && current?.end) {
      const [h, m] = current.end.split(':').map(Number)
      return `Bell at ${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
    }
    if (checkoutStatus === 'last15' && current?.end) {
      const [h, m] = current.end.split(':').map(Number)
      return `Bell at ${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
    }
    return ''
  }

  // ── Lunch bell label ───────────────────────────────────────────────────────
  function lunchBellLabel() {
    if (!scheduleType || !SCHEDULES[scheduleType]) return 'Today'
    const slots = SCHEDULES[scheduleType]?.periods || []
    const lunch = slots.find(s => s.label?.toLowerCase().includes('lunch'))
    if (!lunch) return 'Today'
    const [h, m] = (lunch.start || '12:00').split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  // ── Cowboy code for this week ──────────────────────────────────────────────
  const weekTrait = COWBOY_CODE[weekOfYear(now || new Date()) % COWBOY_CODE.length]

  // ── Right column slot renderer ─────────────────────────────────────────────
  const slotData = {
    weather:     weather,
    lunch:       menu.length > 0 ? menu : null,
    passHistory: true, // always render (card shows generic state if no student)
    fortune:     cwFortune,
    cowboyCode:  weekTrait,
    releases:    cwReleases.length > 0 ? cwReleases : null,
    countdowns:  cwCountdowns.length > 0 ? cwCountdowns : null,
    sports:      cwSports.length > 0 ? cwSports : null,
    birthdays:   cwBirthdays.length > 0 ? cwBirthdays : null,
    funFacts:    cwFunFact,
    news:        cwNews.length > 0 ? cwNews : null,
    ads:         cwAds.length > 0 ? cwAds[adIndex % cwAds.length] : null,
  }

  function renderSlot(id) {
    if (!prefs.enabled[id]) return null
    const d = slotData[id]
    // Data-driven fallback: skip if data is null/empty (card won't mount)
    if (d === null && id !== 'passHistory') return null
    switch (id) {
      case 'weather':     return <WeatherCard key={id} weather={d} />
      case 'lunch':       return <LunchCard key={id} menu={d} nextBellLabel={lunchBellLabel()} />
      case 'passHistory': return <PassHistoryCard key={id} student={student} activePass={activePass} weekPassCount={weekPassCount} weekPassTotal={weekPassTotal} />
      case 'fortune':     return <FortuneCard key={id} fortune={d} />
      case 'cowboyCode':  return <CowboyCodeCard key={id} trait={d} />
      case 'releases':    return <ReleasesCard key={id} releases={d} />
      case 'countdowns':  return <CountdownsCard key={id} countdowns={d} />
      case 'sports':      return <SportsCard key={id} sports={d} />
      case 'birthdays':   return <BirthdaysCard key={id} birthdays={d} />
      case 'funFacts':    return <FunFactCard key={id} fact={d} />
      case 'news':        return <NewsCard key={id} news={d} />
      case 'ads':         return <AdCard key={id} ad={d} />
      default:            return null
    }
  }

  const displayNow = now || new Date()

  return (
    <div style={{ minHeight: '100vh', background: '#f0eeea', fontFamily: '-apple-system, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: RHS_GREEN, padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.18)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-shield-star" aria-hidden="true" style={{ color: 'white', fontSize: 18 }} />
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
              Riverdale High School · {teacher ? `Room ${teacher.room} · ${teacher.full_name || ''}` : roomParam ? `Room ${roomParam}` : 'Cowboy Wire'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 }}>
              Cowboy Wire · Student Display
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'white', fontSize: 28, fontWeight: 500, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', lineHeight: 1 }}>
            {now ? fmtTime(now) : '—:—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
            {now ? fmtDateLong(now) : ''}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          {periodInfo?.status === 'period' && periodInfo.current && (
            <>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
                {periodInfo.current.label}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 }}>
                {SCHEDULE_LABELS[scheduleType] || scheduleType || ''}
              </div>
            </>
          )}
          {periodInfo?.status === 'break' && (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>
              {periodInfo.current?.label || 'Break'}
            </div>
          )}
        </div>
      </div>

      {/* ── STATUS BAR (15-min rule) ────────────────────────────────────────── */}
      <div style={{
        ...statusBarStyle(),
        padding: '7px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: (checkoutStatus === 'first15' || checkoutStatus === 'last15') ? '#f87171' : '#5dca8a',
          }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 500 }}>
            {statusText()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {statusRight() && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{statusRight()}</span>
          )}
          {selfCheckoutEnabled && periodInfo?.status === 'period' && (
            <a
              href={(checkoutStatus === 'ok' || checkoutStatus === 'warning20') ? checkoutUrl : undefined}
              style={{
                background: 'white',
                color: (checkoutStatus === 'ok' || checkoutStatus === 'warning20') ? RHS_GREEN : 'rgba(255,255,255,0.35)',
                background: (checkoutStatus === 'ok' || checkoutStatus === 'warning20') ? 'white' : 'rgba(255,255,255,0.12)',
                fontSize: 11, fontWeight: 500, padding: '4px 11px', borderRadius: 6,
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                pointerEvents: (checkoutStatus === 'ok' || checkoutStatus === 'warning20') ? 'auto' : 'none',
                letterSpacing: '0.03em',
              }}
            >
              <i className="ti ti-door-exit" aria-hidden="true" style={{ fontSize: 12 }} />
              Self Check-Out
            </a>
          )}
        </div>
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        padding: '10px 14px',
        flex: 1,
        alignItems: 'start',
      }}>

        {/* LEFT — Locked column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ScheduleCard periodInfo={periodInfo} scheduleType={scheduleType} />
          <CalendarCard events={calendarEvents} />
          <ObjectivesCard objectives={objectives} loading={objectivesLoading} />
        </div>

        {/* RIGHT — Configurable column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PeriodHeroCard
            periodInfo={periodInfo}
            checkoutStatus={checkoutStatus}
            selfCheckoutEnabled={selfCheckoutEnabled}
            checkoutUrl={checkoutUrl}
          />
          {prefs.order.map(id => renderSlot(id))}
        </div>

      </div>

      {/* ── CONFIG PANEL ───────────────────────────────────────────────────── */}
      <ConfigPanel prefs={prefs} setPrefs={setPrefs} open={configOpen} setOpen={setConfigOpen} />

    </div>
  )
}

// Suspense wrapper (required for useSearchParams in Next.js)
export default function WirePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f0eeea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#aaa' }}>Loading Cowboy Wire…</div>
      </div>
    }>
      <WireContent />
    </Suspense>
  )
}
