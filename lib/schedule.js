// ── lib/schedule.js
// RHS Bell Schedule detection and period lookup
// Used by kiosk, teacher dashboard, and mobile pass page

// ── Schedule definitions ──────────────────────────────────────────────────────

const SCHEDULES = {
  regular: {
    name: 'Regular',
    periods: [
      { id: '1', label: 'Period 1', start: '08:10', end: '09:02' },
      { id: '2', label: 'Period 2', start: '09:06', end: '09:56' },
      { id: 'brunch', label: 'Brunch', start: '09:56', end: '10:11', break: true },
      { id: '3', label: 'Period 3', start: '10:15', end: '11:05' },
      { id: '4', label: 'Period 4', start: '11:09', end: '11:59' },
      { id: 'lunch', label: 'Lunch', start: '11:59', end: '12:33', break: true },
      { id: '5', label: 'Period 5', start: '12:37', end: '13:27' },
      { id: '6', label: 'Period 6', start: '13:31', end: '14:21' },
      { id: '7', label: 'Period 7', start: '14:25', end: '15:15' },
    ],
  },
  earlyRelease: {
    name: 'Early Release',
    periods: [
      { id: '1', label: 'Period 1', start: '08:10', end: '08:56' },
      { id: '2', label: 'Period 2', start: '09:00', end: '09:41' },
      { id: '3', label: 'Period 3', start: '09:45', end: '10:26' },
      { id: '4', label: 'Period 4', start: '10:30', end: '11:11' },
      { id: 'lunch', label: 'Lunch', start: '11:11', end: '11:45', break: true },
      { id: '5', label: 'Period 5', start: '11:49', end: '12:30' },
      { id: '6', label: 'Period 6', start: '12:34', end: '13:15' },
      { id: '7', label: 'Period 7', start: '13:19', end: '14:00' },
    ],
  },
  blockWed: {
    name: 'Block Day (Wed)',
    periods: [
      { id: '1', label: 'Periods 1 & 2', start: '08:10', end: '09:57' },
      { id: 'brunch', label: 'Brunch', start: '09:57', end: '10:12', break: true },
      { id: '3', label: 'Periods 3 & 4', start: '10:16', end: '11:59' },
      { id: 'lunch', label: 'Lunch', start: '11:59', end: '12:33', break: true },
      { id: '5', label: 'Periods 5 & 6', start: '12:37', end: '14:20' },
      { id: '7', label: 'Period 7', start: '14:24', end: '15:15' },
    ],
  },
  blockThu: {
    name: 'Block Day (Thu)',
    periods: [
      { id: '2', label: 'Periods 1 & 2', start: '08:10', end: '09:57' },
      { id: 'brunch', label: 'Brunch', start: '09:57', end: '10:12', break: true },
      { id: '4', label: 'Periods 3 & 4', start: '10:16', end: '11:59' },
      { id: 'lunch', label: 'Lunch', start: '11:59', end: '12:33', break: true },
      { id: '6', label: 'Periods 5 & 6', start: '12:37', end: '14:20' },
      { id: '7', label: 'Period 7', start: '14:24', end: '15:15' },
    ],
  },
  minimum: {
    name: 'Minimum Day',
    periods: [
      { id: '1', label: 'Period 1', start: '08:10', end: '08:46' },
      { id: '2', label: 'Period 2', start: '08:50', end: '09:23' },
      { id: '3', label: 'Period 3', start: '09:27', end: '10:00' },
      { id: '4', label: 'Period 4', start: '10:04', end: '10:37' },
      { id: 'brunch', label: 'Brunch/Lunch', start: '10:37', end: '11:10', break: true },
      { id: '5', label: 'Period 5', start: '11:14', end: '11:47' },
      { id: '6', label: 'Period 6', start: '11:51', end: '12:24' },
      { id: '7', label: 'Period 7', start: '12:28', end: '13:01' },
    ],
  },
  activity: {
    name: 'Activity Day',
    periods: [
      { id: '1', label: 'Period 1', start: '08:10', end: '08:56' },
      { id: '2', label: 'Period 2', start: '09:00', end: '09:44' },
      { id: 'brunch', label: 'Brunch', start: '09:44', end: '09:59', break: true },
      { id: '3', label: 'Period 3', start: '10:03', end: '10:47' },
      { id: '4', label: 'Period 4', start: '10:51', end: '11:35' },
      { id: '5', label: 'Period 5', start: '11:39', end: '12:23' },
      { id: 'lunch', label: 'Lunch', start: '12:23', end: '12:57', break: true },
      { id: '6', label: 'Period 6', start: '13:01', end: '13:45' },
      { id: '7', label: 'Period 7', start: '13:49', end: '14:33' },
    ],
  },
  foggy: {
    name: 'Foggy/Late Arrival',
    periods: [
      { id: '1', label: 'Period 1', start: '10:00', end: '10:44' },
      { id: '2', label: 'Period 2', start: '10:48', end: '11:28' },
      { id: '3', label: 'Period 3', start: '11:32', end: '12:12' },
      { id: 'lunch', label: 'Lunch', start: '12:12', end: '12:49', break: true },
      { id: '4', label: 'Period 4', start: '12:53', end: '13:33' },
      { id: '5', label: 'Period 5', start: '13:37', end: '14:17' },
      { id: '6', label: 'Period 6', start: '14:21', end: '15:01' },
      { id: '7', label: 'Period 7', start: '15:05', end: '15:45' },
    ],
  },
  codeDay: {
    name: 'C.O.D.E Day',
    periods: [
      { id: '1', label: 'Period 1', start: '08:10', end: '08:56' },
      { id: '2', label: 'Period 2', start: '09:00', end: '09:44' },
      { id: 'brunch', label: 'Brunch', start: '09:44', end: '09:59', break: true },
      { id: '3', label: 'Period 3', start: '10:03', end: '10:47' },
      { id: '4', label: 'Period 4', start: '10:51', end: '11:35' },
      { id: 'rally', label: 'Kickball Rally', start: '11:39', end: '12:17', break: true },
      { id: 'lunch', label: 'Lunch', start: '12:17', end: '12:51', break: true },
      { id: '5', label: 'Period 5', start: '12:55', end: '13:39' },
      { id: '6', label: 'Period 6', start: '13:43', end: '14:27' },
      { id: '7', label: 'Period 7', start: '14:31', end: '15:15' },
    ],
  },
}

// ── No-school dates ───────────────────────────────────────────────────────────
const NO_SCHOOL_DATES = [
  '2025-09-01', '2025-11-11', '2025-11-27', '2025-11-28',
  '2025-12-22', '2025-12-23', '2025-12-24', '2025-12-25', '2025-12-26',
  '2025-12-29', '2025-12-30', '2025-12-31',
  '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06',
  '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12',
  '2026-01-19', '2026-02-09', '2026-02-16',
  '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03',
  '2026-05-25',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toDateString(date) {
  return date.toISOString().split('T')[0]
}

export function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

export function nowMinutes(now) {
  return now.getHours() * 60 + now.getMinutes()
}

function isNoSchool(dateStr) {
  return NO_SCHOOL_DATES.includes(dateStr)
}

function schoolDaysThisWeek(date) {
  const day = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  let count = 0
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (!isNoSchool(toDateString(d))) count++
  }
  return count
}

// ── Calendar fetch ────────────────────────────────────────────────────────────

const CALENDAR_URL = 'https://script.google.com/macros/s/AKfycbwdoA4UVuCyq8RU7hP6dBrRWAMVcMqq-0DNmZE09j6oVst1iPa7KzWq7raoCT3i0SL_/exec'

export async function fetchTodayScheduleType(date = new Date()) {
  const dateStr = toDateString(date)
  const dayOfWeek = date.getDay()

  if (dayOfWeek === 0 || dayOfWeek === 6) return { type: 'noSchool', schedule: null }
  if (isNoSchool(dateStr)) return { type: 'noSchool', schedule: null }

  let calendarEvents = []
  try {
    const res = await fetch(`${CALENDAR_URL}?date=${dateStr}`)
    const data = await res.json()
    if (data.status === 'ok') calendarEvents = data.events || []
  } catch (e) {}

  const titles = calendarEvents.map(e => e.title?.toLowerCase() || '')
  const has = (kw) => titles.some(t => t.includes(kw))

  if (has('foggy') || has('late arrival')) return { type: 'foggy', schedule: SCHEDULES.foggy }
  if (has('minimum')) return { type: 'minimum', schedule: SCHEDULES.minimum }
  if (has('code day')) return { type: 'codeDay', schedule: SCHEDULES.codeDay }
  if (has('activity')) return { type: 'activity', schedule: SCHEDULES.activity }
  if (has('block')) {
    const s = dayOfWeek === 3 ? SCHEDULES.blockWed : SCHEDULES.blockThu
    return { type: dayOfWeek === 3 ? 'blockWed' : 'blockThu', schedule: s }
  }
  if (has('early release')) return { type: 'earlyRelease', schedule: SCHEDULES.earlyRelease }

  const schoolDays = schoolDaysThisWeek(date)
  if (schoolDays <= 4) return { type: 'regular', schedule: SCHEDULES.regular }

  if (dayOfWeek === 1) return { type: 'earlyRelease', schedule: SCHEDULES.earlyRelease }
  if (dayOfWeek === 3) return { type: 'blockWed', schedule: SCHEDULES.blockWed }
  if (dayOfWeek === 4) return { type: 'blockThu', schedule: SCHEDULES.blockThu }
  return { type: 'regular', schedule: SCHEDULES.regular }
}

// ── Period detection ──────────────────────────────────────────────────────────

export function getCurrentPeriodInfo(schedule, now = new Date()) {
  if (!schedule) return { status: 'noSchool', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }

  const mins = nowMinutes(now)
  const periods = schedule.periods

  if (mins < toMinutes(periods[0].start)) {
    return {
      status: 'before', current: null, next: periods[0],
      minutesUntilNext: toMinutes(periods[0].start) - mins,
      minutesLeftInCurrent: 0,
    }
  }

  const last = periods[periods.length - 1]
  if (mins >= toMinutes(last.end)) {
    return { status: 'after', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }
  }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    const start = toMinutes(p.start)
    const end = toMinutes(p.end)

    if (mins >= start && mins < end) {
      const minutesLeftInCurrent = end - mins
      const next = periods[i + 1] || null
      const minutesUntilNext = next ? toMinutes(next.start) - mins : 0
      return {
        status: p.break ? 'break' : 'period',
        current: p, next, minutesUntilNext, minutesLeftInCurrent,
      }
    }

    if (i < periods.length - 1) {
      const nextP = periods[i + 1]
      const gap_start = end
      const gap_end = toMinutes(nextP.start)
      if (mins >= gap_start && mins < gap_end) {
        return {
          status: 'passing', current: null, next: nextP,
          minutesUntilNext: gap_end - mins, minutesLeftInCurrent: 0,
        }
      }
    }
  }

  return { status: 'before', current: null, next: null, minutesUntilNext: 0, minutesLeftInCurrent: 0 }
}

// ── Pass status (color logic) ─────────────────────────────────────────────────
//
//  🔴 Red    — first 15 min after bell (minutesSinceStart < 15)
//  🟢 Green  — safe window (minutesSinceStart >= 15 AND minutesLeft > 20)
//  🟡 Yellow — warning window (minutesLeft 16–20, heads up, last chance)
//  🔴 Red    — last 15 min (minutesLeft <= 15)
//
export function getCheckoutStatus(periodInfo) {
  if (!periodInfo || periodInfo.status !== 'period') return 'ok'
  const { minutesLeftInCurrent, current } = periodInfo
  if (!current || current.break) return 'ok'

  const now = new Date()
  const mins = nowMinutes(now)
  const minutesSinceStart = mins - toMinutes(current.start)

  if (minutesSinceStart < 15) return 'first15'      // 🔴 first 15
  if (minutesLeftInCurrent <= 15) return 'last15'   // 🔴 last 15
  if (minutesLeftInCurrent <= 20) return 'warning20' // 🟡 16–20 min left
  return 'ok'                                        // 🟢 safe window
}

// ── Status display helpers ────────────────────────────────────────────────────

export function getStatusColor(checkoutStatus) {
  switch (checkoutStatus) {
    case 'first15':
    case 'last15':   return { bg: '#dc2626', text: 'white', dot: '🔴' }
    case 'warning20': return { bg: '#f59e0b', text: 'white', dot: '🟡' }
    case 'ok':
    default:          return { bg: '#166534', text: 'white', dot: '🟢' }
  }
}

export function getStatusMessage(checkoutStatus, periodInfo) {
  const left = periodInfo?.minutesLeftInCurrent ?? 0
  switch (checkoutStatus) {
    case 'first15':
      return { primary: 'First 15 min — Hold students', secondary: `OK to send out in ~${Math.max(0, 15 - (nowMinutes(new Date()) - toMinutes(periodInfo?.current?.start || '00:00')))} min` }
    case 'last15':
      return { primary: 'Last 15 min — Hold students', secondary: `${left} min until end of period` }
    case 'warning20':
      return { primary: 'Last chance to send students out', secondary: `${left} min left — red in ${left - 15} min` }
    case 'ok':
    default:
      return { primary: 'OK to send students out', secondary: `${left} min remaining in ${periodInfo?.current?.label || 'period'}` }
  }
}

export { SCHEDULES }
