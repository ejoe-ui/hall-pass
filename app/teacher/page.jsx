/*
  PassAble — RHS Hall Pass System
  FILE:    app/teacher/page.jsx
  ROUTE:   /teacher
  PURPOSE: Teacher dashboard — hall pass checkout, student tracking, late passes,
           pull passes, settings, schedule detection, period status bar.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, passes, pass_holds, do_not_let_out, settings)
  AUTH:    Password-based (passcode). Default = room number doubled (room 27 → "2727").
           First login shows a forced password change screen (must_change_password flag).
  UPDATED: 2026-06-22 — schedule logic extracted to lib/schedules.js; multi-room support: comma-separate rooms in teacher.room field, room picker in header
*/

'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'
import { SCHEDULES, SCHEDULE_LABELS, fetchTodayScheduleType, getCurrentPeriodInfo, getCheckoutStatus, dateStr } from '../../lib/schedules'

// ── Photo URL resolver ────────────────────────────────────────────────────────
// Returns photo_url (direct) only. Storage photos (photo_file) are loaded
// as signed URLs via the photoUrls state map in loadSignedPhotoUrls().
function getStudentPhotoUrl(student) {
  if (!student) return null
  return student.photo_url || null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const RHS_GREEN = '#006938'
const TIME_LIMIT = 10

// Locale-safe formatters (avoids React hydration mismatch #418)
function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

const REASONS = [
  'Restroom', 'Library', 'Office', 'Counselor', 'Lockers',
  'Errand', 'On Assignment', 'Career Counselor', 'Other',
]

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cozad', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Joe', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

const ERRAND_LOCATIONS = [
  'Car', 'Farm', 'Leadership Room', 'Cafeteria', 'Outpost', 'Quad',
  'Corral', 'North Gym', 'South Gym', 'Football Field', 'Tennis Courts', 'Office',
]

// ── Period Status Bar ─────────────────────────────────────────────────────────
function PeriodStatusBar({ periodInfo, checkoutStatus, blockMinsEnabled }) {
  if (!periodInfo || periodInfo.status === 'noSchool') return null

  const left = periodInfo.minutesLeftInCurrent

  if (periodInfo.status === 'break' || periodInfo.status === 'passing') {
    const label = periodInfo.current?.label || 'Passing Period'
    const next = periodInfo.next
    return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1d4ed8', color: 'white', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}>
        <span>⏸ {label}</span>
        {next && <span>Next: {next.label} in {periodInfo.minutesUntilNext} min</span>}
      </div>
    )
  }

  if (periodInfo.status === 'before') return (
    <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#4b5563', color: 'white', fontSize: 12, fontWeight: 600 }}>
      <span>🏫 School starts soon</span>
      {periodInfo.next && <span>{periodInfo.next.label} in {periodInfo.minutesUntilNext} min</span>}
    </div>
  )

  if (periodInfo.status === 'after') return (
    <div style={{ width: '100%', padding: '6px 24px', textAlign: 'center', backgroundColor: '#4b5563', color: 'white', fontSize: 12, fontWeight: 600 }}>
      🏁 School day complete
    </div>
  )

  if (periodInfo.status === 'period') {
    if (!blockMinsEnabled) return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#166534', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>{periodInfo.current?.label}</span>
        <span>{left} min remaining</span>
      </div>
    )

    const now = new Date()
    const [h, m] = (periodInfo.current?.start || '00:00').split(':').map(Number)
    const sinceStart = now.getHours() * 60 + now.getMinutes() - (h * 60 + m)

    if (checkoutStatus === 'first15') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dc2626', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🔴 First 15 min — Hold students</span>
        <span>Green in ~{Math.max(0, 15 - sinceStart)} min</span>
      </div>
    )

    if (checkoutStatus === 'warning20') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#d97706', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🟡 Last chance — {left} min left</span>
        <span>Red in {left - 15} min</span>
      </div>
    )

    if (checkoutStatus === 'last15') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dc2626', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🔴 Last 15 min — Hold students</span>
        <span>{left} min until bell</span>
      </div>
    )

    return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#166534', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🟢 OK to send students out</span>
        <span>{left} min left in {periodInfo.current?.label}</span>
      </div>
    )
  }

  return null
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
function playTone(freqA, freqB) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(freqA, ctx.currentTime)
    osc.frequency.setValueAtTime(freqB, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch (e) {}
}
const playAlert = () => playTone(880, 660)
const playClearAlert = () => playTone(660, 880)

function playDnloAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.25)
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2)
      osc.start(ctx.currentTime + i * 0.25); osc.stop(ctx.currentTime + i * 0.25 + 0.2)
    }
  } catch (e) {}
}

// ── Print helpers ─────────────────────────────────────────────────────────────
const RECEIPT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 72mm; margin: 0 auto; }
  body { font-family: 'Courier New', monospace; font-size: 17px; padding: 8px 10px; text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 9px 0; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 2px; }
  .value { font-size: 20px; font-weight: bold; margin-bottom: 8px; }
  .tag { display: inline-block; border: 2px solid #000; padding: 4px 10px; font-weight: bold; font-size: 14px; letter-spacing: 0.1em; margin-bottom: 8px; }
  .header-title { font-size: 26px; font-weight: bold; }
  .header-sub { font-size: 12px; margin-bottom: 4px; }
  .sig-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 4px; }
  .sig-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto 4px auto; height: 28px; }
  .sig-name { font-size: 13px; color: #555; }
  .footer { font-size: 12px; color: #444; margin-top: 10px; line-height: 1.6; }
  @media print { html, body { margin: 0 auto; } }
`

function printHallPass({ passId, studentName, reason, timeIssued, room }) {
  const passUrl = `https://hall-pass-lime.vercel.app/pass/${passId}`
  const win = window.open('', '_blank', 'width=420,height=600')
  win.document.write(`<!DOCTYPE html><html><head><title>Hall Pass</title>
    <style>${RECEIPT_STYLES}
      img.qr { width: 120px; height: 120px; margin: 8px auto; display: block; }
    </style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">HALL PASS</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Reason</div><div class="value">${reason}</div>
    <div class="divider"></div>
    <div class="label">Time Out</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div class="footer">Return to Room ${room} promptly.<br/>Scan QR for live pass timer.</div>
    <script>
      const img = new Image();
      img.className = 'qr';
      img.onload = function() { document.body.appendChild(img); window.print(); }
      img.onerror = function() { window.print(); }
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent('${passUrl}')
    </script></body></html>`)
  win.document.close()
}

function printLatePass({ studentName, toTeacher, timeIssued, lateReason, issuedBy, room }) {
  const win = window.open('', '_blank', 'width=420,height=650')
  win.document.write(`<!DOCTYPE html><html><head><title>Late Pass</title>
    <style>${RECEIPT_STYLES}</style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">LATE PASS TO CLASS</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Reporting To</div><div class="value">${toTeacher}</div>
    <div class="label">Issued By</div><div class="value">${issuedBy}</div>
    ${lateReason ? `<div class="label">Reason for Lateness</div><div class="value">${lateReason}</div>` : ''}
    <div class="divider"></div>
    <div class="label">Date & Time Issued</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div class="sig-label">Signature / Initials</div>
    <div class="sig-line"></div>
    <div class="sig-name">${issuedBy} · Room ${room}</div>
    <div class="divider"></div>
    <div class="footer">Student is not expected to return to Room ${room}.<br/>Please mark student appropriately upon arrival.</div>
    <script>window.onload = function() { window.print(); }</script>
    </body></html>`)
  win.document.close()
}

function printPullPass({ studentName, fromTeacher, purpose, timeIssued, issuedBy, room }) {
  const win = window.open('', '_blank', 'width=420,height=550')
  win.document.write(`<!DOCTYPE html><html><head><title>Pull Pass</title>
    <style>${RECEIPT_STYLES}</style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">REQUEST TO RELEASE STUDENT</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Currently In</div><div class="value">${fromTeacher}</div>
    <div class="label">Requested By</div><div class="value">${issuedBy} · Room ${room}</div>
    ${purpose ? `<div class="label">Purpose</div><div class="value">${purpose}</div>` : ''}
    <div class="divider"></div>
    <div class="label">Date & Time</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;gap:10px;">
      <div style="flex:1;text-align:center;">
        <div class="sig-label">Authorized By</div>
        <div class="sig-line"></div>
        <div class="sig-name">${issuedBy} · Rm ${room}</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div class="sig-label">Released By</div>
        <div class="sig-line"></div>
        <div class="sig-name">${fromTeacher}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="footer">Please send student to Room ${room}.<br/>Thank you!</div>
    <script>window.onload = function() { window.print(); }</script>
    </body></html>`)
  win.document.close()
}

async function notifyReceivingTeacher({ toTeacher, studentName, issuedBy, timeIssued, passUrl }) {
  console.log('[PassAble] Late pass notification:', { to: `${toTeacher.toLowerCase().replace(/\s+/g, '.')}@rjusd.org`, subject: `Late Pass — ${studentName} heading your way`, body: `${studentName} issued a late pass to your class by ${issuedBy} at ${timeIssued}. Pass: ${passUrl}` })
}

// ── Schedule picker with hover preview ───────────────────────────────────────
function to12h(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function ScheduleSelectWithPreview({ value, onChange, labels, schedules }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handleOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const previewKey = hovered || value
  const preview = schedules[previewKey]

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full p-2 text-sm rounded-lg bg-white text-gray-800 text-left flex items-center justify-between border-2"
        style={{ borderColor: RHS_GREEN }}>
        <span>{labels[value] || value}</span>
        <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)', display: 'flex', minWidth: '100%' }}>
          {/* Option list */}
          <div style={{ minWidth: 220, maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
            {Object.entries(labels).map(([k, v]) => (
              <div key={k}
                onMouseEnter={() => setHovered(k)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => { onChange(k); setOpen(false) }}
                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                  background: hovered === k ? '#f0fdf4' : 'transparent',
                  color: k === value ? RHS_GREEN : '#374151',
                  fontWeight: k === value ? 600 : 400 }}>
                <span style={{ width: 12, fontSize: 10 }}>{k === value ? '✓' : ''}</span>
                {v}
              </div>
            ))}
          </div>

          {/* Preview panel */}
          <div style={{ width: 210, borderLeft: '1px solid #f3f4f6', background: '#fafafa', borderRadius: '0 10px 10px 0', padding: '10px 12px', minHeight: 80 }}>
            {previewKey === 'custom' ? (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: RHS_GREEN, marginBottom: 6 }}>Custom…</p>
                <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>You'll define your own period times below after selecting.</p>
              </>
            ) : preview ? (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: RHS_GREEN, marginBottom: 6 }}>{preview.name}</p>
                {preview.periods.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2.5,
                    color: p.break ? '#9ca3af' : '#374151' }}>
                    <span style={{ fontStyle: p.break ? 'italic' : 'normal' }}>{p.label}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6b7280' }}>{to12h(p.start)}–{to12h(p.end)}</span>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ fontSize: 11, color: '#9ca3af' }}>Hover a schedule to preview its periods.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
function TeacherInner() {
  const searchParams = useSearchParams()

  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Help panel (draggable, no backdrop)
  const [showHelp, setShowHelp] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [helpPos, setHelpPos] = useState({ x: 0, y: 0 })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (showHelp) {
      setHelpPos({ x: Math.max(0, window.innerWidth - 440), y: 80 })
    }
  }, [showHelp])

  function startHelpDrag(e) {
    if (e.button !== 0) return
    const rect = helpPanelRef.current.getBoundingClientRect()
    helpDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    function onMove(e) {
      setHelpPos({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - helpDragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - helpDragOffset.current.y)),
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // First-login forced password change
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [firstPwNew, setFirstPwNew] = useState('')
  const [firstPwConfirm, setFirstPwConfirm] = useState('')
  const [firstPwError, setFirstPwError] = useState('')
  const [firstPwSaving, setFirstPwSaving] = useState(false)

  // Unlock QR (for dashboard settings panel only)
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockQR, setUnlockQR] = useState('')

  // Period & data
  const [activePeriod, setActivePeriod] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [heldPasses, setHeldPasses] = useState([])
  const [missedPasses, setMissedPasses] = useState([])
  const [checkingInMissed, setCheckingInMissed] = useState(null)
  const [dnloList, setDnloList] = useState([])
  const [students, setStudents] = useState({})
  const [allStudents, setAllStudents] = useState([])
  const [now, setNow] = useState(Date.now())
  const notifiedPassesRef = useRef(new Set()) // track which pass IDs have already triggered an alert
  const [warningsEnabled, setWarningsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('passable_warnings') !== 'false'
  })

  // Token system
  const [tokensEnabled, setTokensEnabled]               = useState(false)
  const [tokensPerPeriod, setTokensPerPeriod]           = useState(5)
  const [gradingPeriodStart, setGradingPeriodStart]     = useState(() => new Date().toISOString().slice(0, 10))
  const [tokenSummary, setTokenSummary]                 = useState([]) // [{id, name, used, remaining}]
  const [tokenSummaryLoading, setTokenSummaryLoading]   = useState(false)
  const [tokenSettingsSaved, setTokenSettingsSaved]     = useState(false)
  const [showTokenSummary, setShowTokenSummary]         = useState(false)

  // Pass frequency limit
  const [passLimitEnabled, setPassLimitEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('passable_pass_limit') === 'true'
  })
  const [passLimitThreshold, setPassLimitThreshold] = useState(() => {
    if (typeof window === 'undefined') return 5
    return parseInt(localStorage.getItem('passable_pass_limit_threshold') || '5', 10)
  })
  const [passLimitSaved, setPassLimitSaved] = useState(false)
  const [weeklyPassCounts, setWeeklyPassCounts] = useState({}) // student_id → count

  // Schedule & period status
  const [currentSchedule, setCurrentSchedule] = useState(null)
  const [periodInfo, setPeriodInfo] = useState(null)
  const [checkoutStatus, setCheckoutStatus] = useState('ok')
  const [blockMinsEnabled, setBlockMinsEnabled] = useState(true)
  // Schedule override
  const [scheduleIsOverride, setScheduleIsOverride] = useState(false)
  const [scheduleType, setScheduleType] = useState('regular')
  const [overridePickType, setOverridePickType] = useState('regular')
  const [overrideCustomPeriods, setOverrideCustomPeriods] = useState([
    { id: '1', label: 'Period 1', start: '', end: '', break: false }
  ])
  const [overrideSaving, setOverrideSaving] = useState(false)
  const latestRoomRef = useRef(null)

  // Checkout form
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [errandTeacher, setErrandTeacher] = useState('')
  const [purposeText, setPurposeText] = useState('')

  // Modals
  const [showLatePass, setShowLatePass] = useState(false)
  const [lateStudents, setLateStudents] = useState([])
  const [lateSearchInput, setLateSearchInput] = useState('')
  const [lateSearchOpen, setLateSearchOpen] = useState(false)
  const lateSearchRef = useRef(null)
  const [lateTeacher, setLateTeacher] = useState('')
  const [lateReason, setLateReason] = useState('')
  const [issuingLatePass, setIssuingLatePass] = useState(false)
  const [latePassSuccess, setLatePassSuccess] = useState(null)
  const [showPullPass, setShowPullPass] = useState(false)
  const [pullStudentName, setPullStudentName] = useState('')
  const [pullFromTeacher, setPullFromTeacher] = useState('')
  const [pullPurpose, setPullPurpose] = useState('')

  // Self-checkout
  const [selfCheckoutMode, setSelfCheckoutMode] = useState(false)
  const [selfCheckoutCode, setSelfCheckoutCode] = useState('')
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [kioskReturnSaved, setKioskReturnSaved] = useState(false)

  // Cowboy Wire — inline self-checkout toggle
  const [wireCheckoutEnabled, setWireCheckoutEnabled] = useState(false)
  const [wireCheckoutSaving, setWireCheckoutSaving] = useState(false)

  // Multi-room support
  const [selectedRoom, setSelectedRoom] = useState(null)

  // Cowboy Wire — Class Objectives
  const [showObjectives,  setShowObjectives]  = useState(false)
  const [objPeriod,       setObjPeriod]       = useState('1')
  const [objAlsoPeriods,  setObjAlsoPeriods]  = useState([])  // additional periods to copy to on save
  const [objClassName,    setObjClassName]    = useState('')
  const [objTopic,        setObjTopic]        = useState('')
  const [objLines,        setObjLines]        = useState(['', '', ''])   // up to 5 objectives
  const [objDoNow,        setObjDoNow]        = useState('')
  const [objGotIt,        setObjGotIt]        = useState('')
  const [objSaving,       setObjSaving]       = useState(false)
  const [objSaved,        setObjSaved]        = useState(false)
  const [objSavedPeriods, setObjSavedPeriods] = useState([])
  const [objLoading,      setObjLoading]      = useState(false)

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [subCode, setSubCode] = useState('')
  const [newSubCode, setNewSubCode] = useState('')
  const [subCodeSaved, setSubCodeSaved] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [printPasses, setPrintPasses] = useState(false)
  const [printPassesSaved, setPrintPassesSaved] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [teacherDnloList, setTeacherDnloList] = useState([])
  const [rotated, setRotated] = useState(false)
  const [photoUrls, setPhotoUrls] = useState({})
  const [sessionTimeout, setSessionTimeout] = useState(30) // null=off, 30, 60 (minutes). Default 30.
  const [sessionTimeoutSaved, setSessionTimeoutSaved] = useState(false)

  // Notifications
  const [incomingNotifs, setIncomingNotifs] = useState([]) // students heading to me
  const [outgoingNotifs, setOutgoingNotifs] = useState([]) // my sent students — return updates
  const [receiveNotifications, setReceiveNotifications] = useState(true)
  const [notifSaved, setNotifSaved] = useState(false)

  const prevHeldIds = useRef([])
  const prevActiveIds = useRef([])
  const inactivityTimerRef = useRef(null)
  const sessionTimeoutRef = useRef(30)

  // ── Schedule detection ─────────────────────────────────────────────────────
  // Keep a ref so the 60s interval always uses the latest room
  useEffect(() => {
    latestRoomRef.current = selectedRoom || currentTeacher?.room?.split(',')[0]?.trim() || null
  }, [selectedRoom, currentTeacher])

  useEffect(() => {
    detectSchedule()
    const t = setInterval(detectSchedule, 60000)
    return () => clearInterval(t)
  }, [])

  // Re-detect when teacher logs in or switches rooms
  useEffect(() => {
    if (currentTeacher) detectSchedule()
  }, [currentTeacher?.id, selectedRoom])

  async function detectSchedule() {
    const result = await fetchTodayScheduleType(new Date(), latestRoomRef.current)
    setCurrentSchedule(result.schedule)
    setScheduleIsOverride(result.isOverride)
    setScheduleType(result.type)
    updatePeriodStatus(result.schedule)
  }

  async function saveScheduleOverride() {
    const room = latestRoomRef.current
    if (!room) return
    setOverrideSaving(true)
    const ds = dateStr(new Date())
    await supabase.from('settings').upsert({ key: `schedule_override_${room}_${ds}`, value: overridePickType }, { onConflict: 'key' })
    if (overridePickType === 'custom') {
      await supabase.from('settings').upsert({ key: `schedule_override_custom_${room}_${ds}`, value: JSON.stringify(overrideCustomPeriods) }, { onConflict: 'key' })
    }
    setOverrideSaving(false)
    detectSchedule()
  }

  async function clearScheduleOverride() {
    const room = latestRoomRef.current
    if (!room) return
    const ds = dateStr(new Date())
    await supabase.from('settings').delete().in('key', [`schedule_override_${room}_${ds}`, `schedule_override_custom_${room}_${ds}`])
    detectSchedule()
  }

  function updatePeriodStatus(schedule) {
    const info = getCurrentPeriodInfo(schedule, new Date())
    setPeriodInfo(info)
    setCheckoutStatus(getCheckoutStatus(info))
  }

  useEffect(() => {
    if (!currentSchedule) return
    const t = setInterval(() => updatePeriodStatus(currentSchedule), 30000)
    return () => clearInterval(t)
  }, [currentSchedule])

  // ── Close late pass search on outside click ────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (lateSearchRef.current && !lateSearchRef.current.contains(e.target)) setLateSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Inactivity / auto sign-out ─────────────────────────────────────────────
  // Keep ref in sync so the timer callback always sees the latest value
  useEffect(() => { sessionTimeoutRef.current = sessionTimeout }, [sessionTimeout])

  function resetInactivityTimer() {
    const mins = sessionTimeoutRef.current
    if (!mins) return
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(async () => {
      await supabase.auth.signOut()
    }, mins * 60 * 1000)
  }

  useEffect(() => {
    if (!session) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      return
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [session])

  // ── Auth effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) { loadSettings(); loadCurrentTeacher() }
  }, [session])

  // ── Check must_change_password after teacher loads ─────────────────────────
  useEffect(() => {
    if (!currentTeacher) return
    if (currentTeacher.must_change_password) {
      setMustChangePassword(true)
    }
    if (currentTeacher.unlock_code) {
      setUnlockCode(currentTeacher.unlock_code)
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${currentTeacher.unlock_code}&room=${currentTeacher.room || '27'}`
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setUnlockQR)
    }
    if (currentTeacher.print_passes !== undefined) setPrintPasses(!!currentTeacher.print_passes)
    if (currentTeacher.sub_code) setSubCode(currentTeacher.sub_code)
    if (currentTeacher.block_first_last_15 !== undefined) setBlockMinsEnabled(!!currentTeacher.block_first_last_15)
    if (currentTeacher.session_code) setSelfCheckoutCode(currentTeacher.session_code)
    // session_timeout_minutes: undefined/null = use default (30), 0 = off, 30/60 = explicit
    if ('session_timeout_minutes' in currentTeacher) {
      setSessionTimeout(currentTeacher.session_timeout_minutes === 0 ? null : (currentTeacher.session_timeout_minutes || 30))
    }
    if (currentTeacher.receive_notifications !== undefined) setReceiveNotifications(!!currentTeacher.receive_notifications)
    if (currentTeacher.tokens_enabled !== undefined) setTokensEnabled(!!currentTeacher.tokens_enabled)
    if (currentTeacher.tokens_per_period) setTokensPerPeriod(currentTeacher.tokens_per_period)
    if (currentTeacher.grading_period_start) setGradingPeriodStart(currentTeacher.grading_period_start)
  }, [currentTeacher])

  // ── Realtime notification subscription ────────────────────────────────────
  useEffect(() => {
    if (!currentTeacher?.id) return
    loadNotifications()
    const channel = supabase
      .channel(`notifs:${currentTeacher.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_notifications',
        filter: `to_teacher_id=eq.${currentTeacher.id}` }, () => loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_notifications',
        filter: `from_teacher_id=eq.${currentTeacher.id}` }, () => loadNotifications())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [currentTeacher?.id])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'teacher_unlock_code').maybeSingle()
      .then(({ data }) => { if (data) setUnlockCode(data.value) })
  }, [])

  // Initialize selectedRoom + activePeriod when teacher loads — restore from sessionStorage
  useEffect(() => {
    if (!currentTeacher) return
    const rooms = (currentTeacher.room || '27').split(',').map(r => r.trim()).filter(Boolean)
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(`passable_room_${currentTeacher.id}`) : null
    setSelectedRoom(rooms.includes(saved) ? saved : rooms[0])
    const savedPeriod = typeof window !== 'undefined' ? sessionStorage.getItem(`passable_period_${currentTeacher.id}`) : null
    const validPeriods = currentTeacher.periods || []
    if (savedPeriod && validPeriods.includes(savedPeriod)) setActivePeriod(savedPeriod)
  }, [currentTeacher?.id])

  useEffect(() => {
    if (!activePeriod) return
    loadData()
    const timer = setInterval(() => { setNow(Date.now()); loadData() }, 15000)
    return () => clearInterval(timer)
  }, [activePeriod, currentTeacher, selectedRoom])

  // ── Duration warning: browser notification + sound when student crosses TIME_LIMIT ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Request notification permission once
    if (Notification?.permission === 'default') Notification.requestPermission()
  }, [])

  function toggleWarnings() {
    const next = !warningsEnabled
    setWarningsEnabled(next)
    localStorage.setItem('passable_warnings', next ? 'true' : 'false')
  }

  // ── Token system ───────────────────────────────────────────────────────────
  async function saveTokenSettings({ enabled, perPeriod, startDate } = {}) {
    const newEnabled   = enabled   !== undefined ? enabled   : tokensEnabled
    const newPerPeriod = perPeriod !== undefined ? perPeriod : tokensPerPeriod
    const newStart     = startDate !== undefined ? startDate : gradingPeriodStart
    if (enabled   !== undefined) setTokensEnabled(newEnabled)
    if (perPeriod !== undefined) setTokensPerPeriod(newPerPeriod)
    if (startDate !== undefined) setGradingPeriodStart(newStart)
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({
        tokens_enabled: newEnabled,
        tokens_per_period: newPerPeriod,
        grading_period_start: newStart,
      }).eq('id', currentTeacher.id)
    }
    setTokenSettingsSaved(true)
    setTimeout(() => setTokenSettingsSaved(false), 2000)
    if (newEnabled) loadTokenSummary(newPerPeriod, newStart)
  }

  async function loadTokenSummary(perPeriod, startDate) {
    if (!currentTeacher?.id) return
    setTokenSummaryLoading(true)
    const cap  = perPeriod ?? tokensPerPeriod
    const from = startDate ?? gradingPeriodStart
    // All students in teacher's active period + room
    const room = selectedRoom || currentTeacher?.room?.split(',')[0]?.trim() || '27'
    const { data: spRows } = await supabase.from('student_periods').select('student_id').eq('period', activePeriod).eq('room', room)
    const studentIds = (spRows || []).map(r => r.student_id)
    if (!studentIds.length) { setTokenSummary([]); setTokenSummaryLoading(false); return }
    // Pass counts since grading period start + manual adjustments
    const [{ data: passes }, { data: adjustments }] = await Promise.all([
      supabase.from('passes').select('student_id')
        .eq('teacher_id', currentTeacher.id)
        .in('student_id', studentIds)
        .gte('time_out', new Date(from).toISOString()),
      supabase.from('teacher_token_adjustments').select('student_id, amount')
        .eq('teacher_id', currentTeacher.id)
        .in('student_id', studentIds),
    ])
    const counts = {}
    passes?.forEach(p => { counts[p.student_id] = (counts[p.student_id] || 0) + 1 })
    const adjTotals = {}
    adjustments?.forEach(a => { adjTotals[a.student_id] = (adjTotals[a.student_id] || 0) + a.amount })
    const summary = studentIds.map(id => {
      const s    = allStudents.find(s => s.id === id)
      const used = counts[id] || 0
      const adj  = adjTotals[id] || 0
      return { id, name: s?.full_name || '—', used, adj, remaining: Math.max(0, cap - used + adj) }
    }).sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name))
    setTokenSummary(summary)
    setTokenSummaryLoading(false)
  }

  function printTokenSummary() {
    const label = gradingPeriodStart ? `Since ${fmtDate(gradingPeriodStart + 'T00:00:00')}` : 'This Period'
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Token Summary</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Arial,sans-serif;font-size:12px;color:#111;padding:32px}
h1{font-size:20px;font-weight:800;color:#006938;margin-bottom:2px}.sub{font-size:12px;color:#6b7280;margin-bottom:20px}
table{width:100%;border-collapse:collapse}th{background:#f9fafb;text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
td{padding:8px 12px;border-bottom:1px solid #f3f4f6}.green{color:#16a34a;font-weight:700}.red{color:#dc2626;font-weight:700}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<h1>Pass Token Summary</h1>
<div class="sub">Riverdale High School &nbsp;·&nbsp; Period ${activePeriod} &nbsp;·&nbsp; ${label} &nbsp;·&nbsp; ${tokensPerPeriod} tokens/period</div>
<table><thead><tr><th>#</th><th>Student</th><th>Tokens Used</th><th>Tokens Remaining</th></tr></thead><tbody>
${tokenSummary.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.used}${r.adj > 0 ? ` <span style="color:#16a34a;font-size:10px">(+${r.adj} returned)</span>` : ''}</td><td class="${r.remaining > 0 ? 'green' : 'red'}">${r.remaining}</td></tr>`).join('')}
</tbody></table></body></html>`
    const win = window.open('', '_blank', 'width=700,height=600')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  async function returnToken(studentId) {
    if (!currentTeacher?.id) return
    await supabase.from('teacher_token_adjustments').insert({
      teacher_id: currentTeacher.id,
      student_id: studentId,
      amount: 1,
    })
    // Optimistically update summary in place
    setTokenSummary(prev => prev.map(r =>
      r.id === studentId
        ? { ...r, adj: r.adj + 1, remaining: r.remaining + 1 }
        : r
    ))
  }

  useEffect(() => {
    if (!tokensEnabled || !currentTeacher?.id || !activePeriod) return
    loadTokenSummary()
  }, [tokensEnabled, currentTeacher?.id, activePeriod, selectedRoom, allStudents.length])

  // ── Pass frequency limit ───────────────────────────────────────────────────
  useEffect(() => {
    if (!passLimitEnabled || !currentTeacher?.id) return
    loadWeeklyPassCounts()
  }, [passLimitEnabled, currentTeacher?.id])

  async function loadWeeklyPassCounts() {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data } = await supabase
      .from('passes')
      .select('student_id')
      .eq('teacher_id', currentTeacher.id)
      .gte('time_out', weekAgo.toISOString())
    if (!data) return
    const counts = {}
    data.forEach(p => { counts[p.student_id] = (counts[p.student_id] || 0) + 1 })
    setWeeklyPassCounts(counts)
  }

  function togglePassLimit() {
    const next = !passLimitEnabled
    setPassLimitEnabled(next)
    localStorage.setItem('passable_pass_limit', next ? 'true' : 'false')
    if (next && currentTeacher?.id) loadWeeklyPassCounts()
  }

  function savePassLimitThreshold(val) {
    const n = Math.max(1, parseInt(val) || 5)
    setPassLimitThreshold(n)
    localStorage.setItem('passable_pass_limit_threshold', String(n))
    setPassLimitSaved(true)
    setTimeout(() => setPassLimitSaved(false), 2000)
  }

  useEffect(() => {
    if (!warningsEnabled || !activePasses.length) return
    activePasses.forEach(pass => {
      const mins = Math.floor((now - new Date(pass.time_out).getTime()) / 60000)
      if (mins >= TIME_LIMIT && !notifiedPassesRef.current.has(pass.id)) {
        notifiedPassesRef.current.add(pass.id)
        const studentName = students[pass.student_id]?.full_name?.split(' ')[0] || 'A student'
        // Browser notification (works even if tab is in background)
        if (Notification?.permission === 'granted') {
          new Notification('PassAble — Student Over Time', {
            body: `${studentName} has been out ${mins} minutes (${pass.reason})`,
            icon: '/RHSCOWBOYlogo.png',
          })
        }
        // Subtle audio alert using Web Audio API (no file needed)
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
        } catch (e) { /* audio not supported */ }
      }
    })
    // Clean up notified set when passes return
    const activeIds = new Set(activePasses.map(p => p.id))
    notifiedPassesRef.current.forEach(id => { if (!activeIds.has(id)) notifiedPassesRef.current.delete(id) })
  }, [now, activePasses, students, warningsEnabled])

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function loadCurrentTeacher() {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return
    const { data } = await supabase.from('teachers').select('*').eq('auth_id', s.user.id).eq('is_active', true).maybeSingle()
    if (data) setCurrentTeacher(data)
  }

  async function handlePasswordSignIn(e) {
    if (e) e.preventDefault()
    setSigningIn(true); setAuthError('')
    if (!email.endsWith('@rjusd.org') && !email.endsWith('@demo.passable.app')) {
      setAuthError('Only @rjusd.org accounts are allowed.')
      setSigningIn(false); return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Invalid email or passcode / password.')
    setSigningIn(false)
  }

  // ── First-login forced password change ────────────────────────────────────
  async function handleFirstLoginPasswordChange(e) {
    if (e) e.preventDefault()
    setFirstPwError('')
    if (firstPwNew.length < 8) { setFirstPwError('Password must be at least 8 characters.'); return }
    if (firstPwNew !== firstPwConfirm) { setFirstPwError('Passwords do not match.'); return }
    setFirstPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: firstPwNew })
    if (error) {
      setFirstPwError(error.message)
    } else {
      // Clear the flag in the teachers table
      if (currentTeacher?.id) {
        await supabase.from('teachers').update({ must_change_password: false }).eq('id', currentTeacher.id)
        setCurrentTeacher(prev => ({ ...prev, must_change_password: false }))
      }
      setMustChangePassword(false)
      setFirstPwNew(''); setFirstPwConfirm('')
    }
    setFirstPwSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    if (currentTeacher?.id) sessionStorage.removeItem(`passable_period_${currentTeacher.id}`)
    setActivePeriod(null); setShowSettings(false); setCurrentTeacher(null)
    setMustChangePassword(false)
  }

  // ── Cowboy Wire Objectives ─────────────────────────────────────────────────
  async function loadObjectives(period) {
    if (!currentTeacher?.id) return
    setObjLoading(true)
    try {
      const { data } = await supabase
        .from('teacher_objectives')
        .select('*')
        .eq('teacher_id', currentTeacher.id)
        .eq('period', period)
        .single()
      if (data) {
        setObjClassName(data.class_name || '')
        setObjTopic(data.topic || '')
        setObjDoNow(data.do_now || '')
        setObjGotIt(data.got_it_when || '')
        const lines = Array.isArray(data.objectives) ? data.objectives : []
        setObjLines([...lines, '', '', ''].slice(0, Math.max(3, lines.length + 1, 3)))
      } else {
        setObjClassName('')
        setObjTopic('')
        setObjDoNow('')
        setObjGotIt('')
        setObjLines(['', '', ''])
      }
    } catch { /* table may not exist yet — graceful */ }
    setObjLoading(false)
  }

  async function saveObjectives() {
    if (!currentTeacher?.id) return
    setObjSaving(true)
    const objectives  = objLines.map(l => l.trim()).filter(Boolean)
    const allPeriods  = [objPeriod, ...objAlsoPeriods.filter(p => p !== objPeriod)]
    const rows        = allPeriods.map(period => ({
      teacher_id:  currentTeacher.id,
      period,
      class_name:  objClassName.trim(),
      topic:       objTopic.trim() || null,
      objectives,
      do_now:      objDoNow.trim() || null,
      got_it_when: objGotIt.trim() || null,
      updated_at:  new Date().toISOString(),
    }))
    await supabase.from('teacher_objectives').upsert(rows, { onConflict: 'teacher_id,period' })
    setObjSaving(false)
    setObjSaved(true)
    setObjSavedPeriods(allPeriods)
    setTimeout(() => { setObjSaved(false); setObjSavedPeriods([]) }, 3000)
  }

  // Clear one period's objectives (removes the row from DB, wire shows "no objectives" state)
  async function clearObjectivesPeriod(period) {
    if (!currentTeacher?.id) return
    await supabase
      .from('teacher_objectives')
      .delete()
      .eq('teacher_id', currentTeacher.id)
      .eq('period', period)
    if (period === objPeriod) {
      setObjClassName(''); setObjTopic(''); setObjDoNow(''); setObjGotIt('')
      setObjLines(['', '', ''])
    }
  }

  // Clear ALL periods — for breaks/holidays
  async function clearAllObjectives() {
    if (!currentTeacher?.id) return
    if (!window.confirm('Clear objectives for ALL periods? Students will see "no objectives posted" on the wire display until you add new ones.')) return
    await supabase
      .from('teacher_objectives')
      .delete()
      .eq('teacher_id', currentTeacher.id)
    setObjClassName(''); setObjTopic(''); setObjDoNow(''); setObjGotIt('')
    setObjLines(['', '', ''])
    setObjAlsoPeriods([])
  }

  // Load objectives when period tab changes or teacher loads; clear extra periods on switch
  useEffect(() => {
    if (currentTeacher?.id) {
      loadObjectives(objPeriod)
      setObjAlsoPeriods([])
    }
  }, [objPeriod, currentTeacher?.id])

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['teacher_unlock_code', 'sub_code', 'kiosk_return_required', 'print_passes', 'block_first_last_15'])
    if (!data) return
    const get = (key) => data.find(r => r.key === key)?.value
    const teacherUnlockVal = currentTeacher?.unlock_code || get('teacher_unlock_code')
    if (teacherUnlockVal) {
      setUnlockCode(teacherUnlockVal)
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${teacherUnlockVal}&room=${teacherRoom}`
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setUnlockQR)
    }
    if (!currentTeacher?.sub_code && get('sub_code')) setSubCode(get('sub_code'))
    // session_code is per-teacher — loaded from currentTeacher in the teacher effect below
    if (get('kiosk_return_required')) setKioskReturnRequired(get('kiosk_return_required') !== 'false')
    if (!currentTeacher?.print_passes && get('print_passes')) setPrintPasses(get('print_passes') === 'true')
    if (currentTeacher?.block_first_last_15 === undefined && get('block_first_last_15')) setBlockMinsEnabled(get('block_first_last_15') !== 'false')
  }

  async function rotateUnlockCode() {
    setRotating(true)
    const newCode = Math.random().toString(36).substring(2, 12)
    if (currentTeacher?.id) await supabase.from('teachers').update({ unlock_code: newCode }).eq('id', currentTeacher.id)
    await supabase.from('settings').update({ value: newCode }).eq('key', 'teacher_unlock_code')
    setUnlockCode(newCode)
    const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${newCode}&room=${teacherRoom}`
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then(qr => { setUnlockQR(qr); setRotating(false); setRotated(true); setTimeout(() => setRotated(false), 3000) })
  }


  async function saveSubCode() {
    if (newSubCode.length !== 4 || isNaN(newSubCode)) return
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ sub_code: newSubCode }).eq('id', currentTeacher.id)
    } else {
      await supabase.from('settings').update({ value: newSubCode }).eq('key', 'sub_code')
    }
    setSubCode(newSubCode); setNewSubCode(''); setSubCodeSaved(true)
    setTimeout(() => setSubCodeSaved(false), 3000)
  }

  async function saveKioskReturn(val) {
    await supabase.from('settings').upsert({ key: 'kiosk_return_required', value: val ? 'true' : 'false' })
    setKioskReturnRequired(val); setKioskReturnSaved(true)
    setTimeout(() => setKioskReturnSaved(false), 2000)
  }

  async function toggleWireCheckout() {
    if (!teacherRoom) return
    setWireCheckoutSaving(true)
    const next = !wireCheckoutEnabled
    await supabase.from('settings').upsert(
      { key: `self_checkout_enabled_${teacherRoom}`, value: next ? 'true' : 'false' },
      { onConflict: 'key' }
    )
    setWireCheckoutEnabled(next)
    setWireCheckoutSaving(false)
  }

  // Load wire checkout setting when teacher/room is known
  // Use selectedRoom + currentTeacher directly (teacherRoom is a derived const, not available here)
  useEffect(() => {
    const room = selectedRoom || (currentTeacher?.room || '').split(',')[0]?.trim() || '27'
    if (!room || !currentTeacher) return
    async function loadWireCheckout() {
      const { data } = await supabase.from('settings').select('value')
        .eq('key', `self_checkout_enabled_${room}`).single()
      setWireCheckoutEnabled(data?.value === 'true' || data?.value === true)
    }
    loadWireCheckout()
  }, [selectedRoom, currentTeacher])

  async function savePassword() {
    setPasswordError('')
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPasswordError(error.message) } else {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setPasswordSaved(true); setTimeout(() => setPasswordSaved(false), 3000)
    }
    setSavingPassword(false)
  }

  async function saveSessionTimeout(val) {
    setSessionTimeout(val)
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ session_timeout_minutes: val || 0 }).eq('id', currentTeacher.id)
    }
    setSessionTimeoutSaved(true)
    setTimeout(() => setSessionTimeoutSaved(false), 2000)
  }

  // ── Notification functions ─────────────────────────────────────────────────
  async function loadNotifications() {
    if (!currentTeacher?.id) return
    const { data } = await supabase
      .from('pass_notifications')
      .select('*')
      .or(`to_teacher_id.eq.${currentTeacher.id},from_teacher_id.eq.${currentTeacher.id}`)
      .neq('status', 'cleared')
      .order('sent_at', { ascending: false })
    if (!data) return
    setIncomingNotifs(data.filter(n => n.to_teacher_id === currentTeacher.id && !n.cleared_by_receiver))
    setOutgoingNotifs(data.filter(n => n.from_teacher_id === currentTeacher.id && !n.cleared_by_sender && n.status !== 'pending'))
  }

  async function sendPassNotification(passId, studentId, studentName, toTeacherName, reason) {
    // Look up receiving teacher by name (case-insensitive partial match)
    const { data: toTeacher, error: lookupErr } = await supabase
      .from('teachers')
      .select('id, name, receive_notifications')
      .ilike('name', `%${toTeacherName}%`)
      .eq('is_active', true)
      .maybeSingle()
    if (lookupErr) { console.error('[PassAble] Teacher lookup failed:', lookupErr); return }
    if (!toTeacher || toTeacher.receive_notifications === false) return
    const fromName = currentTeacher?.name || 'Teacher'
    const payload = {
      pass_id: passId || null,
      from_teacher_id: currentTeacher.id,
      to_teacher_id: toTeacher.id,
      from_teacher_name: fromName,
      to_teacher_name: toTeacher.name,
      from_room: teacherRoom || '',
      student_id: studentId || null,
      student_name: studentName || 'Student',
      reason: reason || '',
      status: 'pending',
    }
    const { error } = await supabase.from('pass_notifications').insert(payload)
    if (error) console.error('[PassAble] Notification insert failed:', JSON.stringify(error), 'payload:', JSON.stringify(payload))
  }

  async function updateNotifStatus(notifId, status) {
    const now = new Date().toISOString()
    const updates = { status }
    if (status === 'received') updates.received_at = now
    if (status === 'returned') updates.returned_at = now
    await supabase.from('pass_notifications').update(updates).eq('id', notifId)
  }

  async function clearNotif(notifId, role) {
    // role = 'sender' | 'receiver'
    const field = role === 'sender' ? 'cleared_by_sender' : 'cleared_by_receiver'
    await supabase.from('pass_notifications').update({ [field]: true }).eq('id', notifId)
  }

  async function clearAllNotifs() {
    if (!currentTeacher?.id) return
    const incomingIds = incomingNotifs.map(n => n.id)
    const outgoingIds = outgoingNotifs.map(n => n.id)
    const promises = [
      ...incomingIds.map(id => supabase.from('pass_notifications').update({ cleared_by_receiver: true }).eq('id', id)),
      ...outgoingIds.map(id => supabase.from('pass_notifications').update({ cleared_by_sender: true }).eq('id', id)),
    ]
    await Promise.all(promises)
    setIncomingNotifs([])
    setOutgoingNotifs([])
  }

  async function saveReceiveNotifications(val) {
    setReceiveNotifications(val)
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ receive_notifications: val }).eq('id', currentTeacher.id)
    }
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2000)
  }

  async function generateCheckoutCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString()
    setSelfCheckoutCode(code)
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ session_code: code }).eq('id', currentTeacher.id)
    }
  }

  // ── Signed photo URLs ─────────────────────────────────────────────────────
  // Batch-fetch signed URLs for all students who have photo_file (storage photos).
  // Signed URL takes priority over photo_url in JSX — this handles students whose
  // photo_url points to an old public bucket URL that is now private/broken.
  // Chunks into batches of 50 to stay within Supabase limits.
  async function loadSignedPhotoUrls(studs) {
    const withPhotos = (studs || []).filter(s => s?.photo_file)
    if (withPhotos.length === 0) return
    const BATCH = 50
    const map = {}
    for (let i = 0; i < withPhotos.length; i += BATCH) {
      const batch = withPhotos.slice(i, i + BATCH)
      const { data } = await supabase.storage
        .from('student-photos')
        .createSignedUrls(batch.map(s => s.photo_file), 3600)
      if (data) data.forEach((item, j) => { if (item.signedUrl) map[batch[j].id] = item.signedUrl })
    }
    setPhotoUrls(prev => ({ ...prev, ...map }))
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  async function loadData() {
    let passQuery = supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod).order('time_out')
    if (currentTeacher?.id) passQuery = passQuery.eq('teacher_id', currentTeacher.id)
    const { data: passes } = await passQuery
    const room = selectedRoom || currentTeacher?.room?.split(',')[0]?.trim() || '27'
    const { data: spRows } = await supabase.from('student_periods').select('student_id').eq('period', activePeriod).eq('room', room)
    const studentIds = spRows?.map(r => r.student_id) || []

    const { data: rawStuds } = studentIds.length > 0
      ? await supabase.from('students').select('id, full_name, last_name, photo_url, photo_file').in('id', studentIds).order('first_name')
      : { data: [] }

    // Deduplicate by id — prefer row with photo_url
    const seenStuds = new Map()
    for (const s of rawStuds || []) {
      if (!seenStuds.has(s.id) || (!seenStuds.get(s.id).photo_url && s.photo_url)) {
        seenStuds.set(s.id, s)
      }
    }
    const studs = Array.from(seenStuds.values())

    const { data: holds } = await supabase.from('pass_holds').select('*').order('created_at')
    const { data: dnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true)

    if (passes) {
      const newIds = passes.map(p => p.student_id)
      const returned = prevActiveIds.current.filter(id => !newIds.includes(id))
      if (returned.length > 0 && holds?.length > 0) playClearAlert()
      const LABEL_REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Lockers', 'Errand', 'On Assignment', 'Career Counselor', 'Other']
      passes.filter(p => !prevActiveIds.current.includes(p.student_id)).forEach(p => {
        const base = p.reason?.split(' — ')[0]
        if (printPasses && LABEL_REASONS.includes(base)) window.open(`/pass/${p.id}/label`, '_blank')
      })
      prevActiveIds.current = newIds
      setActivePasses(passes)
    }
    if (studs) { setAllStudents(studs); const map = {}; studs.forEach(s => map[s.id] = s); setStudents(map); loadSignedPhotoUrls(studs) }
    if (holds) {
      const newIds = holds.map(h => h.id)
      if (newIds.some(id => !prevHeldIds.current.includes(id)) && holds.length > 0) playAlert()
      prevHeldIds.current = newIds
      setHeldPasses(holds)
    }
    if (dnlo) setDnloList(dnlo.map(d => d.student_id))
    const { data: teacherDnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true).eq('scope', 'teacher').eq('created_by', currentTeacher?.id || '')
    if (teacherDnlo) setTeacherDnloList(teacherDnlo.map(d => d.student_id))
    await loadMissedPasses(activePeriod)
  }

  async function loadMissedPasses(currentPeriod) {
    const currentPeriodNum = parseInt(currentPeriod)
    if (currentPeriodNum <= 1) { setMissedPasses([]); return }
    const pastPeriods = Array.from({ length: currentPeriodNum - 1 }, (_, i) => i + 1)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    let missedQuery = supabase.from('passes').select('*').is('time_in', null).in('period', pastPeriods).gte('time_out', todayStart.toISOString()).lte('time_out', todayEnd.toISOString()).order('time_out')
    if (currentTeacher?.id) missedQuery = missedQuery.eq('teacher_id', currentTeacher.id)
    const { data: missed } = await missedQuery
    if (!missed) return
    const ids = [...new Set(missed.map(p => p.student_id))]
    const { data: studs } = await supabase.from('students').select('id, full_name, photo_url, photo_file').in('id', ids)
    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s)
    setMissedPasses(missed.map(p => ({ ...p, students: studMap[p.student_id] || null })))
    if (studs) loadSignedPhotoUrls(studs)
  }

  // ── Pass actions ───────────────────────────────────────────────────────────
  async function handleReturn(passId) {
    const pass = activePasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    loadData()
  }

  async function handleMissedReturn(passId) {
    setCheckingInMissed(passId)
    const pass = missedPasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    setMissedPasses(prev => prev.filter(p => p.id !== passId))
    setCheckingInMissed(null)
  }

  async function handleOverride(hold) {
    await supabase.from('pass_holds').delete().eq('id', hold.id)
    await supabase.from('passes').insert({ student_id: hold.student_id, reason: hold.reason, room: selectedRoom || teacherRoom, period: hold.period, teacher_id: currentTeacher?.id || null, time_out: new Date().toISOString() })
    loadData()
  }

  async function handleDismissHold(holdId) {
    await supabase.from('pass_holds').delete().eq('id', holdId)
    loadData()
  }

  async function handleTeacherCheckout() {
    if (!selected || !reason) return
    if (reason === 'On Assignment' && !assignedTeacher) return

    // Block if student already has an active pass
    if (activePasses.some(p => p.student_id === selected)) {
      alert(`${allStudents.find(s => s.id === selected)?.full_name || 'This student'} is already out. Return them first before issuing a new pass.`)
      return
    }

    if (dnloList.includes(selected)) {
      playDnloAlert()
      await supabase.from('do_not_let_out').insert({ student_id: selected, reason: 'Teacher override on teacher page', scope: 'override_log', created_by: currentTeacher?.email || session?.user?.email || 'teacher', active: false }).catch(() => {})
    }
    let finalReason = reason
    if (reason === 'On Assignment' && assignedTeacher) finalReason = purposeText.trim() ? `On Assignment — ${assignedTeacher} — ${purposeText.trim()}` : `On Assignment — ${assignedTeacher}`
    else if (reason === 'Errand' && errandTeacher) finalReason = purposeText.trim() ? `Errand — ${errandTeacher} — ${purposeText.trim()}` : `Errand — ${errandTeacher}`
    else if (reason === 'Errand' && purposeText.trim()) finalReason = `Errand — ${purposeText.trim()}`
    else if (reason === 'Other' && purposeText.trim()) finalReason = `Other — ${purposeText.trim()}`
    const { data: passData } = await supabase.from('passes').insert({ student_id: selected, reason: finalReason, room: selectedRoom || teacherRoom, period: activePeriod, teacher_id: currentTeacher?.id || null }).select().single()
    // Only print if printable passes is enabled
    const PRINT_REASONS = ['Restroom', 'Library', 'Office', 'Errand', 'On Assignment', 'Other']
    if (printPasses && PRINT_REASONS.includes(finalReason.split(' — ')[0]) && passData?.id) {
      const studentName = allStudents.find(s => s.id === selected)?.full_name || 'Student'
      const timeIssued = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      printHallPass({ passId: passData.id, studentName, reason: finalReason, timeIssued, room: selectedRoom || teacherRoom })
    }
    // Fire notification to receiving teacher if On Assignment or Errand with a teacher
    const destTeacher = assignedTeacher || errandTeacher
    if (destTeacher && passData?.id) {
      const studentName = allStudents.find(s => s.id === selected)?.full_name || 'Student'
      sendPassNotification(passData.id, selected, studentName, destTeacher, finalReason)
    }

    setSelected(''); setReason(''); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('')
    loadData()
  }

  // ── Late pass ──────────────────────────────────────────────────────────────
  async function handleIssueLatePass() {
    if (lateStudents.length === 0 || !lateTeacher) return
    setIssuingLatePass(true)
    const issuedBy = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
    const room = currentTeacher?.room || '27'
    const nowDate = new Date()
    const timeIssued = nowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    for (const student of lateStudents) {
      if (!student.isOther) {
        await supabase.from('passes').insert({ student_id: student.id, reason: `Late Pass → ${lateTeacher}`, room, period: activePeriod, teacher_id: currentTeacher?.id || null, time_out: nowDate.toISOString(), time_in: nowDate.toISOString(), duration_minutes: 0, pass_type: 'late_pass' })
      }
      printLatePass({ studentName: student.name, toTeacher: lateTeacher, timeIssued, lateReason, issuedBy, room })
      await notifyReceivingTeacher({ toTeacher: lateTeacher, studentName: student.name, issuedBy, timeIssued, passUrl: window.location.origin })
    }
    const names = lateStudents.map(s => s.name).join(', ')
    setLatePassSuccess({ studentName: names, toTeacher: lateTeacher })
    setIssuingLatePass(false)
    setLateStudents([]); setLateTeacher(''); setLateReason(''); setLateSearchInput('')
    loadData()
    setTimeout(() => { setLatePassSuccess(null); setShowLatePass(false) }, 4000)
  }

  function addLateStudent(student) {
    if (lateStudents.find(x => x.id === student.id)) return
    setLateStudents(prev => [...prev, { id: student.id, name: student.full_name, isOther: false }])
    setLateSearchInput(''); setLateSearchOpen(false)
  }

  function addLateStudentOther(name) {
    const trimmed = name.trim()
    if (!trimmed || lateStudents.find(x => x.name === trimmed)) return
    setLateStudents(prev => [...prev, { id: null, name: trimmed, isOther: true }])
    setLateSearchInput(''); setLateSearchOpen(false)
  }

  function removeLateStudent(key) { setLateStudents(prev => prev.filter(x => (x.id || x.name) !== key)) }

  function resetLatePass() {
    setShowLatePass(false); setLateStudents([]); setLateSearchInput('')
    setLateSearchOpen(false); setLateTeacher(''); setLateReason('')
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const overLimit = activePasses.filter(p => Math.floor((now - new Date(p.time_out)) / 60000) >= TIME_LIMIT)
  const elapsed = (timeOut) => Math.floor((now - new Date(timeOut)) / 60000)
  const elapsedColor = (mins) => mins >= TIME_LIMIT ? 'text-red-500' : mins >= TIME_LIMIT * 0.7 ? 'text-amber-500' : 'text-green-600'
  const teacherDisplayName = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
  const teacherRooms = (currentTeacher?.room || '27').split(',').map(r => r.trim()).filter(Boolean)
  const teacherRoom = selectedRoom || teacherRooms[0] || '27'
  const periods = currentTeacher?.periods?.length
    ? currentTeacher.periods.sort().map(p => ({ value: p, label: currentTeacher.period_labels?.[p] || `Period ${p}` }))
    : [{ value: '1', label: 'Periods 1 & 2' }, { value: '4', label: 'Periods 4 & 5' }, { value: '6', label: 'Periods 6 & 7' }]
  const periodLabel = periods.find(p => p.value === activePeriod)?.label || `Period ${activePeriod}`
  const lateSearchFiltered = lateSearchInput.trim().length > 0
    ? allStudents.filter(s => s.full_name.toLowerCase().includes(lateSearchInput.trim().toLowerCase()) && !lateStudents.find(x => x.id === s.id)).slice(0, 6)
    : []
  const kioskQRUrl = currentTeacher?.id
    ? `https://hall-pass-lime.vercel.app/unlock?teacher_id=${currentTeacher.id}&room=${teacherRoom}`
    : `https://hall-pass-lime.vercel.app/unlock?code=${unlockCode}&room=${teacherRoom}`

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  // ── Login screen — password only ───────────────────────────────────────────
  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
      <p className="text-gray-400 text-sm mb-8">Sign in with your email and passcode / password</p>
      <form onSubmit={handlePasswordSignIn} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="email"
          placeholder="you@rjusd.org"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
          style={{ borderColor: RHS_GREEN }}
        />
        <input
          type="password"
          placeholder="Passcode"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
          style={{ borderColor: RHS_GREEN }}
        />
        {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
        <button
          type="submit"
          disabled={signingIn || !email || !password}
          className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
          style={{ backgroundColor: RHS_GREEN }}>
          {signingIn ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      <a href="/" className="mt-8 text-sm text-gray-400 hover:text-gray-600">← Home</a>
    </div>
  )

  // ── First-login: forced password change ────────────────────────────────────
  if (mustChangePassword) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Welcome, {teacherDisplayName}</h1>
      <p className="text-gray-500 text-sm text-center mb-2 max-w-xs">
        For your security, please set a new password before continuing.<br />
        Your default passcode was your room number doubled.
      </p>
      <div className="w-full max-w-xs mt-4">
        <form onSubmit={handleFirstLoginPasswordChange} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={firstPwNew}
            onChange={e => setFirstPwNew(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
            style={{ borderColor: RHS_GREEN }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={firstPwConfirm}
            onChange={e => setFirstPwConfirm(e.target.value)}
            required
            className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
            style={{ borderColor: RHS_GREEN }}
          />
          {firstPwError && <p className="text-red-500 text-xs text-center">{firstPwError}</p>}
          <button
            type="submit"
            disabled={firstPwSaving || !firstPwNew || !firstPwConfirm}
            className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
            style={{ backgroundColor: RHS_GREEN }}>
            {firstPwSaving ? 'Saving...' : 'Set Password & Continue'}
          </button>
        </form>
        <button onClick={handleSignOut} className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 text-center">
          Sign Out
        </button>
      </div>
    </div>
  )

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
      <p className="text-gray-400 text-sm mb-1">Welcome, {teacherDisplayName}</p>
      <p className="text-gray-400 text-sm mb-8">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {periods.map(p => (
          <button key={p.value} onClick={() => { if (currentTeacher?.id) sessionStorage.setItem(`passable_period_${currentTeacher.id}`, p.value); setActivePeriod(p.value); generateCheckoutCode() }}
            className="py-4 text-lg font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50"
            style={{ borderColor: RHS_GREEN, color: RHS_GREEN }}>
            {p.label}
          </button>
        ))}
      </div>
      <button onClick={handleSignOut} className="mt-8 text-sm text-gray-400 hover:text-gray-600">Sign Out</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Pull Pass Modal ── */}
      {showPullPass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-lg font-semibold text-gray-800">Request Student</h2><p className="text-xs text-gray-400">Print a pass to pull a student from another class</p></div>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Student Name</label><input type="text" placeholder="First and last name" value={pullStudentName} onChange={e => setPullStudentName(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Currently In</label><select value={pullFromTeacher} onChange={e => setPullFromTeacher(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Purpose</label><input type="text" placeholder="e.g. meeting, project..." value={pullPurpose} onChange={e => setPullPurpose(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { const timeIssued = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); printPullPass({ studentName: pullStudentName, fromTeacher: pullFromTeacher, purpose: pullPurpose, timeIssued, issuedBy: teacherDisplayName, room: teacherRoom }); setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} disabled={!pullStudentName || !pullFromTeacher} className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30" style={{ backgroundColor: RHS_GREEN }}>🖨️ Print Pass</button>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Help Modal ── */}
      {showHelp && (() => {
        const lnk = (href, label) => <a href={href} onClick={() => setShowHelp(false)} style={{ color: RHS_GREEN, textDecoration: 'underline' }}>{label}</a>
        const settingsBtn = <button onClick={() => { setShowHelp(false); setShowSettings(true); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100) }} style={{ color: RHS_GREEN, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}>⚙️ Show Settings</button>
        const ALL_SECTIONS = [
          { title: 'Getting Started', items: [
            { q: "What's my passcode?", keys: "passcode room number login sign in default",
              a: <>Your default passcode is your room number doubled — Room 27 → <span className="font-mono">2727</span>, Room 30 → <span className="font-mono">3030</span>. You were prompted to change it on first login. If you're locked out, contact your admin.</> },
            { q: "How do I switch periods?", keys: "period switch dropdown header class",
              a: <>Use the period dropdown in the top-right of the header to switch between your class periods at any time — no need to sign out or go back.</> },
            { q: "I teach in more than one room.", keys: "traveling teacher multiple rooms two rooms switch room gym pe",
              a: <>If you cover multiple rooms, your admin can set your account to include all of them — no second login needed. Once set up, a room picker appears in the header so you can switch between your rooms in the same session. Ask your admin to update your Room field with your rooms listed (e.g. gym-a, gym-b).</> },
            { q: "I don't see any students.", keys: "no students roster empty import period",
              a: <>Your roster hasn't been imported yet for this period. {lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Import your roster here →')} — upload your Aeries class roster Excel file. It takes about 30 seconds.</> },
          ]},
          { title: 'Hall Passes', items: [
            { q: "How do I check out a student?", keys: "checkout send pass reason dropdown",
              a: <>Select the student's name and a reason from the dropdowns, then click <strong>Send</strong>. If Printable Passes is on (in {settingsBtn}), a pass will print to your default printer automatically.</> },
            { q: "How do I check a student back in?", keys: "return check in student back",
              a: <>Click <strong>Return</strong> next to their name in the Students Out list. Or they can check back in at the classroom kiosk when they return.</> },
            { q: "What does the red timer mean?", keys: "red timer 10 minutes alert over limit warning audio sound notification mute beep browser",
              a: <>A student has been out for 10+ minutes. Their row turns red with a pulsing "Over 10m" badge, and a red alert bar appears at the top of the Students Out section listing their name. When a student first crosses the 10-minute mark, PassAble also plays a short audio beep and sends a browser notification — so you'll know even if you're in another tab. Each student only triggers the alert once per pass, not every 15 seconds. Use the <strong>🔔 Alerts on / 🔕 Muted</strong> toggle in the alert bar to silence audio and browser notifications for the session. The setting is saved, so it persists across reloads.</> },
            { q: "What's a Do Not Let Out (DNLO) flag?", keys: "do not let out dnlo flag restrict admin override",
              a: <>Admin or you can flag students who shouldn't leave class. If you try to check one out, a red warning appears and you'll need to confirm an override — which gets logged. Manage your list at {lnk('/teacher/dnlo', 'Do Not Let Out →')}.</> },
          ]},
          { title: 'Late Passes & Pull Passes', items: [
            { q: "What's a Late Pass?", keys: "late pass receipt printer arrive tardy destination teacher",
              a: <>For students arriving late to another teacher's class. Click <strong>Issue Late Pass</strong>, select the student(s) and the destination teacher. A receipt prints to your default printer — one per student. The student is not expected to return to your room. If you'd like to set up a dedicated receipt printer, talk to Mr. Joe.</> },
            { q: "What's a Pull Pass / Request Student?", keys: "pull pass request student release slip another room",
              a: <>Use this when you need to pull a student from another teacher's room. Fill in the student's name, who they're currently with, and your purpose. A formal release slip prints — send a student to deliver it to the other room.</> },
          ]},
          { title: 'Kiosk & Self-Checkout', items: [
            { q: "What's the Kiosk?", keys: "kiosk tablet door check out in tap name record dashboard",
              a: <>A tablet or dedicated computer at your classroom door where students check themselves out and back in. Students tap their name to check out — it's recorded instantly and shows up on your dashboard. When they return to class, they tap to check back in, which is also recorded. Your kiosk link is in {settingsBtn} → Kiosk URL.</> },
            { q: "What's Self-Checkout Mode?", keys: "self checkout phone laptop code session url room",
              a: <>Students go to the URL shown on your dashboard (e.g. <span className="font-mono text-xs">hall-pass-lime.vercel.app/self-checkout?room={teacherRoom}</span>) and enter the 4-digit session code you generate. The code is specific to your room — other teachers' codes won't work here. Works on school Chromebooks and laptops. Once checked out, the student's screen turns red and stays up until they check back in at your classroom kiosk. If the kiosk isn't available, they can ask you or a sub to check them back in.</> },
          ]},
          { title: 'Settings', items: [
            { q: "How do I access Settings?", keys: "settings open show hide access find scroll",
              a: <>Scroll to the bottom of your dashboard and click {settingsBtn}. All your options will expand below. Click <strong>🔒 Hide Settings</strong> to collapse them when you're done.</> },
            { q: "What's the Sub Code?", keys: "sub code substitute teacher login classroom 4 digit",
              a: <>A 4-digit code tied to your classroom that a substitute teacher can use to log in without your password. Set it in {settingsBtn} so your sub can track passes while you're out.</> },
            { q: "How do I set a schedule override?", keys: "schedule override minimum day block early release foggy wrong schedule",
              a: <>If today's schedule isn't being detected correctly, scroll to {settingsBtn} and find <strong>Today's Schedule Override</strong>. Pick the correct schedule from the dropdown and hit <strong>Set</strong>. An amber banner will appear at the top of the page confirming it's active. The override is scoped to your room only and clears automatically at midnight. Your admin can also set a school-wide override from the admin panel if needed.</> },
            { q: "What's Block First & Last 15 Min?", keys: "block 15 minutes first last period red status bar warn",
              a: <>When on, the status bar turns red at the start and end of each period as a reminder not to let students out. It doesn't block checkout — just warns you and the students.</> },
            { q: "What's Printable Passes?", keys: "printable passes print default off automatic",
              a: <>Off by default. When turned on in {settingsBtn}, a printable pass opens automatically and sends to your default printer every time a student is checked out.</> },
            { q: "What are Student Transfer Notifications?", keys: "notification transfer student heading on assignment errand receiving sent alert panel",
              a: <>When you check out a student to another teacher's room (On Assignment or Errand → teacher), a live notification appears on that teacher's dashboard instantly. They can mark <strong>Student Received</strong>, <strong>Not Here Yet</strong>, or <strong>Student Returned</strong>. When they mark the student as returned, you get a notification back with the time they left. All updates appear in the <strong>Student Transfer Notifications</strong> panel between your stats and the Students Out list. Everything is logged automatically — no action required. To opt out, go to {settingsBtn} → Student Transfer Notifications → toggle off.</> },
            { q: "What's Auto Sign-Out?", keys: "auto sign out session timeout inactivity security minutes idle",
              a: <>When turned on in {settingsBtn}, the dashboard signs you out automatically after a set period of no activity — 30 or 60 minutes. Default is <strong>30 min</strong>. Any mouse movement, typing, or clicking resets the timer. Set it to <strong>None</strong> if you'd rather stay signed in indefinitely (not recommended on shared devices).</> },
            { q: "What are Pass Tokens?", keys: "pass tokens grading period reward bonus points unused token count threshold",
              a: <>Pass Tokens give each student a set number of passes per grading period. When a student uses a pass, it counts against their balance. At the end of the period, students with unused tokens can earn bonus points or a prize — up to you. To turn it on, go to {settingsBtn} → Pass Tokens. Set how many tokens each student gets and when the current grading period started. Click <strong>Reset — start new period today</strong> at the start of each new period to clear all counts. When a student is down to 1 token you'll see an amber warning at checkout; at 0 tokens it turns red. Checkout is never blocked — just flagged. To see the full class summary, expand the <strong>🎟 Pass Tokens</strong> panel on your dashboard and click <strong>Print</strong> for a printable sheet showing each student's used and remaining count — one page per period, ready for awarding points. If a pass shouldn't have counted against a student (excused absence, emergency, etc.), click <strong>↩ Return</strong> next to their name in the token panel to restore one token to their balance. Returns are tracked separately from the pass history and show up on the print sheet.</> },
            { q: "What's Pass Frequency Limit?", keys: "pass frequency limit threshold weekly passes flag warn",
              a: <>A separate optional setting that warns you at checkout when a student has reached a set number of passes in the last 7 days. Unlike tokens, this resets on a rolling 7-day window rather than a grading period. Turn it on in {settingsBtn} → Pass Frequency Limit and set your threshold. Off by default.</> },
            { q: "How do I change my password?", keys: "password change update reset minimum characters",
              a: <>Open {settingsBtn} → Change Password. Minimum 8 characters.</> },
          ]},
          { title: 'Pages & Tools', items: [
            { q: "Manage & Import Students", keys: "manage students edit name fix lookup periods enrolled import roster",
              a: <>{lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Manage & Import Students →')} is where you view and edit your roster, import from Aeries, and manage who's enrolled in each period.</> },
            { q: "Print QR Badges", keys: "qr badges print scan camera kiosk id",
              a: <>{lnk('/qr', 'Print QR Badges →')} generates a printable sheet of QR code ID badges for your students. Students can use these to scan in and out at the kiosk using a camera instead of tapping their name on screen.</> },
            { q: "Pass Log", keys: "pass log history record who when how long reason save print",
              a: <>{lnk('/log', 'Pass Log →')} shows a full history of every hall pass issued from your classroom — who went out, when, how long they were gone, and the reason. Useful for tracking patterns or following up with a student. You can also save or print your log directly from that page.</> },
            { q: "Do Not Let Out List", keys: "do not let out dnlo list personal admin school wide",
              a: <>{lnk('/teacher/dnlo', 'Do Not Let Out →')} is where you manage your personal list of students who shouldn't leave your classroom. Admin can also add students here school-wide.</> },
            { q: "Open Kiosk", keys: "open kiosk fullscreen door return back teacher dashboard unlock",
              a: <>Opens your classroom kiosk on this device in full screen. Students use it to check themselves out and back in. To return to your teacher dashboard from the kiosk, use your teacher unlock QR (found in {settingsBtn} → Teacher Unlock QR) or navigate directly to {lnk('/teacher', 'hall-pass-lime.vercel.app/teacher')}.</> },
            { q: "Mobile View", keys: "mobile phone gym pe portable outside classroom phone",
              a: <>{lnk('/teacher/mobile', 'Mobile View →')} is a stripped-down version of this dashboard optimized for your phone. Ideal for PE teachers, portables, or anywhere you need to check students out and back in without being at a computer. Same login — bookmark it on your phone's home screen for quick access.</> },
            { q: "Import Roster", keys: "import roster aeries excel upload students period",
              a: <>{lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Import Roster →')} is where you upload your Aeries class roster Excel file to populate your student list for each period.</> },
            { q: "Match the Photos", keys: "match photos lifetouch pictures student photo missing upload",
              a: <>Pulls the Lifetouch photos your admin uploaded and matches them to the students on your roster. Run this after your admin imports a new photo batch. If a student's photo still doesn't appear, the name in the photo file may not match their name in PassAble — contact your admin. You can also add a photo manually for any individual student by going to {lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Manage & Import Students →')} and clicking Edit next to their name.</> },
            { q: "Analytics", keys: "analytics trends pass count reason busiest time pattern",
              a: <>{lnk(`/analytics?teacher_id=${currentTeacher?.id || ''}`, 'Analytics →')} (in the header) shows pass trends for your classroom — busiest times, most frequent reasons, and students with high pass counts.</> },
          ]},
          { title: 'Locked Out?', items: [
            { q: "I can't sign in.", keys: "locked out cant sign in password forgot reset admin",
              a: <>Contact your admin — they can reset your passcode from the admin panel in about 30 seconds. Your data is safe.</> },
          ]},
        ]
        const q = helpSearch.trim().toLowerCase()
        const filtered = q
          ? ALL_SECTIONS.map(s => ({ ...s, items: s.items.filter(i => (s.title + i.q + i.keys).toLowerCase().includes(q)) })).filter(s => s.items.length > 0)
          : ALL_SECTIONS
        return (
          <div
            ref={helpPanelRef}
            className="bg-white rounded-2xl shadow-2xl flex flex-col"
            style={{ position: 'fixed', left: helpPos.x, top: helpPos.y, width: 400, maxHeight: '85vh', zIndex: 9999, border: '1px solid #e5e7eb' }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl select-none"
              style={{ cursor: 'grab', backgroundColor: '#f9fafb' }}
              onMouseDown={startHelpDrag}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 text-sm">⠿</span>
                <h2 className="text-sm font-semibold text-gray-800">PassAble Relay Station Help</h2>
              </div>
              <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
              <div className="px-6 pt-3 pb-2">
                <input
                  type="search"
                  placeholder="Search help topics…"
                  value={helpSearch}
                  onChange={e => setHelpSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none"
                  style={{ '--tw-ring-color': RHS_GREEN }}
                  autoComplete="off"
                />
              </div>
              <div className="overflow-y-auto px-6 py-3 flex flex-col gap-5">
                {filtered.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No results for "{helpSearch}"</p>
                )}
                {filtered.map(section => (
                  <div key={section.title}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: RHS_GREEN }}>{section.title}</p>
                    <div>
                      {section.items.map(item => (
                        <details key={item.q} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <summary style={{ padding: '9px 4px', fontSize: 13, fontWeight: 600, color: '#1f2937', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {item.q}<span style={{ color: '#9ca3af', fontSize: 16, marginLeft: 8, flexShrink: 0 }}>›</span>
                          </summary>
                          <div style={{ padding: '0 4px 10px', fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>{item.a}</div>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-100">
                <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="w-full py-2.5 text-sm font-medium rounded-xl text-white" style={{ backgroundColor: RHS_GREEN }}>Got it</button>
              </div>
          </div>
        )
      })()}

      {/* ── Late Pass Modal ── */}
      {showLatePass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-lg font-semibold text-gray-800">Issue Late Pass</h2><p className="text-xs text-gray-400">Student will not return to Room {teacherRoom}</p></div>
              <button onClick={resetLatePass} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {latePassSuccess ? (
              <div className="text-center py-4"><div className="text-4xl mb-2">🖨️</div><p className="font-semibold text-gray-800">{latePassSuccess.studentName}</p><p className="text-sm text-gray-500">Late pass to {latePassSuccess.toTeacher} — printing...</p></div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <div ref={lateSearchRef}>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Students</label>
                    {lateStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {lateStudents.map((s) => (
                          <span key={s.id || s.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: s.isOther ? '#f3f4f6' : '#dcfce7', color: s.isOther ? '#374151' : RHS_GREEN, border: `1px solid ${s.isOther ? '#d1d5db' : '#86efac'}` }}>
                            {s.isOther && <span className="opacity-40 mr-0.5">✎</span>}{s.name}
                            <button onClick={() => removeLateStudent(s.id || s.name)} className="ml-0.5 hover:opacity-60 leading-none font-bold">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <input type="text" placeholder={lateStudents.length === 0 ? 'Search student or type name…' : 'Add another…'} value={lateSearchInput}
                        onChange={e => { setLateSearchInput(e.target.value); setLateSearchOpen(true) }}
                        onFocus={() => setLateSearchOpen(true)}
                        onKeyDown={e => { if (e.key === 'Enter' && lateSearchInput.trim()) { const match = lateSearchFiltered[0]; if (match) addLateStudent(match); else addLateStudentOther(lateSearchInput) } if (e.key === 'Escape') setLateSearchOpen(false) }}
                        className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none" style={{ borderColor: RHS_GREEN }} />
                      {lateSearchOpen && lateSearchInput.trim().length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          {lateSearchFiltered.map(s => <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => addLateStudent(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 text-gray-800 transition-colors">{s.full_name}</button>)}
                          {lateSearchInput.trim().length > 1 && <button onMouseDown={e => e.preventDefault()} onClick={() => addLateStudentOther(lateSearchInput)} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-t border-gray-100 italic transition-colors">✎ Add &ldquo;{lateSearchInput.trim()}&rdquo; as other</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div><label className="text-xs text-gray-500 font-medium mb-1 block">Reporting To</label><select value={lateTeacher} onChange={e => setLateTeacher(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500 font-medium mb-1 block">Reason for Lateness</label><input type="text" placeholder="e.g. finishing assignment..." value={lateReason} onChange={e => setLateReason(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-700">{lateStudents.length > 1 ? `${lateStudents.length} passes will print — one per student.` : 'A receipt will print and the receiving teacher will be notified.'}</div>
                <div className="flex gap-3">
                  <button onClick={handleIssueLatePass} disabled={lateStudents.length === 0 || !lateTeacher || issuingLatePass} className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30" style={{ backgroundColor: RHS_GREEN }}>{issuingLatePass ? 'Issuing...' : lateStudents.length > 1 ? `🖨️ Print ${lateStudents.length} Passes` : '🖨️ Print & Issue'}</button>
                  <button onClick={resetLatePass} className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">RHS PassAble · The Relay Station</h1>
            <p className="text-green-200 text-xs">Room {teacherRoom} · {periodLabel} · {teacherDisplayName} · {SCHEDULE_LABELS[scheduleType] || 'Regular'}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          {teacherRooms.length > 1 && (
            <div className="flex items-center gap-1">
              {teacherRooms.map(r => (
                <button
                  key={r}
                  onClick={() => {
                    setSelectedRoom(r)
                    if (currentTeacher?.id) sessionStorage.setItem(`passable_room_${currentTeacher.id}`, r)
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors"
                  style={{ background: teacherRoom === r ? 'white' : 'rgba(255,255,255,0.2)', color: teacherRoom === r ? RHS_GREEN : 'rgba(255,255,255,0.85)', border: 'none', cursor: 'pointer' }}
                >
                  Rm {r}
                </button>
              ))}
            </div>
          )}
          <a href={`/analytics?teacher_id=${currentTeacher?.id || ''}`} className="text-sm text-green-200 hover:text-white">Analytics</a>
          {currentTeacher?.is_admin && <a href="/admin" className="text-sm text-green-200 hover:text-white">Admin</a>}
          <button onClick={() => setShowHelp(true)} className="text-sm text-green-200 hover:text-white">? Help</button>
          <select
            value={activePeriod || ''}
            onChange={e => {
              if (e.target.value) { if (currentTeacher?.id) sessionStorage.setItem(`passable_period_${currentTeacher.id}`, e.target.value); setActivePeriod(e.target.value); generateCheckoutCode() }
              else { if (currentTeacher?.id) sessionStorage.removeItem(`passable_period_${currentTeacher.id}`); setActivePeriod(null) }
            }}
            className="text-sm rounded-lg px-2 py-1 cursor-pointer"
            style={{ backgroundColor: '#004d28', color: '#bbf7d0', border: '1px solid #16a34a' }}
          >
            {periods.map(p => (
              <option key={p.value} value={p.value} style={{ backgroundColor: 'white', color: '#1f2937' }}>{p.label}</option>
            ))}
            <option value="" style={{ backgroundColor: 'white', color: '#6b7280' }}>← Switch Period</option>
          </select>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

      {/* ── Schedule Override Badge ── */}
      {scheduleIsOverride && (
        <div style={{ width: '100%', padding: '5px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef3c7', borderBottom: '1px solid #fcd34d' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>⚠️ Schedule override active: {SCHEDULE_LABELS[scheduleType]}</span>
          <button onClick={clearScheduleOverride} style={{ fontSize: 11, color: '#92400e', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
        </div>
      )}

      {/* ── Period Status Bar ── */}
      <PeriodStatusBar periodInfo={periodInfo} checkoutStatus={checkoutStatus} blockMinsEnabled={blockMinsEnabled} />

      <div className="p-6 max-w-3xl mx-auto">

        {/* ── Empty roster nudge ── */}
        {allStudents.length === 0 && (
          <div className="mb-6 p-4 rounded-xl flex items-center justify-between gap-4" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
            <div>
              <p className="text-sm font-semibold text-amber-800">No students in this period yet</p>
              <p className="text-xs text-amber-600 mt-0.5">Import your class roster to start tracking hall passes.</p>
            </div>
            <a href={`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`}
              className="text-xs px-3 py-2 rounded-lg text-white font-semibold flex-shrink-0 whitespace-nowrap"
              style={{ backgroundColor: '#d97706' }}>
              Import Roster →
            </a>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Currently Out', value: activePasses.length, color: activePasses.length > 0 ? 'text-red-500' : 'text-green-600' },
            { label: `Over ${TIME_LIMIT} min`, value: overLimit.length, color: overLimit.length > 0 ? 'text-red-500' : 'text-green-600' },
            { label: 'On Hold', value: heldPasses.length, color: heldPasses.length > 0 ? 'text-amber-500' : 'text-green-600' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">{m.label}</div>
              <div className={`text-2xl font-semibold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* ── Pass Notifications Panel ── */}
        {(incomingNotifs.length > 0 || outgoingNotifs.length > 0) && (
          <div className="bg-white rounded-xl border border-blue-200 mb-6 overflow-hidden">
            <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800">
                🔔 Student Transfer Notifications
                {(incomingNotifs.length + outgoingNotifs.length) > 0 && (
                  <span className="ml-2 text-xs font-bold bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full">
                    {incomingNotifs.length + outgoingNotifs.length}
                  </span>
                )}
              </span>
              {(incomingNotifs.length + outgoingNotifs.length) > 0 ? (
                <button onClick={clearAllNotifs} className="text-xs font-medium text-blue-500 hover:text-blue-700 underline">
                  Clear all
                </button>
              ) : (
                <span className="text-xs text-blue-400">Updates in real time</span>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">

              {/* Incoming — student heading to me */}
              {incomingNotifs.map(n => {
                const sentTime = new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const statusColor = n.status === 'received' ? 'text-green-600' : n.status === 'not_here' ? 'text-amber-600' : n.status === 'returned' ? 'text-gray-400' : 'text-blue-600'
                const statusLabel = n.status === 'received' ? '✓ Received' : n.status === 'not_here' ? '⚠ Not Here Yet' : n.status === 'returned' ? '↩ Returned' : '⏳ En Route'
                return (
                  <div key={n.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{n.student_name}</span>
                        <span className="text-xs text-gray-400 ml-2">from {n.from_teacher_name} · Rm {n.from_room} · released {sentTime}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{n.reason}</p>
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
                    </div>
                    {n.status !== 'returned' && (
                      <div className="flex gap-1.5 flex-wrap">
                        {n.status === 'pending' && (
                          <button onClick={() => updateNotifStatus(n.id, 'received')}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
                            ✓ Student Received
                          </button>
                        )}
                        {(n.status === 'pending' || n.status === 'received') && (
                          <button onClick={() => updateNotifStatus(n.id, 'not_here')}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            ⚠ Not Here Yet
                          </button>
                        )}
                        {n.status === 'received' && (
                          <button onClick={() => updateNotifStatus(n.id, 'returned')}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            ↩ Student Returned
                          </button>
                        )}
                        <button onClick={() => clearNotif(n.id, 'receiver')}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white text-gray-400 border border-gray-200 ml-auto">
                          Clear
                        </button>
                      </div>
                    )}
                    {n.status === 'returned' && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Returned at {new Date(n.returned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <button onClick={() => clearNotif(n.id, 'receiver')} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Outgoing — return status of students I sent */}
              {outgoingNotifs.map(n => {
                const returnTime = n.returned_at ? new Date(n.returned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
                const receivedTime = n.received_at ? new Date(n.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
                return (
                  <div key={n.id} className="px-4 py-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{n.student_name}</span>
                        <span className="text-xs text-gray-400 ml-2">→ {n.to_teacher_name}</span>
                        {n.status === 'received' && receivedTime && <p className="text-xs text-green-600 mt-0.5">✓ Received by {n.to_teacher_name} at {receivedTime}</p>}
                        {n.status === 'not_here' && <p className="text-xs text-amber-600 mt-0.5">⚠ {n.to_teacher_name} reports student hasn't arrived</p>}
                        {n.status === 'returned' && returnTime && <p className="text-xs text-blue-600 mt-0.5">↩ Returning to you — left {n.to_teacher_name} at {returnTime}</p>}
                      </div>
                      <button onClick={() => clearNotif(n.id, 'sender')} className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0">Clear</button>
                    </div>
                  </div>
                )
              })}

            </div>
          </div>
        )}

        {heldPasses.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-amber-100 border-b border-amber-200"><span className="text-amber-700 text-sm font-medium">⚠ Students on Hold — conflict rule active</span></div>
            {heldPasses.map(hold => (
              <div key={hold.id} className="px-4 py-3 border-b border-amber-100 last:border-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{students[hold.student_id]?.full_name || hold.student_id} → {hold.reason}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Held at {new Date(hold.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · conflicting student still out</p>
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button onClick={() => handleOverride(hold)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: RHS_GREEN }}>Override & Send</button>
                  <button onClick={() => handleDismissHold(hold.id)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Token Summary ── */}
        {tokensEnabled && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
              <button onClick={() => { setShowTokenSummary(v => !v); if (!showTokenSummary) loadTokenSummary() }}
                className="text-sm font-medium flex items-center gap-1.5" style={{ color: RHS_GREEN }}>
                🎟 Pass Tokens — Period {activePeriod}
                <span className="text-xs text-gray-400 font-normal">{tokensPerPeriod} per student · since {fmtDate(gradingPeriodStart + 'T00:00:00')}</span>
                <span className="text-xs text-gray-400">{showTokenSummary ? '▲' : '▼'}</span>
              </button>
              {showTokenSummary && (
                <button onClick={printTokenSummary} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  🖨️ Print
                </button>
              )}
            </div>
            {showTokenSummary && (
              tokenSummaryLoading
                ? <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
                : tokenSummary.length === 0
                  ? <div className="p-6 text-center text-sm text-gray-400">No students found for this period</div>
                  : <div className="divide-y divide-gray-50">
                      {tokenSummary.map(r => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 text-sm text-gray-800">{r.name}</div>
                          <div className="text-xs text-gray-400">
                            {r.used} used
                            {r.adj > 0 && <span className="ml-1 text-green-600 font-medium">+{r.adj} returned</span>}
                          </div>
                          <div className={`text-sm font-bold w-20 text-right ${r.remaining === 0 ? 'text-red-500' : r.remaining === 1 ? 'text-amber-500' : 'text-green-600'}`}>
                            {r.remaining} left
                          </div>
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.round((r.remaining / tokensPerPeriod) * 100)}%`, backgroundColor: r.remaining === 0 ? '#ef4444' : r.remaining === 1 ? '#f59e0b' : '#006938' }} />
                          </div>
                          <button
                            onClick={() => returnToken(r.id)}
                            title="Return a token to this student"
                            className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-colors"
                          >
                            ↩ Return
                          </button>
                        </div>
                      ))}
                    </div>
            )}
          </div>
        )}

        {activePasses.length >= 2 && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">⚠ {activePasses.length} students out simultaneously: {activePasses.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')}</div>}
        {overLimit.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between gap-3">
            <span>🔔 {overLimit.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')} {overLimit.length === 1 ? 'has' : 'have'} been out over {TIME_LIMIT} min</span>
            <button onClick={toggleWarnings} title={warningsEnabled ? 'Mute alerts' : 'Unmute alerts'}
              className="text-xs px-2 py-1 rounded-lg border border-red-300 bg-white text-red-600 hover:bg-red-100 whitespace-nowrap font-medium transition-colors flex-shrink-0">
              {warningsEnabled ? '🔔 Alerts on' : '🔕 Muted'}
            </button>
          </div>
        )}
        {!overLimit.length && (
          <div className="flex justify-end mb-2">
            <button onClick={toggleWarnings} title={warningsEnabled ? 'Mute alerts' : 'Unmute alerts'}
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 font-medium transition-colors">
              {warningsEnabled ? '🔔 Alerts on' : '🔕 Alerts muted'}
            </button>
          </div>
        )}

        {/* ── Students Out ── */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students Out</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPullPass(true)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: '#7c3aed' }}>📋 Request Student</button>
              <button onClick={() => setShowLatePass(true)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: '#1d4ed8' }}>🖨️ Issue Late Pass</button>
              <button onClick={loadData} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
            </div>
          </div>

          {activePasses.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">All students are in the classroom</div>
          ) : activePasses.map(pass => {
            const mins = elapsed(pass.time_out)
            const student = students[pass.student_id]
            const isLatePass = pass.pass_type === 'late_pass'
            return (
              <div key={pass.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${isLatePass ? 'bg-blue-50' : mins >= TIME_LIMIT ? 'bg-red-50' : ''}`} style={mins >= TIME_LIMIT ? { outline: '2px solid #fca5a5', outlineOffset: '-2px', borderRadius: '0' } : {}}>
                {(photoUrls[student?.id] || student?.photo_url)
                  ? <img src={photoUrls[student?.id] || student?.photo_url} alt={student.full_name} className={`w-9 h-9 rounded-full object-cover flex-shrink-0 ${mins >= TIME_LIMIT ? 'ring-2 ring-red-400' : ''}`} />
                  : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white ${mins >= TIME_LIMIT ? 'ring-2 ring-red-400' : ''}`} style={{ backgroundColor: isLatePass ? '#1d4ed8' : mins >= TIME_LIMIT ? '#dc2626' : RHS_GREEN }}>
                      {student?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </div>
                }
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{student?.full_name}</span>
                    {isLatePass && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Late Pass</span>}
                    {mins >= TIME_LIMIT && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium animate-pulse">Over {TIME_LIMIT}m</span>}
                  </div>
                  <div className="text-xs text-gray-400">{pass.reason} · out at {fmt(pass.time_out)}</div>
                </div>
                <span className={`text-sm font-medium w-10 text-right ${elapsedColor(mins)}`}>{mins}m</span>
                {!isLatePass && <button onClick={() => handleReturn(pass.id)} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: RHS_GREEN }}>Return</button>}
              </div>
            )
          })}

          {/* ── Checkout form ── */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <div className="text-xs font-medium text-gray-500 mb-2">Check out a student</div>
            {tokensEnabled && selected && (() => {
              const entry = tokenSummary.find(r => r.id === selected)
              if (!entry) return null
              if (entry.remaining === 0) return (
                <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-1.5">
                  🎟 {entry.name.split(' ')[0]} has used all {tokensPerPeriod} tokens this period
                </div>
              )
              if (entry.remaining === 1) return (
                <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-1.5">
                  🎟 {entry.name.split(' ')[0]} has 1 token left this period
                </div>
              )
              return null
            })()}
            {passLimitEnabled && selected && (weeklyPassCounts[selected] || 0) >= passLimitThreshold && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-1.5">
                ⚠ {allStudents.find(s => s.id === selected)?.full_name?.split(' ')[0]} has had {weeklyPassCounts[selected]} passes in the last 7 days
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <select value={selected} onChange={e => setSelected(e.target.value)} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                <option value="">— Student —</option>
                {allStudents.map(s => {
                  const count = passLimitEnabled ? (weeklyPassCounts[s.id] || 0) : 0
                  const overLimit = passLimitEnabled && count >= passLimitThreshold
                  return <option key={s.id} value={s.id}>{overLimit ? `⚠ ${s.full_name} (${count} this week)` : s.full_name}</option>
                })}
              </select>
              <select value={reason} onChange={e => { setReason(e.target.value); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('') }} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                <option value="">— Reason —</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleTeacherCheckout} disabled={!selected || !reason || (reason === 'On Assignment' && !assignedTeacher)} className="px-4 py-2 text-sm rounded-lg disabled:opacity-30 font-medium text-white" style={{ backgroundColor: selected && dnloList.includes(selected) ? '#dc2626' : RHS_GREEN }}>
                {selected && dnloList.includes(selected) ? '⚠ Override' : 'Send'}
              </button>
            </div>

            {selected && dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-red-600 border border-red-700 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⛔</span>
                <div><div>Do Not Let Out — Admin Restriction</div><div className="text-xs font-normal text-red-200 mt-0.5">Clicking Send will log an override.</div></div>
              </div>
            )}
            {selected && teacherDnloList.includes(selected) && !dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-amber-500 border border-amber-600 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <div><div>Your Do Not Let Out List</div><div className="text-xs font-normal text-amber-100 mt-0.5">You added this student. This is a reminder only.</div></div>
              </div>
            )}

            {reason === 'On Assignment' && (
              <div className="flex flex-col gap-2">
                <select value={assignedTeacher} onChange={e => setAssignedTeacher(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select a teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                <input type="text" placeholder="Purpose (e.g. picking up worksheets)" value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
              </div>
            )}
            {reason === 'Errand' && (
              <div className="flex flex-col gap-2">
                <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select a teacher (optional) —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                <select value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select location (optional) —</option>{ERRAND_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}</select>
              </div>
            )}
            {reason === 'Other' && <input type="text" placeholder="Describe reason..." value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800 mt-2" style={{ borderColor: RHS_GREEN }} />}

            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex gap-2 mb-2">
                {[{ label: 'Manual', val: false }, { label: 'Self-Checkout Mode', val: true }].map(({ label, val }) => (
                  <button key={label} onClick={() => setSelfCheckoutMode(val)} className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                    style={{ background: selfCheckoutMode === val ? RHS_GREEN : 'white', color: selfCheckoutMode === val ? 'white' : '#6b7280', outline: selfCheckoutMode !== val ? '1px solid #d1d5db' : 'none', border: 'none', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
              {selfCheckoutMode && (
                <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                  <div className="text-4xl font-mono font-black tracking-widest text-gray-800 mb-1">{selfCheckoutCode || '—'}</div>
                  <div className="text-xs text-gray-500 mb-1">Teacher session code — tell students to go to:</div>
                  <div className="text-xs font-mono font-bold mb-3" style={{ color: RHS_GREEN }}>hall-pass-lime.vercel.app/self-checkout?room={teacherRoom}</div>
                  <button onClick={generateCheckoutCode} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 mb-3">🔄 Generate New Code</button>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-700">Kiosk return required:</span>
                    <button onClick={() => saveKioskReturn(!kioskReturnRequired)} className="px-3 py-1 rounded-full text-xs font-semibold transition-colors" style={{ background: kioskReturnRequired ? RHS_GREEN : '#e5e7eb', color: kioskReturnRequired ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>{kioskReturnRequired ? 'ON' : 'OFF'}</button>
                    {kioskReturnSaved && <span className="text-xs" style={{ color: RHS_GREEN }}>✓ Saved</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">{kioskReturnRequired ? 'Students must scan at kiosk to return' : "Students see an \"I'm Back\" button on their device"}</div>

                  {/* Wire page self-checkout toggle */}
                  <div className="border-t border-gray-100 mt-3 pt-3">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-gray-700">Wire page self-checkout:</span>
                      <button
                        onClick={toggleWireCheckout}
                        disabled={wireCheckoutSaving}
                        className="px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                        style={{ background: wireCheckoutEnabled ? RHS_GREEN : '#e5e7eb', color: wireCheckoutEnabled ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>
                        {wireCheckoutSaving ? '…' : wireCheckoutEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {wireCheckoutEnabled ? 'Students can self-checkout from their personal wire page' : 'Students cannot self-checkout from the wire page'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Missed passes ── */}
        {missedPasses.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50">
              <div><span className="text-sm font-medium text-orange-700">⚠ Didn't Return — Previous Periods</span><p className="text-xs text-orange-500 mt-0.5">These students checked out earlier today and never scanned back in.</p></div>
              <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">{missedPasses.length}</span>
            </div>
            {missedPasses.map(pass => {
              const name = pass.students?.full_name || 'Unknown'
              const initials = name.split(' ').map(n => n[0]).slice(0,2).join('')
              const mins = Math.floor((Date.now() - new Date(pass.time_out)) / 60000)
              const timeOut = new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={pass.id} className="flex items-center gap-3 px-4 py-3 border-b border-orange-50 last:border-0">
                  {(photoUrls[pass.students?.id] || pass.students?.photo_url)
                    ? <img src={photoUrls[pass.students?.id] || pass.students?.photo_url} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white bg-orange-400">{initials}</div>
                  }
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-800">{name}</span><span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">P{pass.period}</span></div>
                    <div className="text-xs text-gray-400">{pass.reason} · out at {timeOut} · {mins}m ago</div>
                  </div>
                  <button onClick={() => handleMissedReturn(pass.id)} disabled={checkingInMissed === pass.id} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: RHS_GREEN }}>{checkingInMissed === pass.id ? '...' : 'Check In'}</button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Settings ── */}
        {showSettings && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Teacher Unlock QR</p><p className="text-xs text-gray-400">Two separate QR codes for two different purposes</p></div>
              <div className="flex gap-4 mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                {unlockQR && <img src={unlockQR} alt="Teacher unlock QR" className="w-20 h-20 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-800 mb-0.5">📲 Teacher Sign-In QR</p>
                  <p className="text-xs text-blue-600 mb-1">Scan with a phone camera to sign into the teacher dashboard.</p>
                  <p className="text-xs text-gray-500 font-mono mb-2">Code: {unlockCode}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={rotateUnlockCode} disabled={rotating} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${rotated ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'}`}>{rotating ? 'Rotating...' : rotated ? '✓ Rotated' : '🔄 Rotate Code'}</button>
                    <a href="/unlock" target="_blank" className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 font-medium">Full Screen →</a>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
                <p className="text-xs font-semibold mb-0.5" style={{ color: RHS_GREEN }}>🖥️ Kiosk Unlock QR</p>
                <p className="text-xs text-green-700 mb-3">Save this link on your phone to show the QR that unlocks your classroom kiosk.</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => navigator.clipboard.writeText(kioskQRUrl)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: RHS_GREEN }}>📋 Copy Kiosk QR Link</button>
                  <a href={kioskQRUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-lg font-medium border border-green-200 text-green-700 hover:bg-green-100">📱 Open on this device →</a>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Kiosk URL</p><p className="text-xs text-gray-400">Share this URL to set up your classroom kiosk</p></div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 mb-3 break-all">{`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`}</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigator.clipboard.writeText(`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: RHS_GREEN }}>📋 Copy URL</button>
              </div>
              <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">💡 To write to an NFC sticker: open <strong>NFC Tools for Desktop</strong> → Write → URL → paste the URL above.</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Substitute Code</p><p className="text-xs text-gray-400">Current code: <span className="font-mono">{subCode}</span></p></div>
              <div className="flex gap-2">
                <input type="number" maxLength={4} placeholder="New 4-digit sub code" value={newSubCode} onChange={e => setNewSubCode(e.target.value.slice(0, 4))} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={saveSubCode} disabled={newSubCode.length !== 4} className={`px-4 py-2 text-sm font-medium rounded-lg ${subCodeSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`} style={!subCodeSaved ? { backgroundColor: RHS_GREEN } : {}}>{subCodeSaved ? '✓ Saved' : 'Save Code'}</button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Change Password</p>
                <p className="text-xs text-gray-400">Update your PassAble login passcode</p>
              </div>
              <div className="flex flex-col gap-2">
                <input type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                <button onClick={savePassword} disabled={!newPassword || !confirmPassword || savingPassword} className={`px-4 py-2 text-sm font-medium rounded-lg ${passwordSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`} style={!passwordSaved ? { backgroundColor: RHS_GREEN } : {}}>
                  {savingPassword ? 'Saving...' : passwordSaved ? '✓ Password Updated' : 'Save Password'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Block First &amp; Last 15 Min</p><p className="text-xs text-gray-400">Prevent students from leaving in the first and last 15 minutes of each period</p></div>
                <button onClick={async () => {
                  const newVal = !blockMinsEnabled
                  setBlockMinsEnabled(newVal)
                  if (currentTeacher?.id) {
                    await supabase.from('teachers').update({ block_first_last_15: newVal }).eq('id', currentTeacher.id)
                  } else {
                    await supabase.from('settings').upsert({ key: 'block_first_last_15', value: String(newVal) }, { onConflict: 'key' })
                  }
                }} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${blockMinsEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blockMinsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Printable Passes</p><p className="text-xs text-gray-400">Auto-open a printable pass when a student is checked out</p></div>
                <button onClick={async () => {
                  const newVal = !printPasses
                  setPrintPasses(newVal)
                  if (currentTeacher?.id) {
                    await supabase.from('teachers').update({ print_passes: newVal }).eq('id', currentTeacher.id)
                  } else {
                    await supabase.from('settings').upsert({ key: 'print_passes', value: String(newVal) }, { onConflict: 'key' })
                  }
                  setPrintPassesSaved(true)
                  setTimeout(() => setPrintPassesSaved(false), 2000)
                }} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${printPasses ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${printPasses ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {printPassesSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Student Transfer Notifications</p>
                  <p className="text-xs text-gray-400">Get notified on your dashboard when another teacher sends a student your way</p>
                </div>
                <button onClick={() => saveReceiveNotifications(!receiveNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${receiveNotifications ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${receiveNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {notifSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Auto Sign-Out</p>
                <p className="text-xs text-gray-400">Sign out automatically after inactivity. Resets on any mouse or keyboard activity.</p>
              </div>
              <div className="flex gap-2">
                {[{ label: 'None', val: null }, { label: '30 min', val: 30 }, { label: '60 min', val: 60 }].map(({ label, val }) => (
                  <button key={label} onClick={() => saveSessionTimeout(val)}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
                    style={{ background: sessionTimeout === val ? RHS_GREEN : 'white', color: sessionTimeout === val ? 'white' : '#6b7280', outline: sessionTimeout !== val ? '1px solid #d1d5db' : 'none', border: 'none', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
              {sessionTimeoutSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            {/* ── Token System ── */}
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Pass Tokens</p>
                  <p className="text-xs text-gray-400 mt-0.5">Give each student a set number of passes per grading period. Unused tokens = reward. Warnings appear at checkout when a student is down to 1 or 0 tokens. Off by default.</p>
                </div>
                <button onClick={() => saveTokenSettings({ enabled: !tokensEnabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${tokensEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tokensEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {tokensEnabled && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-28">Tokens per period</span>
                    <input type="number" min="1" max="99" value={tokensPerPeriod}
                      onChange={e => setTokensPerPeriod(parseInt(e.target.value) || 1)}
                      onBlur={e => saveTokenSettings({ perPeriod: parseInt(e.target.value) || 1 })}
                      className="w-14 p-1.5 text-sm border-2 rounded-lg text-center bg-white text-gray-800"
                      style={{ borderColor: RHS_GREEN }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-28">Period started</span>
                    <input type="date" value={gradingPeriodStart}
                      onChange={e => setGradingPeriodStart(e.target.value)}
                      onBlur={e => saveTokenSettings({ startDate: e.target.value })}
                      className="p-1.5 text-sm border-2 rounded-lg bg-white text-gray-800"
                      style={{ borderColor: RHS_GREEN }} />
                  </div>
                  <button onClick={() => {
                    const today = new Date().toISOString().slice(0, 10)
                    saveTokenSettings({ startDate: today })
                  }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                    🔄 Reset — start new period today
                  </button>
                </div>
              )}
              {tokenSettingsSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            {/* ── Pass Frequency Limit ── */}
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Pass Frequency Limit</p>
                  <p className="text-xs text-gray-400 mt-0.5">Shows a warning before checking out a student who's reached your pass threshold in the last 7 days. Doesn't block checkout — just flags it so you can decide. Off by default.</p>
                </div>
                <button onClick={togglePassLimit}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${passLimitEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${passLimitEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {passLimitEnabled && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-gray-600">Warn after</span>
                  <input
                    type="number" min="1" max="99"
                    value={passLimitThreshold}
                    onChange={e => setPassLimitThreshold(parseInt(e.target.value) || 1)}
                    onBlur={e => savePassLimitThreshold(e.target.value)}
                    className="w-14 p-1.5 text-sm border-2 rounded-lg text-center bg-white text-gray-800"
                    style={{ borderColor: RHS_GREEN }}
                  />
                  <span className="text-xs text-gray-600">passes in 7 days</span>
                </div>
              )}
              {passLimitSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Today's Schedule Override</p>
                <p className="text-xs text-gray-400">Force a specific schedule for today only. Auto-clears at midnight.</p>
              </div>
              {scheduleIsOverride && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}>
                  <span className="text-xs font-semibold" style={{ color: '#92400e' }}>⚠️ Active: {SCHEDULE_LABELS[scheduleType]}</span>
                  <button onClick={clearScheduleOverride} className="text-xs underline ml-2" style={{ color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
                </div>
              )}
              <div className="flex gap-2">
                <ScheduleSelectWithPreview
                  value={overridePickType}
                  onChange={setOverridePickType}
                  labels={SCHEDULE_LABELS}
                  schedules={SCHEDULES}
                />
                <button
                  onClick={saveScheduleOverride}
                  disabled={overrideSaving}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40"
                  style={{ backgroundColor: RHS_GREEN }}
                >
                  {overrideSaving ? 'Saving…' : 'Set'}
                </button>
              </div>
              {overridePickType === 'custom' && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Define periods:</p>
                  <div className="space-y-1.5">
                    {overrideCustomPeriods.map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="text" value={p.label}
                          onChange={e => setOverrideCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                          placeholder="Label" className="p-1.5 text-xs border rounded-lg" style={{ width: 88 }} />
                        <input type="time" value={p.start}
                          onChange={e => setOverrideCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, start: e.target.value } : r))}
                          className="p-1.5 text-xs border rounded-lg" style={{ width: 88 }} />
                        <span className="text-xs text-gray-400">–</span>
                        <input type="time" value={p.end}
                          onChange={e => setOverrideCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, end: e.target.value } : r))}
                          className="p-1.5 text-xs border rounded-lg" style={{ width: 88 }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={p.break || false}
                            onChange={e => setOverrideCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, break: e.target.checked } : r))} />
                          Break
                        </label>
                        <button onClick={() => setOverrideCustomPeriods(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-400 text-xs" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setOverrideCustomPeriods(prev => [...prev, { id: String(Date.now()), label: '', start: '', end: '', break: false }])}
                    className="mt-2 text-xs underline" style={{ color: RHS_GREEN, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add period</button>
                </div>
              )}
            </div>

          </>
        )}

        {/* ── Cowboy Wire — Class Objectives ──────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 mb-4">
          {/* Collapsible header */}
          <button
            onClick={() => setShowObjectives(o => !o)}
            className="w-full flex items-center justify-between p-4 text-left"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: RHS_GREEN }}>Cowboy Wire · Class Objectives</p>
              {!showObjectives && <p className="text-xs text-gray-400 mt-0.5">Tap to set what students see on the Cowboy Wire display in your room</p>}
              {showObjectives  && <p className="text-xs text-gray-400 mt-0.5">Students see this on the <strong>Cowboy Wire</strong> board in your room — automatically switches to the active period.</p>}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <a href={`/wire?room=${teacherRoom}`} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 rounded-lg border text-gray-500 hover:bg-gray-50 whitespace-nowrap" style={{ textDecoration: 'none' }}>
                Open Wire ↗
              </a>
              <span className="text-gray-300 text-sm">{showObjectives ? '▲' : '▼'}</span>
            </div>
          </button>

          {showObjectives && <div className="px-4 pb-4">

          {/* Period tabs — primary period (loads data) */}
          <div className="mb-1">
            <p className="text-xs text-gray-400 mb-1.5">Load period</p>
            <div className="flex gap-1 flex-wrap">
              {['1','2','3','4','5','6','7'].map(p => (
                <button key={p} onClick={() => setObjPeriod(p)}
                  className="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
                  style={{
                    background: objPeriod === p ? RHS_GREEN : '#f3f4f6',
                    color: objPeriod === p ? 'white' : '#374151',
                    border: 'none', cursor: 'pointer',
                  }}>
                  Period {p}
                </button>
              ))}
            </div>
          </div>

          {/* Also save to — multi-period copy */}
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-1.5">Also save to</p>
            <div className="flex gap-2 flex-wrap">
              {['1','2','3','4','5','6','7'].filter(p => p !== objPeriod).map(p => {
                const checked = objAlsoPeriods.includes(p)
                return (
                  <label key={p} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setObjAlsoPeriods(prev =>
                        checked ? prev.filter(x => x !== p) : [...prev, p]
                      )}
                      className="rounded"
                      style={{ accentColor: RHS_GREEN }}
                    />
                    <span className="text-xs text-gray-600">Period {p}</span>
                  </label>
                )
              })}
            </div>
            {objAlsoPeriods.length > 0 && (
              <p className="text-xs mt-1" style={{ color: RHS_GREEN }}>
                Will save to Periods {[objPeriod, ...objAlsoPeriods].sort().join(', ')}
              </p>
            )}
          </div>

          {objLoading ? (
            <p className="text-xs text-gray-400 py-2">Loading…</p>
          ) : (
            <div className="space-y-3">
              {/* Class Name + Topic */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5 block">Class Name</label>
                  <p className="text-xs text-gray-400 mb-1">Shows as the card header on the wire display — saves once per period.</p>
                  <input
                    type="text"
                    value={objClassName}
                    onChange={e => setObjClassName(e.target.value)}
                    placeholder="e.g. AP US History"
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                </div>
                <div style={{ width: 160 }}>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5 block">Topic (optional)</label>
                  <p className="text-xs text-gray-400 mb-1">Today's unit or focus.</p>
                  <input
                    type="text"
                    value={objTopic}
                    onChange={e => setObjTopic(e.target.value)}
                    placeholder="e.g. Civil War"
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                </div>
              </div>

              {/* Objectives */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Learning Objectives</label>
                  {objLines.length < 5 && (
                    <button onClick={() => setObjLines(l => [...l, ''])}
                      className="text-xs" style={{ color: RHS_GREEN, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      + Add
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-1.5">What students will be able to do — shown as a numbered list on the wire display.</p>
                <div className="space-y-1.5">
                  {objLines.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs font-semibold w-4 text-right flex-shrink-0" style={{ color: RHS_GREEN }}>{i + 1}.</span>
                      <input
                        type="text"
                        value={line}
                        onChange={e => setObjLines(l => l.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`Objective ${i + 1}`}
                        className="flex-1 px-3 py-2 text-sm border rounded-lg bg-white"
                        style={{ borderColor: '#e5e7eb' }}
                      />
                      {objLines.length > 1 && (
                        <button onClick={() => setObjLines(l => l.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Do Now */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5 block">Do Now (optional)</label>
                <p className="text-xs text-gray-400 mb-1">Warm-up prompt shown to students at the top of the Today's Class card.</p>
                <textarea
                  value={objDoNow}
                  onChange={e => setObjDoNow(e.target.value)}
                  placeholder="Warm-up activity or prompt for students…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white resize-none"
                  style={{ borderColor: '#e5e7eb' }}
                />
              </div>

              {/* You know you got it when… */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5 block">You know you got it when… (optional)</label>
                <p className="text-xs text-gray-400 mb-1">Success criteria — helps students self-assess. Shows at the bottom of the card in an amber box.</p>
                <textarea
                  value={objGotIt}
                  onChange={e => setObjGotIt(e.target.value)}
                  placeholder="Students can demonstrate mastery by…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white resize-none"
                  style={{ borderColor: '#e5e7eb' }}
                />
              </div>

              {/* Save + Clear buttons */}
              <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (window.confirm(`Clear objectives for Period ${objPeriod}? The wire display will show "no objectives posted" for this period.`))
                        clearObjectivesPeriod(objPeriod)
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    style={{ color: '#6b7280', borderColor: '#e5e7eb', background: 'white', cursor: 'pointer' }}
                  >
                    Clear Period {objPeriod}
                  </button>
                  <button
                    onClick={clearAllObjectives}
                    className="text-xs"
                    style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear all periods
                  </button>
                </div>
                <button
                  onClick={saveObjectives}
                  disabled={objSaving}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40"
                  style={{ backgroundColor: objSaved ? '#16a34a' : RHS_GREEN, border: 'none', cursor: objSaving ? 'default' : 'pointer' }}
                >
                  {objSaving
                    ? 'Saving…'
                    : objSaved
                      ? `✓ Saved to Period${objSavedPeriods.length > 1 ? 's' : ''} ${objSavedPeriods.sort().join(', ')}`
                      : objAlsoPeriods.length > 0
                        ? `Save to Periods ${[objPeriod, ...objAlsoPeriods].sort().join(', ')}`
                        : 'Save Objectives'}
                </button>
              </div>
            </div>
          )}
          </div>}
        </div>

        <div className="flex justify-end mb-4">
          <button onClick={() => setShowSettings(s => !s)} className="text-xs px-3 py-1.5 border rounded-lg text-gray-500 hover:bg-gray-50">{showSettings ? '🔒 Hide Settings' : '⚙️ Show Settings'}</button>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-2">
          <a href={`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`} className="text-sm text-gray-400 hover:text-gray-600">Manage & Import Students →</a>
          <a href="/teacher/match-photos" className="text-sm text-gray-400 hover:text-gray-600">Match the Photos →</a>
          <a href="/qr" className="text-sm text-gray-400 hover:text-gray-600">Print QR Badges →</a>
          <a href="/log" className="text-sm text-gray-400 hover:text-gray-600">Pass Log →</a>
          <a href="/teacher/dnlo" className="text-sm text-gray-400 hover:text-gray-600">Do Not Let Out →</a>
          <a href={`/kiosk?room=${teacherRoom}`} className="text-sm text-gray-400 hover:text-gray-600">Open Kiosk →</a>
          <a href="/teacher/mobile" className="text-sm text-gray-400 hover:text-gray-600">📱 Mobile View →</a>
        </div>
      </div>
    </div>
  )
}

export default function Teacher() {
  return (
    <Suspense>
      <TeacherInner />
    </Suspense>
  )
}
