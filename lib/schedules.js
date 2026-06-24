/*
  PassAble — RHS Hall Pass System
  FILE:    lib/schedules.js
  PURPOSE: Shared bell schedule definitions, schedule detection (Google Calendar +
           Supabase overrides), period info helpers, and kiosk period-matching logic.
           Import this in app/teacher/page.jsx, app/kiosk/page.jsx, app/sub/page.jsx, etc.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  UPDATED: 2026-06-22
*/

import { supabase } from './supabase'

// ── Bell schedules ────────────────────────────────────────────────────────────
// Block schedules include a `covers` array so the kiosk can map a combined block
// slot (e.g. blockThu id='2') back to the teacher's stored period id (e.g. '1').
export const SCHEDULES = {
  regular: { name: 'Regular', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'09:02' },
    { id:'2', label:'Period 2', start:'09:06', end:'09:56' },
    { id:'brunch', label:'Brunch', start:'09:56', end:'10:11', break:true },
    { id:'3', label:'Period 3', start:'10:15', end:'11:05' },
    { id:'4', label:'Period 4', start:'11:09', end:'11:59' },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'5', label:'Period 5', start:'12:37', end:'13:27' },
    { id:'6', label:'Period 6', start:'13:31', end:'14:21' },
    { id:'7', label:'Period 7', start:'14:25', end:'15:15' },
  ]},

  earlyRelease: { name: 'Early Release', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:41' },
    { id:'3', label:'Period 3', start:'09:45', end:'10:26' },
    { id:'4', label:'Period 4', start:'10:30', end:'11:11' },
    { id:'lunch', label:'Lunch', start:'11:11', end:'11:45', break:true },
    { id:'5', label:'Period 5', start:'11:49', end:'12:30' },
    { id:'6', label:'Period 6', start:'12:34', end:'13:15' },
    { id:'7', label:'Period 7', start:'13:19', end:'14:00' },
  ]},

  // Block Wed: periods 1, 3, 5, 7 run as extended blocks.
  blockWed: { name: 'Block — Wednesday', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'09:57', covers:['1'] },
    { id:'brunch', label:'Brunch', start:'09:57', end:'10:12', break:true },
    { id:'3', label:'Period 3', start:'10:16', end:'11:59', covers:['3'] },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'5', label:'Period 5', start:'12:37', end:'14:20', covers:['5'] },
    { id:'7', label:'Period 7', start:'14:24', end:'15:15' },
  ]},

  // Block Thu: periods 2, 4, 6, 7 run as extended blocks.
  blockThu: { name: 'Block — Thursday', periods: [
    { id:'2', label:'Period 2', start:'08:10', end:'09:57', covers:['2'] },
    { id:'brunch', label:'Brunch', start:'09:57', end:'10:12', break:true },
    { id:'4', label:'Period 4', start:'10:16', end:'11:59', covers:['4'] },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'6', label:'Period 6', start:'12:37', end:'14:20', covers:['6'] },
    { id:'7', label:'Period 7', start:'14:24', end:'15:15' },
  ]},

  minimum: { name: 'Minimum Day', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:46' },
    { id:'2', label:'Period 2', start:'08:50', end:'09:23' },
    { id:'3', label:'Period 3', start:'09:27', end:'10:00' },
    { id:'4', label:'Period 4', start:'10:04', end:'10:37' },
    { id:'brunch', label:'Brunch/Lunch', start:'10:37', end:'11:10', break:true },
    { id:'5', label:'Period 5', start:'11:14', end:'11:47' },
    { id:'6', label:'Period 6', start:'11:51', end:'12:24' },
    { id:'7', label:'Period 7', start:'12:28', end:'13:01' },
  ]},

  activity: { name: 'Activity (End of Day)', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:44' },
    { id:'brunch', label:'Brunch', start:'09:44', end:'09:59', break:true },
    { id:'3', label:'Period 3', start:'10:03', end:'10:47' },
    { id:'4', label:'Period 4', start:'10:51', end:'11:35' },
    { id:'5', label:'Period 5', start:'11:39', end:'12:23' },
    { id:'lunch', label:'Lunch', start:'12:23', end:'12:57', break:true },
    { id:'6', label:'Period 6', start:'13:01', end:'13:45' },
    { id:'7', label:'Period 7', start:'13:49', end:'14:33' },
    { id:'activity', label:'Activity', start:'14:33', end:'15:15', break:true },
  ]},

  foggy: { name: 'Foggy — Regular', periods: [
    { id:'1', label:'Period 1', start:'10:00', end:'10:44' },
    { id:'2', label:'Period 2', start:'10:48', end:'11:28' },
    { id:'3', label:'Period 3', start:'11:32', end:'12:12' },
    { id:'lunch', label:'Lunch', start:'12:12', end:'12:49', break:true },
    { id:'4', label:'Period 4', start:'12:53', end:'13:33' },
    { id:'5', label:'Period 5', start:'13:37', end:'14:17' },
    { id:'6', label:'Period 6', start:'14:21', end:'15:01' },
    { id:'7', label:'Period 7', start:'15:05', end:'15:45' },
  ]},

  // Midday Activity Alternate (formerly C.O.D.E Day)
  codeDay: { name: 'Midday Activity Alternate', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:44' },
    { id:'brunch', label:'Brunch', start:'09:44', end:'09:59', break:true },
    { id:'3', label:'Period 3', start:'10:03', end:'10:47' },
    { id:'4', label:'Period 4', start:'10:51', end:'11:35' },
    { id:'activity', label:'Activity', start:'11:39', end:'12:17', break:true },
    { id:'lunch', label:'Lunch', start:'12:17', end:'12:51', break:true },
    { id:'5', label:'Period 5', start:'12:55', end:'13:39' },
    { id:'6', label:'Period 6', start:'13:43', end:'14:27' },
    { id:'7', label:'Period 7', start:'14:31', end:'15:15' },
  ]},

  middayActivity: { name: 'Midday Activity', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:54' },
    { id:'2', label:'Period 2', start:'08:58', end:'09:40' },
    { id:'brunch', label:'Brunch', start:'09:40', end:'09:55', break:true },
    { id:'3', label:'Period 3', start:'09:59', end:'10:41' },
    { id:'4', label:'Period 4', start:'10:45', end:'11:27' },
    { id:'activity', label:'Activity', start:'11:31', end:'12:05', break:true },
    { id:'lunch', label:'Lunch', start:'12:05', end:'12:39', break:true },
    { id:'5', label:'Period 5', start:'12:43', end:'13:23' },
    { id:'6', label:'Period 6', start:'13:27', end:'14:07' },
    { id:'7', label:'Period 7', start:'14:11', end:'14:51' },
  ]},

  middayActivityWed: { name: 'Midday Activity — Wednesday', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'09:55', covers:['1'] },
    { id:'brunch', label:'Brunch', start:'09:55', end:'10:10', break:true },
    { id:'3', label:'Period 3', start:'10:14', end:'11:55', covers:['3'] },
    { id:'activity', label:'Activity', start:'11:55', end:'12:30', break:true },
    { id:'lunch', label:'Lunch', start:'12:30', end:'13:00', break:true },
    { id:'5', label:'Period 5', start:'13:04', end:'14:45', covers:['5'] },
    { id:'7', label:'Period 7', start:'14:49', end:'15:15' },
  ]},

  middayActivityThu: { name: 'Midday Activity — Thursday', periods: [
    { id:'2', label:'Period 2', start:'08:10', end:'09:55', covers:['2'] },
    { id:'brunch', label:'Brunch', start:'09:55', end:'10:10', break:true },
    { id:'4', label:'Period 4', start:'10:14', end:'11:55', covers:['4'] },
    { id:'activity', label:'Activity', start:'11:55', end:'12:30', break:true },
    { id:'lunch', label:'Lunch', start:'12:30', end:'13:00', break:true },
    { id:'6', label:'Period 6', start:'13:04', end:'14:45', covers:['6'] },
    { id:'7', label:'Period 7', start:'14:49', end:'15:15' },
  ]},

  foggyBlockWed: { name: 'Foggy Block — Wednesday', periods: [
    { id:'1', label:'Period 1', start:'10:00', end:'11:30', covers:['1'] },
    { id:'brunch', label:'Brunch', start:'11:30', end:'11:45', break:true },
    { id:'3', label:'Period 3', start:'11:49', end:'13:15', covers:['3'] },
    { id:'lunch', label:'Lunch', start:'13:15', end:'13:49', break:true },
    { id:'5', label:'Period 5', start:'13:53', end:'15:19', covers:['5'] },
    { id:'7', label:'Period 7', start:'15:23', end:'15:45' },
  ]},

  foggyBlockThu: { name: 'Foggy Block — Thursday', periods: [
    { id:'2', label:'Period 2', start:'10:00', end:'11:30', covers:['2'] },
    { id:'brunch', label:'Brunch', start:'11:30', end:'11:45', break:true },
    { id:'4', label:'Period 4', start:'11:49', end:'13:15', covers:['4'] },
    { id:'lunch', label:'Lunch', start:'13:15', end:'13:49', break:true },
    { id:'6', label:'Period 6', start:'13:53', end:'15:19', covers:['6'] },
    { id:'7', label:'Period 7', start:'15:23', end:'15:45' },
  ]},

  // ── Finals Week — REMOVE AFTER JUNE 12, 2026 ─────────────────────────────
  finals1: { name: 'Finals — Day 1', periods: [
    { id:'1', label:'Period 1 (Review)', start:'08:10', end:'08:48' },
    { id:'2', label:'Period 2 (Review)', start:'08:52', end:'09:28' },
    { id:'3', label:'Period 3 (Review)', start:'09:32', end:'10:08' },
    { id:'brunch', label:'Brunch', start:'10:08', end:'10:23', break:true },
    { id:'4', label:'Period 4 (Review)', start:'10:27', end:'11:03' },
    { id:'5', label:'Period 5 (Review)', start:'11:07', end:'11:43' },
    { id:'lunch', label:'Lunch', start:'11:43', end:'12:18', break:true },
    { id:'6', label:'Period 6 (Review)', start:'12:22', end:'12:58' },
    { id:'final6', label:'Final — Period 6', start:'13:02', end:'14:35' },
    { id:'7', label:'Period 7 (Review)', start:'14:39', end:'15:15' },
  ]},
  finals2: { name: 'Finals — Day 2', periods: [
    { id:'1', label:'Period 1 (Review)', start:'08:10', end:'08:54' },
    { id:'final1', label:'Final — Period 1', start:'08:58', end:'10:31' },
    { id:'brunch', label:'Brunch', start:'10:31', end:'10:46', break:true },
    { id:'6', label:'Period 6 (Review)', start:'10:50', end:'11:32' },
    { id:'2', label:'Period 2 (Review)', start:'11:36', end:'12:18' },
    { id:'lunch', label:'Lunch', start:'12:18', end:'12:53', break:true },
    { id:'final2', label:'Final — Period 2', start:'12:57', end:'14:30' },
    { id:'mtg', label:'Class Meetings', start:'14:34', end:'15:15', break:true },
  ]},
  finals3: { name: 'Finals — Day 3', periods: [
    { id:'3', label:'Period 3 (Review)', start:'08:10', end:'08:40' },
    { id:'final3', label:'Final — Period 3', start:'08:44', end:'10:17' },
    { id:'4', label:'Period 4 (Review)', start:'10:21', end:'10:51' },
    { id:'lunch', label:'Lunch', start:'10:51', end:'11:24', break:true },
    { id:'final4', label:'Final — Period 4', start:'11:28', end:'13:01' },
  ]},
  finals4: { name: 'Finals — Day 4', periods: [
    { id:'5', label:'Period 5 (Review)', start:'08:10', end:'08:40' },
    { id:'final5', label:'Final — Period 5', start:'08:44', end:'10:17' },
    { id:'7', label:'Period 7 (Review)', start:'10:21', end:'10:51' },
    { id:'lunch', label:'Lunch', start:'10:51', end:'11:24', break:true },
    { id:'final7', label:'Final — Period 7', start:'11:28', end:'13:01' },
  ]},
}

// ── Human-readable schedule names for UI display ──────────────────────────────
export const SCHEDULE_LABELS = {
  regular:           'Regular',
  earlyRelease:      'Early Release',
  blockWed:          'Block — Wednesday',
  blockThu:          'Block — Thursday',
  minimum:           'Minimum Day',
  activity:          'Activity (End of Day)',
  middayActivity:    'Midday Activity',
  middayActivityWed: 'Midday Activity — Wednesday',
  middayActivityThu: 'Midday Activity — Thursday',
  foggy:             'Foggy — Regular',
  foggyBlockWed:     'Foggy Block — Wednesday',
  foggyBlockThu:     'Foggy Block — Thursday',
  codeDay:           'Midday Activity Alternate',
  custom:            'Custom…',
  finals1:           'Finals — Day 1',
  finals2:           'Finals — Day 2',
  finals3:           'Finals — Day 3',
  finals4:           'Finals — Day 4',
}

// ── No-school dates ───────────────────────────────────────────────────────────
export const NO_SCHOOL_DATES = [
  '2025-09-01','2025-11-11','2025-11-27','2025-11-28',
  '2025-12-22','2025-12-23','2025-12-24','2025-12-25','2025-12-26',
  '2025-12-29','2025-12-30','2025-12-31',
  '2026-01-01','2026-01-02','2026-01-05','2026-01-06',
  '2026-01-07','2026-01-08','2026-01-09','2026-01-12',
  '2026-01-19','2026-02-09','2026-02-16',
  '2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03',
  '2026-05-25',
]

// ── Finals dates — REMOVE AFTER JUNE 12, 2026 ────────────────────────────────
export const FINALS_DATES = {
  '2026-06-08': 'finals1',
  '2026-06-09': 'finals2',
  '2026-06-10': 'finals3',
  '2026-06-11': 'finals4',
  '2026-06-12': 'minimum',
}

const CALENDAR_URL = 'https://script.google.com/macros/s/AKfycbwdoA4UVuCyq8RU7hP6dBrRWAMVcMqq-0DNmZE09j6oVst1iPa7KzWq7raoCT3i0SL_/exec'

// ── Internal helpers ──────────────────────────────────────────────────────────
export function toMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export function nowMins(now = new Date()) { return now.getHours() * 60 + now.getMinutes() }
export function dateStr(d) { return d.toISOString().split('T')[0] }

function schoolDaysThisWeek(date) {
  const day = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  let count = 0
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (!NO_SCHOOL_DATES.includes(dateStr(d))) count++
  }
  return count
}

// ── Schedule detection ────────────────────────────────────────────────────────
// Priority: Supabase override (room-specific > global) → Google Calendar → day defaults
// Pass `room` so room-specific overrides are checked before global ones.
export async function fetchTodayScheduleType(date = new Date(), room = null) {
  const ds = dateStr(date)
  const dow = date.getDay()

  if (dow === 0 || dow === 6 || NO_SCHOOL_DATES.includes(ds))
    return { type: 'noSchool', schedule: null, isOverride: false }

  // ── Finals week hardcode — REMOVE AFTER JUNE 12, 2026 ────────────────────
  if (FINALS_DATES[ds]) {
    const type = FINALS_DATES[ds]
    return { type, schedule: SCHEDULES[type], isOverride: false }
  }

  // ── Supabase manual override (room-specific beats global) ─────────────────
  try {
    const keys = room
      ? [`schedule_override_${room}_${ds}`, `schedule_override_global_${ds}`]
      : [`schedule_override_global_${ds}`]
    const { data } = await supabase.from('settings').select('key,value').in('key', keys)
    if (data?.length) {
      const hit = (room && data.find(r => r.key === `schedule_override_${room}_${ds}`))
                  || data.find(r => r.key === `schedule_override_global_${ds}`)
      if (hit) {
        if (hit.value === 'custom') {
          const cpKey = room
            ? `schedule_override_custom_${room}_${ds}`
            : `schedule_override_custom_global_${ds}`
          const { data: cp } = await supabase.from('settings').select('value').eq('key', cpKey).single()
          if (cp?.value) {
            try {
              return { type: 'custom', schedule: { name: 'Custom', periods: JSON.parse(cp.value) }, isOverride: true }
            } catch (e) {}
          }
        } else if (SCHEDULES[hit.value]) {
          return { type: hit.value, schedule: SCHEDULES[hit.value], isOverride: true }
        }
      }
    }
  } catch (e) {}

  // ── Google Calendar ───────────────────────────────────────────────────────
  let events = []
  try {
    const res = await fetch(`${CALENDAR_URL}?date=${ds}`)
    const data = await res.json()
    if (data.status === 'ok') events = data.events || []
  } catch (e) {}

  const titles = events
    .filter(e => e.start && e.start.substring(0, 10) === ds)
    .map(e => (e.title || '').toLowerCase())
  const has = kw => titles.some(t => t.includes(kw))

  if (has('foggy') || has('late arrival')) {
    if (dow === 3) return { type: 'foggyBlockWed', schedule: SCHEDULES.foggyBlockWed, isOverride: false }
    if (dow === 4) return { type: 'foggyBlockThu', schedule: SCHEDULES.foggyBlockThu, isOverride: false }
    return { type: 'foggy', schedule: SCHEDULES.foggy, isOverride: false }
  }
  if (has('minimum'))     return { type: 'minimum',     schedule: SCHEDULES.minimum,     isOverride: false }
  if (has('code day'))    return { type: 'codeDay',     schedule: SCHEDULES.codeDay,     isOverride: false }
  if (has('midday activity')) {
    if (dow === 3) return { type: 'middayActivityWed', schedule: SCHEDULES.middayActivityWed, isOverride: false }
    if (dow === 4) return { type: 'middayActivityThu', schedule: SCHEDULES.middayActivityThu, isOverride: false }
    return { type: 'middayActivity', schedule: SCHEDULES.middayActivity, isOverride: false }
  }
  if (has('activity'))    return { type: 'activity',    schedule: SCHEDULES.activity,    isOverride: false }
  if (has('block')) {
    return dow === 3
      ? { type: 'blockWed', schedule: SCHEDULES.blockWed, isOverride: false }
      : { type: 'blockThu', schedule: SCHEDULES.blockThu, isOverride: false }
  }
  if (has('early release')) return { type: 'earlyRelease', schedule: SCHEDULES.earlyRelease, isOverride: false }

  // ── Day-of-week defaults ──────────────────────────────────────────────────
  if (schoolDaysThisWeek(date) <= 4) return { type: 'regular', schedule: SCHEDULES.regular, isOverride: false }
  if (dow === 1) return { type: 'earlyRelease', schedule: SCHEDULES.earlyRelease, isOverride: false }
  if (dow === 3) return { type: 'blockWed',     schedule: SCHEDULES.blockWed,     isOverride: false }
  if (dow === 4) return { type: 'blockThu',     schedule: SCHEDULES.blockThu,     isOverride: false }
  return { type: 'regular', schedule: SCHEDULES.regular, isOverride: false }
}

// ── Period info ───────────────────────────────────────────────────────────────
export function getCurrentPeriodInfo(schedule, now = new Date()) {
  if (!schedule) return { status: 'noSchool', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }
  const mins = nowMins(now)
  const periods = schedule.periods

  if (mins < toMins(periods[0].start))
    return { status: 'before', current: null, next: periods[0], minutesUntilNext: toMins(periods[0].start) - mins, minutesLeftInCurrent: 0 }

  const last = periods[periods.length - 1]
  if (mins >= toMins(last.end))
    return { status: 'after', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    const start = toMins(p.start)
    const end = toMins(p.end)
    if (mins >= start && mins < end) {
      const minutesLeftInCurrent = end - mins
      const next = periods[i + 1] || null
      return { status: p.break ? 'break' : 'period', current: p, next, minutesUntilNext: next ? toMins(next.start) - mins : 0, minutesLeftInCurrent }
    }
    if (i < periods.length - 1) {
      const np = periods[i + 1]
      const gapEnd = toMins(np.start)
      if (mins >= end && mins < gapEnd)
        return { status: 'passing', current: null, next: np, minutesUntilNext: gapEnd - mins, minutesLeftInCurrent: 0 }
    }
  }
  return { status: 'before', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }
}

export function getCheckoutStatus(periodInfo) {
  if (!periodInfo || periodInfo.status !== 'period') return 'ok'
  const { minutesLeftInCurrent, current } = periodInfo
  if (!current || current.break) return 'ok'
  const mins = nowMins()
  const sinceStart = mins - toMins(current.start)
  if (sinceStart < 15)          return 'first15'
  if (minutesLeftInCurrent <= 15) return 'last15'
  if (minutesLeftInCurrent <= 20) return 'warning20'
  return 'ok'
}

// ── Kiosk: map clock period → teacher's stored period id ─────────────────────
// teacherPeriods: array of { value: '1', label: 'Periods 1 & 2' } from teachers.periods
// currentSchedule: the active SCHEDULES entry
// periodInfo: result of getCurrentPeriodInfo
// Returns the teacher period value (e.g. '1') to query student_periods with, or null.
export function getTeacherActivePeriod(teacherPeriods, currentSchedule, periodInfo) {
  if (!periodInfo?.current || periodInfo.current.break) return null
  const currentId = periodInfo.current.id
  const covers = periodInfo.current.covers || [currentId]

  // 1. Direct match — clock period id matches a teacher period exactly
  const direct = teacherPeriods.find(tp => tp.value === currentId)
  if (direct) return direct.value

  // 2. Covers match — block schedule covers this teacher period (e.g. blockThu id='2' covers '1')
  const covered = teacherPeriods.find(tp => covers.includes(tp.value))
  if (covered) return covered.value

  // 3. Time-proximity fallback — find closest teacher period by start time
  if (currentSchedule) {
    const now = nowMins()
    let bestMatch = null
    let bestDiff = Infinity
    for (const tp of teacherPeriods) {
      const sp = currentSchedule.periods.find(p => p.id === tp.value)
      if (sp) {
        const diff = Math.abs(now - toMins(sp.start))
        if (diff < bestDiff) { bestDiff = diff; bestMatch = tp.value }
      }
    }
    if (bestMatch) return bestMatch

    // 4. Index-based fallback — map by position in non-break periods
    const activePeriods = currentSchedule.periods.filter(p => !p.break)
    const idx = activePeriods.findIndex(p => p.id === currentId)
    if (idx >= 0 && idx < teacherPeriods.length) return teacherPeriods[idx].value
  }

  // 5. Last resort — first teacher period
  return teacherPeriods.length > 0 ? teacherPeriods[0].value : null
}
