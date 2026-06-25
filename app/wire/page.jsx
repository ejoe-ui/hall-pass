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
import { useState, useEffect, useRef, useCallback, Suspense, memo } from 'react'
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

// ── Words of Wisdom (rotates weekly) ─────────────────────────────────────────
const WORDS_OF_WISDOM = [
  { quote: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "Plutarch" },
  { quote: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
  { quote: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { quote: "Two roads diverged in a wood, and I took the one less traveled by.", author: "Robert Frost" },
  { quote: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { quote: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { quote: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
]

// ── Word of the Day (rotates daily) ──────────────────────────────────────────
const WORD_OF_DAY = [
  { word: "Perseverance", pos: "noun", def: "Steadfastness despite difficulty or slow progress." },
  { word: "Resilience",   pos: "noun", def: "The ability to recover quickly from setbacks or hard times." },
  { word: "Integrity",    pos: "noun", def: "The quality of being honest and having strong moral principles." },
  { word: "Tenacity",     pos: "noun", def: "The quality of holding firm to a purpose; determined persistence." },
  { word: "Empathy",      pos: "noun", def: "The ability to understand and share the feelings of another person." },
  { word: "Ambition",     pos: "noun", def: "A strong desire to achieve something, typically requiring hard work." },
  { word: "Diligence",    pos: "noun", def: "Careful, steady effort and attention to work." },
  { word: "Eloquent",     pos: "adj.",  def: "Fluent and persuasive in speaking or writing." },
  { word: "Innovative",   pos: "adj.",  def: "Featuring new ideas or methods; original and creative." },
  { word: "Collaborate",  pos: "verb",  def: "To work jointly with others toward a shared goal." },
  { word: "Meticulous",   pos: "adj.",  def: "Showing great attention to detail; very careful and precise." },
  { word: "Advocate",     pos: "verb",  def: "To publicly support or recommend a particular cause or policy." },
  { word: "Exemplary",    pos: "adj.",  def: "Serving as a desirable model; representing the best of its kind." },
  { word: "Fortitude",    pos: "noun",  def: "Courage and strength in facing difficulty or adversity." },
  { word: "Astute",       pos: "adj.",  def: "Having an ability to accurately assess situations or people; shrewd." },
  { word: "Candid",       pos: "adj.",  def: "Truthful and straightforward; frank without sugarcoating." },
  { word: "Eloquence",    pos: "noun",  def: "The power of effective, persuasive, or beautiful speech or writing." },
  { word: "Benevolent",   pos: "adj.",  def: "Well-meaning and kindly toward others." },
  { word: "Proactive",    pos: "adj.",  def: "Creating or controlling a situation rather than just responding to it." },
  { word: "Pragmatic",    pos: "adj.",  def: "Dealing with things sensibly and realistically; practical." },
]

// ── History Drops (rotates daily) ────────────────────────────────────────────
const HISTORY_DROPS = [
  { year: "1969", fact: "Apollo 11 lands on the moon. Neil Armstrong becomes the first human to walk on the lunar surface, watched by 600 million people on TV." },
  { year: "1863", fact: "Abraham Lincoln delivers the Gettysburg Address — a 272-word speech that redefined the purpose of the Civil War and American democracy." },
  { year: "1955", fact: "Rosa Parks refuses to give up her bus seat in Montgomery, Alabama, sparking a 381-day bus boycott that becomes a turning point in the Civil Rights Movement." },
  { year: "1903", fact: "The Wright Brothers make the first powered airplane flight at Kitty Hawk, NC — 12 seconds, 120 feet. 66 years later, humans are on the moon." },
  { year: "1989", fact: "The Berlin Wall falls, reuniting East and West Germany and symbolizing the end of the Cold War after 28 years of division." },
  { year: "1776", fact: "The Declaration of Independence is adopted, establishing that 'all men are created equal' — the founding idea that America has been working to live up to ever since." },
  { year: "1920", fact: "The 19th Amendment is ratified, giving women the right to vote in the United States after more than 70 years of activism." },
  { year: "1947", fact: "Jackie Robinson breaks Major League Baseball's color barrier, joining the Brooklyn Dodgers and changing American sports — and culture — forever." },
  { year: "1928", fact: "Alexander Fleming discovers penicillin by accident after leaving petri dishes out over a weekend. The antibiotic goes on to save an estimated 200 million lives." },
  { year: "1984", fact: "Apple introduces the Macintosh with a famous Super Bowl ad. The personal computer revolution shifts from hobbyists to everyday people." },
  { year: "1849", fact: "The California Gold Rush brings 300,000 people to California, transforming it from a frontier territory into a state — and reshaping the American West forever." },
  { year: "1965", fact: "NASA's Mariner 4 sends the first close-up photographs of Mars back to Earth — 22 grainy images that show craters and confirm Mars has a thin atmosphere." },
  { year: "1912", fact: "The Titanic sinks in the North Atlantic. The disaster leads to major reforms in maritime safety, including enough lifeboats for all passengers on every ship." },
  { year: "1991", fact: "The World Wide Web becomes publicly available. Tim Berners-Lee's invention would change how humans communicate, learn, shop, and connect — forever." },
  { year: "1963", fact: "Dr. Martin Luther King Jr. delivers his 'I Have a Dream' speech in front of 250,000 people in Washington, D.C. — one of the most powerful speeches in American history." },
]

// ── Business Facts (rotates daily) ───────────────────────────────────────────
const BIZ_FACTS = [
  { fact: "Amazon started in a garage in 1994 selling just books. Today it's one of the most valuable companies in the world." },
  { fact: "The average millionaire has 7 streams of income. Diversifying how you earn is a key financial strategy." },
  { fact: "Apple was worth about $2 when Steve Jobs was ousted in 1985. When he returned in 1997, he turned it into the world's first $3 trillion company." },
  { fact: "It costs 5x more to get a new customer than to keep an existing one. That's why great customer service is a business superpower." },
  { fact: "Warren Buffett bought his first stock at age 11 — 6 shares of Cities Service Preferred at $38 each. He's been investing ever since." },
  { fact: "About 20% of new businesses fail in their first year, but those that make it to year 5 have learned something most people never teach." },
  { fact: "The word 'salary' comes from the Latin 'salarium' — Roman soldiers were sometimes paid in salt because it was so valuable." },
  { fact: "Nike's 'swoosh' logo was designed by a college student for $35 in 1971. Phil Knight wasn't even sure he liked it at first." },
  { fact: "The stock market has returned an average of about 10% per year over the long term. $1,000 invested at 18 becomes over $45,000 by retirement." },
  { fact: "95% of products launched each year fail. The ones that succeed usually solve a real problem people actually have." },
  { fact: "Compound interest is called the '8th wonder of the world' by many investors — small amounts invested early grow dramatically over time." },
  { fact: "Starbucks was originally a tea company. The founders nearly didn't go into coffee — and Howard Schultz had to convince them." },
  { fact: "You spend roughly 90,000 hours working over a lifetime. Choosing work you care about is one of the best decisions you can make." },
  { fact: "The first ATM was installed in London in 1967. Banks thought customers would never trust a machine with their money." },
  { fact: "Entrepreneurship doesn't require money — it requires solving problems. Many of the most successful businesses started with an idea, not capital." },
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
  { id: 'wisdom',      label: 'Words of Wisdom',  icon: 'ti-quote',          defaultOn: true,  alwaysOn: false },
  { id: 'wordOfDay',   label: 'Word of the Day',  icon: 'ti-book-2',         defaultOn: true,  alwaysOn: false },
  { id: 'historyDrop', label: 'History Drop',     icon: 'ti-world',          defaultOn: false, alwaysOn: false },
  { id: 'bizFacts',    label: 'Business Facts',   icon: 'ti-chart-bar',      defaultOn: false, alwaysOn: false },
  { id: 'funFacts',    label: 'Fun Facts',        icon: 'ti-bulb',           defaultOn: false, alwaysOn: false },
  { id: 'releases',    label: 'Release Times',    icon: 'ti-clock-play',     defaultOn: false, alwaysOn: false },
  { id: 'sports',      label: 'Sports',           icon: 'ti-trophy',         defaultOn: false, alwaysOn: false },
  { id: 'birthdays',   label: 'Birthdays',        icon: 'ti-cake',           defaultOn: true,  alwaysOn: false },
  { id: 'teacherMsg',  label: 'Teacher Messages', icon: 'ti-message-2',      defaultOn: false, alwaysOn: false },
]

// Default order for right column slots
const DEFAULT_ORDER = [
  'weather','lunch','passHistory','fortune','cowboyCode',
  'wisdom','wordOfDay','historyDrop','bizFacts','funFacts',
  'releases','sports','birthdays','teacherMsg',
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

  function diffFor(dateStr) {
    if (!dateStr) return 0
    const d = new Date(dateStr + 'T00:00:00')
    return Math.round((d - new Date(today.toDateString())) / 86400000)
  }
  function labelFor(dateStr) {
    const diff = diffFor(dateStr)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff > 0 && diff < 7) return DAYS[new Date(dateStr + 'T00:00:00').getDay()]
    return `${MONTHS[new Date(dateStr + 'T00:00:00').getMonth()]} ${new Date(dateStr + 'T00:00:00').getDate()}`
  }
  function countdownFor(dateStr) {
    const diff = diffFor(dateStr)
    if (diff <= 0) return null
    if (diff === 1) return null // "Tomorrow" is enough
    if (diff <= 6) return `${diff}d`
    return `${diff}d`
  }

  const displayEvents = (events || []).slice(0, 7)

  return (
    <Card locked>
      <CardHeader label="Calendar & Events" locked />
      <CardBody compact>
        {displayEvents.length === 0 ? (
          <p style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>No upcoming events</p>
        ) : displayEvents.map((ev, i) => {
          const countdown = countdownFor(ev.date)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '5px 0', borderBottom: i < displayEvents.length - 1 ? '0.5px solid #f0eeea' : 'none',
            }}>
              <span style={{ fontSize: 10, color: '#999', minWidth: 52, paddingTop: 1 }}>
                {labelFor(ev.date)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18', lineHeight: 1.4, flex: 1 }}>
                {ev.title}{ev.time ? ` · ${ev.time}` : ''}
              </span>
              {countdown && (
                <span style={{
                  fontSize: 9, fontWeight: 500, color: RHS_GREEN,
                  background: '#e8f5ee', padding: '2px 6px', borderRadius: 8,
                  whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'center',
                  letterSpacing: '0.04em',
                }}>
                  in {countdown}
                </span>
              )}
            </div>
          )
        })}
        <a
          href="https://calendar.google.com/calendar/embed?src=rjusd.org_3stf3viha1tl799q7u41j8a75g%40group.calendar.google.com&ctz=America%2FLos_Angeles"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', marginTop: 8, fontSize: 10, fontWeight: 600,
            color: RHS_GREEN, textDecoration: 'none', textAlign: 'right',
            letterSpacing: '0.03em',
          }}
        >
          View full calendar →
        </a>
      </CardBody>
    </Card>
  )
}

// ── Birthday Card (left column, unlocked) ────────────────────────────────────
function BirthdayCard({ birthdays }) {
  if (!birthdays?.length) return null
  const today   = new Date()
  const todayMM = today.getMonth() + 1
  const todayDD = today.getDate()
  const todays    = birthdays.filter(b => b.month === todayMM && b.day === todayDD)
  const tomorrows = birthdays.filter(b => !(b.month === todayMM && b.day === todayDD))

  return (
    <Card>
      <CardHeader label="🎂 Birthdays" />
      <CardBody compact>
        {todays.length > 0 && (
          <>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#d97706', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 5 }}>Today 🎉</p>
            {todays.map((b, i) => (
              <p key={i} style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18',
                padding: '2px 0', borderBottom: i < todays.length - 1 ? '0.5px solid #f0eeea' : 'none' }}>
                {b.name}
              </p>
            ))}
            {tomorrows.length > 0 && <div style={{ marginBottom: 8 }} />}
          </>
        )}
        {tomorrows.length > 0 && (
          <>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 5 }}>Tomorrow</p>
            {tomorrows.map((b, i) => (
              <p key={i} style={{ fontSize: 12, color: '#555',
                padding: '2px 0', borderBottom: i < tomorrows.length - 1 ? '0.5px solid #f0eeea' : 'none' }}>
                {b.name}
              </p>
            ))}
          </>
        )}
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

  // teacher_objectives shape: { class_name, topic, objectives (jsonb array), do_now, period }
  const items = Array.isArray(objectives.objectives) ? objectives.objectives : []

  return (
    <Card locked>
      <CardHeader label="Today's Class" tag={objectives.period ? `Period ${objectives.period}` : undefined} locked />
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: items.length ? 10 : 0 }}>
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
              Learning Objectives
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
            <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.55 }}>{objectives.do_now}</p>
          </div>
        )}
        {objectives.got_it_when && (
          <div style={{
            background: '#fffbeb', borderRadius: 7,
            borderLeft: '2.5px solid #f59e0b', borderTopLeftRadius: 3, borderBottomLeftRadius: 3,
            padding: '8px 11px', marginTop: 8,
          }}>
            <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#b45309', marginBottom: 4 }}>
              You know you got it when…
            </p>
            <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.55 }}>{objectives.got_it_when}</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PERIOD HERO (top of right col, always shown)
// ════════════════════════════════════════════════════════════════════════════════

function PeriodHeroCard({ periodInfo }) {
  if (!periodInfo) return null
  const { status, current, minutesLeftInCurrent } = periodInfo

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

  return (
    <Card>
      <div style={{ padding: '12px 14px' }}>
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
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURABLE CARDS
// ════════════════════════════════════════════════════════════════════════════════

function WeatherCard({ weather, useCelsius, onToggleUnit }) {
  if (!weather) return null
  const toC = f => Math.round((f - 32) * 5 / 9)
  const fmt = f => useCelsius ? toC(f) : Math.round(f)
  const unit = useCelsius ? 'C' : 'F'
  return (
    <Card>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 13px', borderBottom: '0.5px solid #eeece8',
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#999' }}>
          Weather · Riverdale
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#bbb' }}>{fmtTime(new Date())}</span>
          <button
            onClick={onToggleUnit}
            title="Switch temperature unit"
            style={{
              fontSize: 9, fontWeight: 500, color: useCelsius ? RHS_GREEN : '#999',
              background: useCelsius ? '#e8f5ee' : '#f5f5f5',
              border: `0.5px solid ${useCelsius ? '#c0dece' : '#e0ddd8'}`,
              borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >°C</button>
          <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#ddd', cursor: 'grab' }} />
        </span>
      </div>
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <div>
            <div style={{ fontSize: 44, fontWeight: 500, color: '#1a1a18', lineHeight: 1 }}>
              {fmt(weather.temperature_2m)}°{unit}
            </div>
            <div style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
              Feels like {fmt(weather.apparent_temperature)}°{unit}
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

const CO_REASONS = ['Restroom','Library','Office','Counselor','Lockers','Errand','On Assignment','Career Counselor','Other']

// ── QR Scanner — teacher holds phone to Chromebook camera ────────────────────
// Defined outside PassHistoryCard so it's a stable component type (no remount on parent re-render)
function ScannerPane({ onResult }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | ready | error
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    let stream   = null
    let active   = true
    let animId   = null

    async function ensureJsQR() {
      if (window.jsQR) return true
      return new Promise(res => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
        s.onload  = () => res(true)
        s.onerror = () => res(false)
        document.head.appendChild(s)
      })
    }

    async function start() {
      // Chromebook front camera faces the teacher who holds their phone up
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        })
      } catch {
        setStatus('error'); setErrMsg('Camera access denied — use code entry instead'); return
      }
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
      setStatus('ready')

      // ── BarcodeDetector (native on Chrome / ChromeOS) ──────────────────
      if ('BarcodeDetector' in window) {
        const det = new BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (!active) return
          try {
            const codes = await det.detect(videoRef.current)
            if (codes.length) { onResult(codes[0].rawValue); return }
          } catch {}
          animId = requestAnimationFrame(tick)
        }
        animId = requestAnimationFrame(tick)
        return
      }

      // ── jsQR canvas fallback ────────────────────────────────────────────
      const loaded = await ensureJsQR()
      if (!loaded) {
        setStatus('error'); setErrMsg('QR scanning unavailable — use code entry'); return
      }
      const canvas = document.createElement('canvas')
      const ctx    = canvas.getContext('2d')
      const tick   = () => {
        if (!active) return
        const v = videoRef.current
        if (v && v.readyState >= 2 && v.videoWidth) {
          canvas.width  = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = window.jsQR(img.data, img.width, img.height)
          if (code) { onResult(code.data); return }
        }
        animId = requestAnimationFrame(tick)
      }
      animId = requestAnimationFrame(tick)
    }

    start()
    return () => {
      active = false
      if (stream)  stream.getTracks().forEach(t => t.stop())
      if (animId)  cancelAnimationFrame(animId)
    }
  }, [])

  if (status === 'error') return (
    <p style={{ fontSize: 11, color: '#dc2626', padding: '6px 0' }}>{errMsg}</p>
  )

  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden',
      background: '#111', width: '100%', aspectRatio: '4/3' }}>
      <video ref={videoRef} muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

      {/* Starting overlay */}
      {status === 'starting' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#1a1a18' }}>
          <p style={{ fontSize: 11, color: '#555' }}>Starting camera…</p>
        </div>
      )}

      {/* Targeting frame + dim surround */}
      {status === 'ready' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{
            width: 110, height: 110,
            boxShadow: '0 0 0 1000px rgba(0,0,0,0.38)',
            border: '2.5px solid rgba(255,255,255,0.85)',
            borderRadius: 10,
          }} />
        </div>
      )}
    </div>
  )
}

function PassHistoryCard({
  uid, student, activePass, weekPassCount, weekPassTotal,
  selfCheckoutEnabled, checkoutUrl, checkoutStatus, roomParam, teacher, allTeachers = [],
}) {
  // ── Stats visibility toggle (privacy — student chooses when to show) ─────
  const SHOW_KEY = uid ? `passable_show_stats_${uid}` : null
  const [showStats, setShowStats] = useState(() => {
    if (typeof window === 'undefined' || !SHOW_KEY) return false
    return localStorage.getItem(SHOW_KEY) === 'true'
  })
  function toggleStats() {
    const next = !showStats
    setShowStats(next)
    if (SHOW_KEY) localStorage.setItem(SHOW_KEY, next ? 'true' : 'false')
  }

  // ── Checkout popup expand state ───────────────────────────────────────────
  const [expanded, setExpanded] = useState(false)

  // ── Inline self-checkout flow state ──────────────────────────────────────
  // Stages: idle | authEntry | authFail | found | libraryWarn | destInfo | alreadyOut | working | done | error
  const [coStage,   setCoStage]   = useState('idle')
  const [coInput,   setCoInput]   = useState('')
  const [coStudent, setCoStudent] = useState(null)    // {id,name,photo,period,openPass}
  const [coReason,  setCoReason]  = useState('')
  const [coOther,   setCoOther]   = useState('')
  const [coMsg,     setCoMsg]     = useState('')
  const [coCountdown, setCoCountdown] = useState(5)
  const [coAuthInput, setCoAuthInput] = useState('')
  const [coAuthMode,  setCoAuthMode]  = useState('qr')   // 'qr' | 'code'
  // Destination teacher (for Errand / On Assignment) — list comes from WireContent prop
  const [coDestTeacher,       setCoDestTeacher]       = useState(null)   // {id, full_name, room}
  const [coDestTeacherSearch, setCoDestTeacherSearch] = useState('')
  const coDestTeacherList = allTeachers   // use the prop, no local fetch needed
  const [coDestNote,          setCoDestNote]          = useState('')
  const coInputRef = useRef(null)
  const coAuthRef  = useRef(null)

  // ── Student photo — try lifetouch-raw, fall back to student-photos ──────────
  const [studentPhoto, setStudentPhoto] = useState(null)
  const [photoErr,     setPhotoErr]     = useState(false)
  useEffect(() => {
    const file = student?.photo_file
    if (!file) return
    let cancelled = false
    // Don't reset photoErr here — only reset if we actually get a URL
    async function load() {
      try {
        const { data: r } = await supabase.storage
          .from('lifetouch-raw').createSignedUrl(file, 3600)
        if (!cancelled && r?.signedUrl) {
          setPhotoErr(false)
          setStudentPhoto(r.signedUrl)
          return
        }
      } catch {}
      // Fallback: student-photos bucket
      try {
        const { data: r } = await supabase.storage
          .from('student-photos').createSignedUrl(file, 3600)
        if (!cancelled && r?.signedUrl) {
          setPhotoErr(false)
          setStudentPhoto(r.signedUrl)
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [student?.photo_file])

  // ── Auto-populate checkout for identified student (no extra DB call) ───────
  useEffect(() => {
    if (!expanded || !student?.id || coStage !== 'idle') return
    if (activePass) {
      // Already on a pass — jump straight to alreadyOut (no auth needed to check back in)
      setCoStudent({ id: student.id, name: student.full_name, photo: studentPhoto, period: student.period, openPass: activePass })
      setCoStage('alreadyOut')
    } else {
      // Needs teacher auth code before checkout
      setCoStage('authEntry')
      setTimeout(() => coAuthRef.current?.focus(), 80)
    }
  }, [expanded])

  // passes are always open during a class period — first/last 15 are verbal warnings only
  const duringPeriod = checkoutStatus !== null && !['before','after','break','passing'].includes(checkoutStatus === null ? '' : '')

  function resetCo() {
    setCoStage('idle'); setCoInput(''); setCoStudent(null)
    setCoReason(''); setCoOther(''); setCoMsg(''); setCoCountdown(5)
    setCoAuthInput(''); setCoAuthMode('qr')
    setCoDestTeacher(null); setCoDestTeacherSearch(''); setCoDestNote('')
    setTimeout(() => coInputRef.current?.focus(), 50)
  }

  // Handle reason selection — route to special stages for Library / Errand / On Assignment
  function selectReason(r) {
    setCoReason(r)
    if (r === 'Library') {
      setCoStage('libraryWarn')
    } else if (r === 'Errand' || r === 'On Assignment') {
      setCoDestTeacher(null); setCoDestTeacherSearch(''); setCoDestNote('')
      setCoStage('destInfo')
    }
    // All other reasons stay on 'found' stage — Check Out button becomes active
  }

  // Called by ScannerPane when a QR is detected
  function handleQRScan(rawValue) {
    try {
      let unlockParam = null
      try {
        const u = new URL(rawValue)
        unlockParam = u.searchParams.get('unlock')
      } catch {
        unlockParam = rawValue.trim() // bare code, not a URL
      }
      if (!unlockParam) return

      const teacherCode = teacher?.unlock_code || ''
      if (!teacherCode || unlockParam === teacherCode) {
        // Match (or no code configured — still let through)
        setCoStudent({ id: student.id, name: student.full_name, photo: studentPhoto, period: student.period, openPass: null })
        setCoStage('found')
      } else {
        setCoMsg('Wrong QR — are you scanning your teacher\'s code?')
        setCoStage('authFail')
      }
    } catch { /* ignore unrecognized QR content */ }
  }

  function verifyAuthCode() {
    if (coAuthInput.length !== 4) return
    const teacherCode = teacher?.session_code || ''
    if (!teacherCode) {
      // No code set — teacher hasn't enabled a session; still let through
      setCoStudent({ id: student.id, name: student.full_name, photo: studentPhoto, period: student.period, openPass: null })
      setCoStage('found')
      setCoAuthInput('')
      return
    }
    if (coAuthInput === teacherCode) {
      setCoStudent({ id: student.id, name: student.full_name, photo: studentPhoto, period: student.period, openPass: null })
      setCoStage('found')
      setCoAuthInput('')
    } else {
      setCoStage('authFail')
    }
  }

  async function coLookup(rawId) {
    const id = (rawId || coInput).trim()
    if (!id) return
    setCoStage('working')
    try {
      const { data: studs } = await supabase.from('students')
        .select('id, full_name, photo_file, photo_url, period').eq('id', id)
      if (!studs?.length) { setCoMsg('Student not found — check ID and try again'); setCoStage('error'); return }
      const s = studs[0]
      let photo = null
      if (s.photo_file) {
        const { data: pd } = await supabase.storage.from('lifetouch-raw').createSignedUrl(s.photo_file, 3600)
        photo = pd?.signedUrl
      }
      photo = photo || s.photo_url || null
      const { data: openPasses } = await supabase.from('passes')
        .select('*').eq('student_id', s.id).is('time_in', null).order('time_out', { ascending: false }).limit(1)
      const openPass = openPasses?.[0] || null
      setCoStudent({ id: s.id, name: s.full_name, photo, period: s.period, openPass })
      setCoStage(openPass ? 'alreadyOut' : 'found')
    } catch { setCoMsg('Something went wrong — try again'); setCoStage('error') }
  }

  async function doCheckout() {
    if (!coReason) return
    setCoStage('working')
    try {
      const reason = coReason === 'Other' ? coOther.trim() || 'Other' : coReason
      const destId = coDestTeacher?.id || null

      // Insert the pass — destination_teacher_id links to the teacher notification system
      // Teacher dashboards query: passes WHERE destination_teacher_id = myId AND time_in IS NULL
      await supabase.from('passes').insert({
        student_id:            coStudent.id,
        teacher_id:            teacher?.id || null,
        room:                  roomParam,
        reason,
        time_out:              new Date().toISOString(),
        period:                coStudent.period,
        destination_teacher_id: destId,
        destination_note:      coDestNote.trim() || null,
      })

      const destLabel = coDestTeacher ? ` → Room ${coDestTeacher.room} (${coDestTeacher.full_name})` : ''
      setCoMsg(`✓ ${coStudent.name} checked out — ${reason}${destLabel}`)
      setCoStage('done')
      startCountdown()
    } catch { setCoMsg('Check-out failed — try again'); setCoStage('error') }
  }

  async function doCheckIn() {
    setCoStage('working')
    try {
      await supabase.from('passes').update({ time_in: new Date().toISOString() }).eq('id', coStudent.openPass.id)
      setCoMsg(`✓ ${coStudent.name} checked back in`)
      setCoStage('done')
      startCountdown()
    } catch { setCoMsg('Check-in failed — try again'); setCoStage('error') }
  }

  function startCountdown(secs = 5) {
    let remaining = secs
    setCoCountdown(remaining)
    const iv = setInterval(() => {
      remaining -= 1
      setCoCountdown(remaining)
      if (remaining <= 0) { clearInterval(iv); resetCo() }
    }, 1000)
  }

  // ── Inline checkout panel (shown when selfCheckoutEnabled) ────────────────
  const InlineCheckout = () => {
    // ── Teacher auth step: QR scan (primary) or 4-digit code (backup) ────
    if (coStage === 'authEntry' || coStage === 'authFail') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f5f9f6', padding: '13px 13px 10px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: RHS_GREEN }}>
            🔐 Teacher Authorization
          </p>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden',
            border: '1px solid #d0e6d8', fontSize: 10 }}>
            <button onClick={() => { setCoAuthMode('qr'); setCoStage('authEntry') }}
              style={{ padding: '3px 8px', border: 'none', cursor: 'pointer',
                background: coAuthMode === 'qr' ? RHS_GREEN : 'white',
                color: coAuthMode === 'qr' ? 'white' : '#666', fontWeight: 600 }}>
              📷 QR
            </button>
            <button onClick={() => { setCoAuthMode('code'); setCoStage('authEntry'); setTimeout(() => coAuthRef.current?.focus(), 80) }}
              style={{ padding: '3px 8px', border: 'none', cursor: 'pointer',
                background: coAuthMode === 'code' ? RHS_GREEN : 'white',
                color: coAuthMode === 'code' ? 'white' : '#666', fontWeight: 600 }}>
              # Code
            </button>
          </div>
        </div>

        {coAuthMode === 'qr' ? (
          /* ── QR scan panel ─────────────────────────────────────── */
          <>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Ask your teacher to open their QR on their phone, then hold it up to the camera
            </p>
            <ScannerPane onResult={handleQRScan} />
            {coStage === 'authFail' && (
              <p style={{ fontSize: 11, color: '#dc2626', marginTop: 7 }}>
                {coMsg || 'QR not recognized — try again or use code entry'}
              </p>
            )}
          </>
        ) : (
          /* ── Code entry backup ─────────────────────────────────── */
          <>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Enter the 4-digit code from your teacher's dashboard
            </p>
            {coStage === 'authFail' && (
              <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 6 }}>
                Wrong code — check with your teacher
              </p>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={coAuthRef}
                value={coAuthInput}
                onChange={e => setCoAuthInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && coAuthInput.length === 4) verifyAuthCode() }}
                placeholder="· · · ·"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                style={{
                  flex: 1, fontSize: 22, fontWeight: 700, textAlign: 'center', letterSpacing: '0.35em',
                  padding: '8px 10px', borderRadius: 7,
                  border: `1.5px solid ${coStage === 'authFail' ? '#fca5a5' : '#c0d8c8'}`,
                  background: 'white', color: '#1a1a18', outline: 'none',
                }}
              />
              <button onClick={verifyAuthCode} disabled={coAuthInput.length !== 4}
                style={{
                  background: coAuthInput.length === 4 ? RHS_GREEN : '#e0ddd8',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  padding: '8px 16px', borderRadius: 7, border: 'none',
                  cursor: coAuthInput.length === 4 ? 'pointer' : 'default',
                }}>Go</button>
            </div>
          </>
        )}

        <button onClick={() => { setExpanded(false); setCoStage('idle'); setCoAuthInput(''); setCoAuthMode('qr') }}
          style={{ fontSize: 11, color: '#bbb', background: 'none', border: 'none',
            cursor: 'pointer', marginTop: 10, padding: 0, display: 'block' }}>
          Cancel
        </button>
      </div>
    )

    if (coStage === 'idle' || coStage === 'error') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f5f9f6', padding: '12px 13px' }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: RHS_GREEN, marginBottom: 8 }}>
          Self Check-Out
        </p>
        {coStage === 'error' && (
          <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 7 }}>{coMsg}</p>
        )}
        <p style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Enter your student ID or scan your QR / NFC badge</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={coInputRef}
            value={coInput}
            onChange={e => setCoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') coLookup() }}
            placeholder="Student ID"
            inputMode="numeric"
            autoComplete="off"
            style={{
              flex: 1, fontSize: 16, fontWeight: 500, textAlign: 'center',
              padding: '8px 10px', borderRadius: 7,
              border: `1.5px solid ${coStage === 'error' ? '#fca5a5' : '#c0d8c8'}`,
              background: 'white', color: '#1a1a18', outline: 'none',
            }}
          />
          <button
            onClick={() => coLookup()}
            style={{
              background: coInput.trim() ? RHS_GREEN : '#e0ddd8', color: 'white',
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 7,
              border: 'none', cursor: coInput.trim() ? 'pointer' : 'default',
            }}
          >Go</button>
        </div>
        {checkoutStatus === 'first15' && (
          <p style={{ fontSize: 10, color: '#d97706', marginTop: 7 }}>⚠ First 15 min — teacher is aware</p>
        )}
        {checkoutStatus === 'last15' && (
          <p style={{ fontSize: 10, color: '#d97706', marginTop: 7 }}>⚠ Last 15 min — teacher is aware</p>
        )}
      </div>
    )

    if (coStage === 'working') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f5f9f6', padding: '20px 13px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#aaa' }}>Looking up…</p>
      </div>
    )

    // ── Shared student identity header ────────────────────────────────────────
    const StudentHeader = ({ sub }) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        {coStudent.photo
          ? <img src={coStudent.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${RHS_GREEN}` }}
              onError={e => { e.currentTarget.style.display = 'none' }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: RHS_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {coStudent.name.split(' ').map(n => n[0]).slice(0,2).join('')}
            </div>
        }
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', lineHeight: 1.2 }}>{coStudent.name}</p>
          <p style={{ fontSize: 10, color: '#aaa' }}>{sub}</p>
        </div>
      </div>
    )

    if (coStage === 'found') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f5f9f6', padding: '12px 13px' }}>
        {StudentHeader({ sub: 'Where are you going?' })}
        {/* Reason grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
          {CO_REASONS.filter(r => r !== 'Other').map(r => (
            <button key={r} onClick={() => selectReason(r)}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                border: `1.5px solid ${coReason === r ? RHS_GREEN : '#dde8e2'}`,
                background: coReason === r ? RHS_GREEN : 'white',
                color: coReason === r ? 'white' : '#444',
                cursor: 'pointer', fontWeight: coReason === r ? 600 : 400,
              }}>{r}</button>
          ))}
          <button onClick={() => selectReason('Other')}
            style={{
              fontSize: 11, padding: '5px 10px', borderRadius: 6,
              border: `1.5px solid ${coReason === 'Other' ? RHS_GREEN : '#dde8e2'}`,
              background: coReason === 'Other' ? RHS_GREEN : 'white',
              color: coReason === 'Other' ? 'white' : '#444', cursor: 'pointer',
            }}>Other</button>
        </div>
        {coReason === 'Other' && (
          <input value={coOther} onChange={e => setCoOther(e.target.value)}
            placeholder="Where are you going?" autoFocus
            style={{ width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 6,
              border: '1.5px solid #c0d8c8', background: 'white', outline: 'none',
              marginBottom: 8, boxSizing: 'border-box' }}
          />
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={resetCo}
            style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e0ddd8', background: 'white', color: '#888', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={doCheckout}
            disabled={!coReason || (coReason === 'Other' && !coOther.trim())}
            style={{ flex: 2, fontSize: 13, fontWeight: 600, padding: '8px', borderRadius: 7, border: 'none',
              background: coReason && !(coReason === 'Other' && !coOther.trim()) ? RHS_GREEN : '#e0ddd8',
              color: 'white', cursor: coReason ? 'pointer' : 'default' }}>
            Check Out
          </button>
        </div>
      </div>
    )

    // ── Library warning ────────────────────────────────────────────────────────
    if (coStage === 'libraryWarn') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#fffbeb', padding: '12px 13px' }}>
        {StudentHeader({ sub: 'Library' })}
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginBottom: 11 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>📚 Library Pass Required</p>
          <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
            You need a <strong>signed hall pass from your teacher</strong> to enter the library.
            Make sure your teacher has signed off before heading over.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => { setCoReason(''); setCoStage('found') }}
            style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e0ddd8', background: 'white', color: '#888', cursor: 'pointer' }}>
            ← Go Back
          </button>
          <button onClick={doCheckout}
            style={{ flex: 2, fontSize: 13, fontWeight: 600, padding: '8px', borderRadius: 7, border: 'none', background: RHS_GREEN, color: 'white', cursor: 'pointer' }}>
            I have a signed pass — Check Out
          </button>
        </div>
      </div>
    )

    // ── Destination teacher (Errand / On Assignment) ──────────────────────────
    if (coStage === 'destInfo') {
      const canCheckOut = !!coDestTeacher

      return (
        <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f5f9f6', padding: '12px 13px' }}>
          {StudentHeader({ sub: coReason + ' — who are you heading to?' })}

          {/* Teacher dropdown — exact match, no typos possible */}
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 5 }}>
            Destination Teacher
          </p>
          <select
            value={coDestTeacher?.id || ''}
            onChange={e => {
              const t = coDestTeacherList.find(x => x.id === e.target.value) || null
              setCoDestTeacher(t)
            }}
            autoFocus
            style={{
              width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6,
              border: `1.5px solid ${coDestTeacher ? RHS_GREEN : '#c0d8c8'}`,
              background: 'white', color: coDestTeacher ? '#1a1a18' : '#aaa',
              outline: 'none', marginBottom: 8, boxSizing: 'border-box',
              appearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Select a teacher —</option>
            {coDestTeacherList.map(t => (
              <option key={t.id} value={t.id}>
                {t.full_name}{t.room ? ` · Room ${t.room}` : ''}
              </option>
            ))}
          </select>

          {/* Optional note */}
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 5 }}>
            Reason / Note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </p>
          <input value={coDestNote} onChange={e => setCoDestNote(e.target.value)}
            placeholder={coReason === 'On Assignment' ? 'e.g. picking up assignment, borrowing materials…' : 'e.g. returning book, delivering message…'}
            style={{ width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 6,
              border: '1.5px solid #c0d8c8', background: 'white', outline: 'none',
              marginBottom: 9, boxSizing: 'border-box' }}
          />

          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={() => setCoStage('found')}
              style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e0ddd8', background: 'white', color: '#888', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={doCheckout} disabled={!canCheckOut}
              style={{ flex: 2, fontSize: 13, fontWeight: 600, padding: '8px', borderRadius: 7, border: 'none',
                background: canCheckOut ? RHS_GREEN : '#e0ddd8', color: 'white',
                cursor: canCheckOut ? 'pointer' : 'default' }}>
              Check Out — Notify {coDestTeacher ? coDestTeacher.full_name.split(' ').pop() : 'Teacher'}
            </button>
          </div>
        </div>
      )
    }

    if (coStage === 'alreadyOut') {
      const op = coStudent.openPass
      const outAt = op?.time_out ? new Date(op.time_out) : null
      const outLabel = outAt ? `${outAt.getHours() % 12 || 12}:${String(outAt.getMinutes()).padStart(2,'0')} ${outAt.getHours() >= 12 ? 'PM' : 'AM'}` : ''
      return (
        <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#fff8f0', padding: '12px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            {coStudent.photo
              ? <img src={coStudent.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #d97706' }}
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {coStudent.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                </div>
            }
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>⚠ {coStudent.name} is already out</p>
              <p style={{ fontSize: 10, color: '#b45309' }}>{outLabel ? `Since ${outLabel}` : ''}{op?.reason ? ` · ${op.reason}` : ''}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={resetCo}
              style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e0ddd8', background: 'white', color: '#888', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={doCheckIn}
              style={{ flex: 2, fontSize: 13, fontWeight: 600, padding: '8px', borderRadius: 7, border: 'none', background: RHS_GREEN, color: 'white', cursor: 'pointer' }}>
              Check Back In
            </button>
          </div>
        </div>
      )
    }

    if (coStage === 'done') return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f0f9f4', padding: '18px 13px', textAlign: 'center' }}>
        <p style={{ fontSize: 20, marginBottom: 6 }}>✓</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: RHS_GREEN, marginBottom: 4 }}>{coMsg}</p>
        <p style={{ fontSize: 10, color: '#aaa' }}>Returning in {coCountdown}s…</p>
      </div>
    )

    return null
  }

  // ── Toggle switch UI helper ───────────────────────────────────────────────
  const StatsToggle = ({ label }) => (
    <button
      onClick={toggleStats}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}
    >
      {/* pill track */}
      <span style={{
        width: 36, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center',
        background: showStats ? RHS_GREEN : '#d1d5db',
        padding: '2px', boxSizing: 'border-box', flexShrink: 0,
        transition: 'background 0.2s',
      }}>
        <span style={{
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transform: showStats ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s', display: 'block',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }} />
      </span>
      <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
    </button>
  )

  if (!student) {
    // Personalized page (uid in URL) but student not loaded yet — loading state
    if (uid) {
      return (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 13px', borderBottom: '0.5px solid #eeece8',
          }}>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#999' }}>
              PassAble Pass Status
            </span>
            <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#ddd', cursor: 'grab' }} />
          </div>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.4 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: '#aaa' }}>Loading your pass status…</p>
            </div>
          </CardBody>
        </Card>
      )
    }

    // Shared display (no uid) — generic state
    return (
      <Card>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 13px', borderBottom: '0.5px solid #eeece8',
        }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#999' }}>
            PassAble Pass Status
          </span>
          <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#ddd', cursor: 'grab' }} />
        </div>
        {selfCheckoutEnabled ? (
          <InlineCheckout />
        ) : (
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.45 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#f0f8f4', border: '1px dashed #a0c8b0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="ti ti-id-badge-2" aria-hidden="true" style={{ fontSize: 20, color: RHS_GREEN }} />
              </div>
              <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
                Open your personal PassAble link to see your pass status
              </p>
            </div>
          </CardBody>
        )}
      </Card>
    )
  }

  // ── Checkout popup for identified student (auto-populated, no ID entry) ────
  const CheckoutPopup = () => {
    if (!selfCheckoutEnabled) return (
      <div style={{ borderTop: '0.5px solid #e8f0ec', background: '#f9fafb', padding: '12px 13px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#aaa' }}>Self-checkout is not currently enabled by your teacher</p>
      </div>
    )
    // Flow: tap stats → authEntry (teacher QR/code) → found (reason grid) → done
    // If already on a pass: tap → alreadyOut (check in option)
    return InlineCheckout()
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
      {/* Header row: title + stats toggle + drag handle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 13px', borderBottom: '0.5px solid #eeece8',
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#999' }}>
          {activePass && showStats ? 'PassAble · Pass Active' : 'PassAble Pass Status'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatsToggle label={showStats ? 'Stats on' : 'Show stats'} />
          <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 13, color: '#ddd', cursor: 'grab' }} />
        </span>
      </div>

      {/* Stats body — only visible when toggled on */}
      {showStats && (
      <div onClick={() => setExpanded(o => !o)} style={{ cursor: 'pointer' }}>
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
            ) : (studentPhoto && !photoErr) ? (
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <img src={studentPhoto} alt="" style={{
                  width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                  border: `2px solid #c8e6d4`,
                }} onError={() => setPhotoErr(true)} />
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 16, height: 16, borderRadius: '50%',
                  background: RHS_GREEN, border: '2px solid white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-check" style={{ fontSize: 9, color: 'white' }} />
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
      </div>
      )}

      {/* Checkout popup — called as function (not component) so ScannerPane doesn't remount on clock ticks */}
      {expanded && showStats && CheckoutPopup()}
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
          const days = daysUntil(c.date)
          const soon = days <= 14
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0', borderBottom: i < countdowns.length - 1 ? '0.5px solid #f0eeea' : 'none',
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>
                {c.emoji ? `${c.emoji} ` : ''}{c.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: soon ? '#b06010' : RHS_GREEN, whiteSpace: 'nowrap' }}>
                {days === 0 ? 'Today!' : `${days}d`}
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

function WisdomCard({ woy }) {
  const w = WORDS_OF_WISDOM[woy % WORDS_OF_WISDOM.length]
  return (
    <Card>
      <CardHeader label="Words of Wisdom" draggable />
      <CardBody>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>"</span>
          <div>
            <p style={{ fontSize: 13, color: '#1a1a18', lineHeight: 1.6, fontStyle: 'italic', marginBottom: 6 }}>
              {w.quote}
            </p>
            <p style={{ fontSize: 11, fontWeight: 500, color: RHS_GREEN }}>— {w.author}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function WordOfDayCard({ doy }) {
  const w = WORD_OF_DAY[doy % WORD_OF_DAY.length]
  return (
    <Card>
      <CardHeader label="Word of the Day" draggable />
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: RHS_GREEN }}>{w.word}</span>
          <span style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic' }}>{w.pos}</span>
        </div>
        <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.6 }}>{w.def}</p>
      </CardBody>
    </Card>
  )
}

function HistoryDropCard({ doy }) {
  const h = HISTORY_DROPS[doy % HISTORY_DROPS.length]
  return (
    <Card>
      <CardHeader label="History Drop" draggable />
      <CardBody>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            minWidth: 44, height: 44, borderRadius: 8, background: '#f0f8f4',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: RHS_GREEN, textAlign: 'center', lineHeight: 1.2 }}>{h.year}</span>
          </div>
          <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.6 }}>{h.fact}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function BizFactCard({ doy }) {
  const b = BIZ_FACTS[doy % BIZ_FACTS.length]
  return (
    <Card>
      <CardHeader label="Business Facts" draggable />
      <CardBody>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>📊</span>
          <p style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.6 }}>{b.fact}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function TeacherMsgCard({ msg }) {
  if (!msg) return null
  // cw2_messages shape: { sender, line1–line8, room }
  const title    = msg.line1 || ''
  const subtitle = msg.line2 || ''
  const extra    = [msg.line3, msg.line4].filter(Boolean)
  const from     = msg.sender || 'Teacher'
  if (!title) return null
  return (
    <div style={{ background: RHS_GREEN, borderRadius: 10, padding: '13px 13px' }}>
      <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>
        Message from {from}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'white', marginBottom: subtitle ? 3 : 0 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: extra.length ? 3 : 0 }}>{subtitle}</p>}
      {extra.map((line, i) => (
        <p key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{line}</p>
      ))}
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
    setPrefs(p => ({ ...p, enabled: { ...p.enabled, [id]: !p.enabled[id] } }))
  }

  function move(id, dir) {
    setPrefs(p => {
      const order = [...p.order]
      const i = order.indexOf(id)
      if (i < 0) return p
      const j = i + dir
      if (j < 0 || j >= order.length) return p
      ;[order[i], order[j]] = [order[j], order[i]]
      return { ...p, order }
    })
  }

  const orderedCards = prefs.order
    .map(id => COMPONENT_REGISTRY.find(c => c.id === id))
    .filter(Boolean)

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
              Toggle cards · drag to reorder
            </p>
          </div>

          {/* Locked left-column cards */}
          <div style={{ padding: '6px 14px', borderBottom: '0.5px solid #f0eeea' }}>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ccc', marginBottom: 4 }}>
              Always on
            </p>
            {['Schedule','Calendar & Events','Objectives'].map(label => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <i className={`ti ${label === 'Schedule' ? 'ti-calendar-week' : label.startsWith('Cal') ? 'ti-calendar-event' : 'ti-notebook'}`}
                   aria-hidden="true" style={{ fontSize: 14, color: RHS_GREEN, width: 18, textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: '#888', flex: 1 }}>{label}</span>
                <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 11, color: '#ccc' }} />
              </div>
            ))}
          </div>

          {/* Configurable right-column cards with toggle + reorder */}
          <div style={{ padding: '6px 14px 10px' }}>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ccc', marginBottom: 4 }}>
              Your cards · tap to toggle · arrows to reorder
            </p>
            {orderedCards.map((c, idx) => {
              const isOn = prefs.enabled[c.id]
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: idx < orderedCards.length - 1 ? '0.5px solid #f8f7f5' : 'none' }}>
                  <i className={`ti ${c.icon}`} aria-hidden="true"
                     style={{ fontSize: 14, color: isOn ? RHS_GREEN : '#ccc', width: 18, textAlign: 'center' }} />
                  <button
                    onClick={() => toggle(c.id)}
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: c.alwaysOn ? 'default' : 'pointer', padding: 0 }}
                  >
                    <span style={{ fontSize: 11, color: isOn ? '#222' : '#bbb' }}>{c.label}</span>
                  </button>
                  {/* Toggle pill */}
                  {!c.alwaysOn && (
                    <div
                      onClick={() => toggle(c.id)}
                      style={{ width: 28, height: 14, borderRadius: 7, position: 'relative', cursor: 'pointer',
                        background: isOn ? RHS_GREEN : '#ddd', transition: 'background 0.15s', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: 2, left: isOn ? 'calc(100% - 12px)' : 2,
                        width: 10, height: 10, borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
                    </div>
                  )}
                  {/* Reorder buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <button onClick={() => move(c.id, -1)} disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px 3px', lineHeight: 1 }}>
                      <i className="ti ti-chevron-up" style={{ fontSize: 10, color: idx === 0 ? '#e0ddd8' : '#999' }} />
                    </button>
                    <button onClick={() => move(c.id, 1)} disabled={idx === orderedCards.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === orderedCards.length - 1 ? 'default' : 'pointer', padding: '1px 3px', lineHeight: 1 }}>
                      <i className="ti ti-chevron-down" style={{ fontSize: 10, color: idx === orderedCards.length - 1 ? '#e0ddd8' : '#999' }} />
                    </button>
                  </div>
                </div>
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

  // ── Tabler Icons CSS (injected once — not in layout for this route) ──────
  useEffect(() => {
    if (document.querySelector('[data-tabler-icons]')) return
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css'
    link.setAttribute('data-tabler-icons', '1')
    document.head.appendChild(link)
  }, [])

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
      const result = await fetchTodayScheduleType(new Date(), roomParam || null)
      setScheduleType(result?.type || null)
      setScheduleObj(result?.schedule || null)
    }
    loadSchedule()
  }, [roomParam])

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
  const [teacher,     setTeacher]     = useState(null)
  const [allTeachers, setAllTeachers] = useState([])
  const [student,     setStudent]     = useState(null)
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

      // 1. Look up student by UID — try student `id` first (personalized wire URL),
      //    then fall back to `nfc_uid` (legacy NFC tap flow)
      if (uid) {
        let stu = null
        const { data: byId } = await supabase
          .from('students').select('*').eq('id', uid).maybeSingle()
        if (byId) {
          stu = byId
        } else {
          const { data: byNfc } = await supabase
            .from('students').select('*').eq('nfc_uid', uid).maybeSingle()
          stu = byNfc || null
        }
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

      // 2. Look up teacher by room — try PassAble teachers first, fall back to cw2_classrooms
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
        } else {
          const { data: cls } = await supabase
            .from('cw2_classrooms')
            .select('*')
            .eq('room', resolvedRoom)
            .eq('is_active', true)
            .single()
          if (cls) {
            resolvedTeacher = { id: cls.id, room: cls.room, full_name: cls.teacher_name, email: cls.teacher_email }
            setTeacher(resolvedTeacher)
          }
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

      // 5. Objectives — from teacher_objectives by teacher_id + current period
      //    (teacher enters these in PassAble dashboard — no character limit)
      setObjectivesLoading(true)
      if (resolvedTeacher) {
        try {
          const period = periodInfo?.current?.covers?.[0] || periodInfo?.current?.id || null
          let q = supabase
            .from('teacher_objectives')
            .select('*')
            .eq('teacher_id', resolvedTeacher.id)
            .order('updated_at', { ascending: false })
            .limit(1)
          if (period) q = q.eq('period', String(period))
          const { data: obj } = await q
          setObjectives(obj?.[0] || null)
        } catch { setObjectives(null) }
      } else {
        setObjectives(null)
      }
      setObjectivesLoading(false)
    }
    load()
  }, [uid, roomParam, periodInfo?.current?.value])

  // ── All teachers (for destination picker in self-checkout) ────────────────
  // Try teachers table first (requires anon RLS policy); fall back to cw2_classrooms
  useEffect(() => {
    async function fetchTeachers() {
      const { data: fromTeachers } = await supabase
        .from('teachers').select('id, full_name, room').order('full_name')
      if (fromTeachers?.length > 0) { setAllTeachers(fromTeachers); return }
      // Fallback: cw2_classrooms (always readable by anon)
      const { data: fromClassrooms } = await supabase
        .from('cw2_classrooms')
        .select('id, teacher_name, room')
        .eq('is_active', true)
        .order('teacher_name')
      if (fromClassrooms) {
        setAllTeachers(fromClassrooms.map(c => ({
          id: c.id,
          full_name: c.teacher_name,
          room: c.room,
        })))
      }
    }
    fetchTeachers()
  }, [])

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

  // ── Active pass polling (30s) — keeps red/green status live mid-period ──────
  useEffect(() => {
    if (!student?.id) return
    async function pollPass() {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const { data: passes } = await supabase
        .from('passes')
        .select('*')
        .eq('student_id', student.id)
        .gte('time_out', weekStart.toISOString())
        .order('time_out', { ascending: false })
      if (passes) {
        setActivePass(passes.find(p => !p.time_in) || null)
        setWeekPassCount(passes.length)
        setWeekPassTotal(
          passes.filter(p => p.time_in)
            .reduce((acc, p) => acc + Math.round((new Date(p.time_in) - new Date(p.time_out)) / 60000), 0)
        )
      }
    }
    const id = setInterval(pollPass, 30000)
    return () => clearInterval(id)
  }, [student?.id])

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
  const [cwTeacherMsg, setCwTeacherMsg] = useState([])
  const [cwReleases,   setCwReleases]   = useState([])
  const [cwFunFact,    setCwFunFact]    = useState(null)
  const [cwBirthdays,  setCwBirthdays]  = useState([])
  const [msgIndex,     setMsgIndex]     = useState(0)

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

      // Sports — no table yet; graceful empty
      setCwSports([])

      // Releases — no table yet; graceful empty
      setCwReleases([])

      // Teacher Messages — cw2_messages scoped to this room
      try {
        let q = supabase
          .from('cw2_messages')
          .select('*')
          .eq('active', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .limit(5)
        if (roomParam) q = q.eq('room', roomParam)
        const { data } = await q
        setCwTeacherMsg(data || [])
      } catch { setCwTeacherMsg([]) }

      // Birthdays — cw2_birthdays: separate integer month + day columns
      try {
        const mm  = today.getMonth() + 1
        const dd  = today.getDate()
        const tom = new Date(today); tom.setDate(today.getDate() + 1)
        const mm2 = tom.getMonth() + 1
        const dd2 = tom.getDate()
        const { data } = await supabase
          .from('cw2_birthdays')
          .select('name, month, day')
          .eq('active', true)
          .or(`and(month.eq.${mm},day.eq.${dd}),and(month.eq.${mm2},day.eq.${dd2})`)
        setCwBirthdays(data || [])
      } catch { setCwBirthdays([]) }
    }

    loadAll()
  }, [roomParam])

  // Teacher message rotation every 15 seconds
  useEffect(() => {
    if (cwTeacherMsg.length <= 1) return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % cwTeacherMsg.length), 15000)
    return () => clearInterval(id)
  }, [cwTeacherMsg.length])

  // ── Temperature unit ───────────────────────────────────────────────────────
  const [useCelsius, setUseCelsius] = useState(false)

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
    // first15 / last15 are now verbal warnings only — amber, not red; passes still open
    if (checkoutStatus === 'first15' || checkoutStatus === 'last15') return { background: '#92400e' }
    if (checkoutStatus === 'warning20') return { background: '#78350f' }
    return { background: RHS_DARK }
  }
  function statusText() {
    if (!periodInfo) return 'Loading…'
    const { status, current, minutesLeftInCurrent } = periodInfo
    if (checkoutStatus === 'first15') {
      // Calculate how many minutes until the safe window opens (period start + 15 min)
      const [sh, sm] = (current?.start || '00:00').split(':').map(Number)
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const openMins = sh * 60 + sm + 15
      const minsUntilOpen = Math.max(1, openMins - nowMins)
      return `No passes · safe window opens in ${minsUntilOpen} min`
    }
    if (checkoutStatus === 'last15') return `No passes · safe window closed`
    if (checkoutStatus === 'warning20') {
      // Window closes when 15 min remain (last15 threshold)
      const minsUntilClose = Math.max(0, (minutesLeftInCurrent ?? 0) - 15)
      return minsUntilClose <= 1
        ? `Passes open · no passes very soon`
        : `Passes open · ${minsUntilClose} min until no passes`
    }
    if (checkoutStatus === 'ok') {
      // Window closes when 15 min remain
      const minsUntilClose = Math.max(0, (minutesLeftInCurrent ?? 0) - 15)
      return `Passes open · safe window closes in ${minsUntilClose} min`
    }
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
      return `Next Bell at ${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
    }
    if (checkoutStatus === 'last15' && current?.end) {
      const [h, m] = current.end.split(':').map(Number)
      return `Next Bell at ${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
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

  // ── Derived content indices ────────────────────────────────────────────────
  const _now      = now || new Date()
  const _doy      = dayOfYear(_now)
  const _woy      = weekOfYear(_now)
  const weekTrait = COWBOY_CODE[_woy % COWBOY_CODE.length]

  // ── Right column slot renderer ─────────────────────────────────────────────
  const slotData = {
    weather:     weather,
    lunch:       menu.length > 0 ? menu : null,
    passHistory: true, // always render (card shows generic state if no student)
    fortune:     cwFortune,
    cowboyCode:  weekTrait,
    wisdom:      true, // always has built-in content
    wordOfDay:   true,
    historyDrop: true,
    bizFacts:    true,
    funFacts:    cwFunFact,
    releases:    cwReleases.length > 0 ? cwReleases : null,
    sports:      cwSports.length > 0 ? cwSports : null,
    birthdays:   cwBirthdays.length > 0 ? cwBirthdays : null,
    teacherMsg:  cwTeacherMsg.length > 0 ? cwTeacherMsg[msgIndex % cwTeacherMsg.length] : null,
  }

  function renderSlot(id) {
    if (!prefs.enabled[id]) return null
    const d = slotData[id]
    // Data-driven fallback: skip if data is null/empty (card won't mount)
    if (d === null && id !== 'passHistory') return null
    switch (id) {
      case 'weather':     return <WeatherCard key={id} weather={d} useCelsius={useCelsius} onToggleUnit={() => setUseCelsius(u => !u)} />
      case 'lunch':       return <LunchCard key={id} menu={d} nextBellLabel={lunchBellLabel()} />
      case 'passHistory': return <PassHistoryCard key={id} uid={uid} student={student} activePass={activePass} weekPassCount={weekPassCount} weekPassTotal={weekPassTotal} selfCheckoutEnabled={selfCheckoutEnabled} checkoutUrl={checkoutUrl} checkoutStatus={checkoutStatus} roomParam={roomParam} teacher={teacher} allTeachers={allTeachers} />
      case 'fortune':     return <FortuneCard key={id} fortune={d} />
      case 'cowboyCode':  return <CowboyCodeCard key={id} trait={d} />
      case 'wisdom':      return <WisdomCard key={id} woy={_woy} />
      case 'wordOfDay':   return <WordOfDayCard key={id} doy={_doy} />
      case 'historyDrop': return <HistoryDropCard key={id} doy={_doy} />
      case 'bizFacts':    return <BizFactCard key={id} doy={_doy} />
      case 'funFacts':    return <FunFactCard key={id} fact={d} />
      case 'releases':    return <ReleasesCard key={id} releases={d} />
      case 'sports':      return <SportsCard key={id} sports={d} />
      case 'birthdays':   return <BirthdaysCard key={id} birthdays={d} />
      case 'teacherMsg':  return <TeacherMsgCard key={id} msg={d} />
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
          <img src="/cowboy-logo.png" alt="RHS Cowboy" style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
              Riverdale High School · {teacher ? `Room ${teacher.room} · ${teacher.full_name || ''}` : roomParam ? `Room ${roomParam}` : 'Cowboy Wire'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 }}>
              Cowboy Wire · Student Display
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          {periodInfo?.status === 'period' && periodInfo.current && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>
              {periodInfo.current.label}
              {scheduleType && ` · ${SCHEDULE_LABELS[scheduleType] || scheduleType}`}
            </div>
          )}
          {periodInfo?.status === 'break' && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>
              {periodInfo.current?.label || 'Break'}
            </div>
          )}
          <div style={{ color: 'white', fontSize: 28, fontWeight: 500, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', lineHeight: 1 }}>
            {now ? fmtTime(now) : '—:—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 3 }}>
            {now ? fmtDateLong(now) : ''}
          </div>
        </div>
      </div>

      {/* ── STATUS BAR (15-min rule) ────────────────────────────────────────── */}
      <div style={{
        ...statusBarStyle(),
        padding: '7px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        {/* LEFT — Next Bell */}
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
          {statusRight() || ' '}
        </span>

        {/* RIGHT — pass status dot + text + Self Check-Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: periodInfo?.status === 'period' ? '#5dca8a' : '#f87171',
              flexShrink: 0,
            }} />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 500 }}>
              {statusText()}
            </span>
          </div>
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
          <ObjectivesCard objectives={objectives} loading={objectivesLoading} />
          <CalendarCard events={calendarEvents} />
          <BirthdayCard birthdays={cwBirthdays} />
        </div>

        {/* RIGHT — Configurable column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PeriodHeroCard periodInfo={periodInfo} />
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
