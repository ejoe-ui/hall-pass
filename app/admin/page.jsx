/*
  PassAble — RHS Hall Pass System
  FILE:    app/admin/page.jsx
  ROUTE:   /admin
  PURPOSE: Admin panel — teacher management (create accounts, reset passcodes),
           conflict groups, do-not-let-out list, pass log, school settings.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, passes, conflict_groups, do_not_let_out, settings)
  AUTH:    Password-based. Default passcode = room number doubled (room 27 → "2727").
           Teachers must change password on first login (must_change_password flag).
  UPDATED: 2026-06-23 — reverted photo fallback to student-photos (numeric ID files
           live there, not lifetouch-raw); scoped loadDnlo students fetch to DNLO IDs;
           removed dead /student/[id] link;
           added 🔍 Locate Student tab for front office student tracking
*/

'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import { SCHEDULES } from '../../lib/schedules'

const RHS_GREEN = '#006938'

// ── Schedule descriptions for override picker preview ─────────────────────────
const SCHEDULE_DESCRIPTIONS = {
  regular: 'Standard 7-period day. Periods 1–7, brunch, lunch.',
  earlyRelease: 'Shortened periods, school ends ~2:00 PM.',
  blockWed: 'Block day — Wednesday. Pairs: 1&2, 3&4, 5&6 + Period 7.',
  blockThu: 'Block day — Thursday. Pairs: 1&2, 3&4, 5&6 + Period 7.',
  minimum: 'Minimum day. All 7 periods, school ends ~1:00 PM.',
  activity: 'Activity (End of Day). Regular schedule, activity after Period 7.',
  middayActivity: 'Midday activity/assembly during lunch block.',
  middayActivityWed: 'Block Wednesday + midday activity/assembly.',
  middayActivityThu: 'Block Thursday + midday activity/assembly.',
  foggy: 'Foggy / Late Arrival. School starts ~10:00 AM, all 7 periods.',
  foggyBlockWed: 'Foggy late start + Block Wednesday schedule.',
  foggyBlockThu: 'Foggy late start + Block Thursday schedule.',
  codeDay: 'Midday Activity Alternate. Regular periods + activity block during lunch.',
  custom: 'Define your own period times below after selecting.',
}

// ── Global schedule picker with preview ──────────────────────────────────────
function ScheduleSelectWithPreview({ value, onChange, labels }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handleOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const previewKey = hovered || value

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
          <div style={{ minWidth: 240, maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
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
          <div style={{ width: 220, borderLeft: '1px solid #f3f4f6', background: '#fafafa', borderRadius: '0 10px 10px 0', padding: '12px 14px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: RHS_GREEN, marginBottom: 6 }}>{labels[previewKey]}</p>
            <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>{SCHEDULE_DESCRIPTIONS[previewKey] || 'No description available.'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

const LOG_FILTER_OPTIONS = [
  { id: 'today',    label: 'Today' },
  { id: 'week',     label: 'This Week' },
  { id: 'month',    label: 'This Month' },
  { id: 'quarter',  label: 'This Quarter' },
  { id: 'semester', label: 'This Semester' },
  { id: 'all',      label: 'All Time' },
]

function getLogStartDate(period) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (period) {
    case 'today':   return new Date(y, m, d)
    case 'week': {
      const day = now.getDay()
      return new Date(y, m, d - (day === 0 ? 6 : day - 1))
    }
    case 'month':   return new Date(y, m, 1)
    case 'quarter': return new Date(y, Math.floor(m / 3) * 3, 1)
    case 'semester': {
      const semStart = m >= 7 ? 7 : 1
      const semYear  = m >= 7 ? y : (m < 1 ? y - 1 : y)
      return new Date(semYear, semStart, 1)
    }
    default: return null
  }
}

function getStudentPhotoUrl(student) {
  if (!student) return null
  return student.photo_url || null
  // Storage photos (photo_file) are loaded as signed URLs via photoUrls state map
}

export default function AdminPanel() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState('teachers')

  // ── Login form ────────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── Teachers ──────────────────────────────────────────────────────────────
  const [teachers, setTeachers] = useState([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [saving, setSaving] = useState(false)
  const [settingPasscode, setSettingPasscode] = useState({})   // { [teacher_id]: 'sending'|'sent'|'error' }
  const [resettingPassword, setResettingPassword] = useState({}) // { [teacher_id]: true }
  const [importPreview, setImportPreview] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherError, setTeacherError] = useState('')
  const fileRef = useRef(null)

  // ── Teacher pass stats ─────────────────────────────────────────────────────
  const [teacherStats, setTeacherStats] = useState({})

  // ── Teacher pass log modal ────────────────────────────────────────────────
  const [logModalTeacher, setLogModalTeacher] = useState(null)
  const [logModalPasses, setLogModalPasses] = useState([])
  const [logModalLoading, setLogModalLoading] = useState(false)
  const [logModalFilter, setLogModalFilter] = useState('today')

  // ── Demo reset ────────────────────────────────────────────────────────────
  const [resettingDemo, setResettingDemo] = useState(false)
  const [demoResetMsg, setDemoResetMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null) // teacher id
  const [deleting, setDeleting] = useState(false)

  const emptyForm = { name: '', email: '', room: '', department: '', pin: '', is_admin: false, is_active: true, periods: ['1','4','6'], period_labels: {} }
  const [form, setForm] = useState(emptyForm)

  // ── Students ──────────────────────────────────────────────────────────────
  const [students, setStudents] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})
  const [studentSearch, setStudentSearch] = useState('')
  const [scheduleConflicts, setScheduleConflicts] = useState([]) // [{ student_id, full_name, period, rooms: [{room, teacherName}] }]

  // ── Pass log ──────────────────────────────────────────────────────────────
  const [passes, setPasses] = useState([])
  const [logFilter, setLogFilter] = useState('today')
  const [checkingIn, setCheckingIn] = useState(null)
  const [teacherMap, setTeacherMap] = useState({})

  // ── Conflict groups ───────────────────────────────────────────────────────
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState({})
  const [newGroupName, setNewGroupName] = useState('')
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [addingMember, setAddingMember] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [groupMsg, setGroupMsg] = useState('')
  const [conflictAnalytics, setConflictAnalytics] = useState([])

  // ── DNLO ──────────────────────────────────────────────────────────────────
  const [dnloList, setDnloList] = useState([])
  const [dnloSearch, setDnloSearch] = useState('')
  const [dnloSearchResults, setDnloSearchResults] = useState([])
  const [dnloReason, setDnloReason] = useState('')
  const [dnloMsg, setDnloMsg] = useState('')

  // ── School settings ────────────────────────────────────────────────────────
  const [blockFirstLast15, setBlockFirstLast15] = useState(true)
  const [schoolSettingsSaved, setSchoolSettingsSaved] = useState(false)
  // Global schedule override
  const [globalOverrideType, setGlobalOverrideType] = useState('regular')
  const [globalOverrideActive, setGlobalOverrideActive] = useState(false)
  const [globalOverrideActiveType, setGlobalOverrideActiveType] = useState('')
  const [globalOverrideSaving, setGlobalOverrideSaving] = useState(false)
  const [globalCustomPeriods, setGlobalCustomPeriods] = useState([
    { id: '1', label: 'Period 1', start: '', end: '', break: false }
  ])

  // ── Year-end tools ────────────────────────────────────────────────────────
  const [yearEndConfirm, setYearEndConfirm] = useState(null) // null | 'rosters' | 'dnlo'
  const [yearEndWorking, setYearEndWorking] = useState(false)
  const [yearEndMsg, setYearEndMsg] = useState('')
  const [exportingPassLog, setExportingPassLog] = useState(false)

  // ── Live clock ───────────────────────────────────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // ── Student Locator ──────────────────────────────────────────────────────
  const [locatorQuery, setLocatorQuery] = useState('')
  const [locatorResults, setLocatorResults] = useState([])
  const [locatorLoading, setLocatorLoading] = useState(false)
  const locatorTimerRef = useRef(null)

  // ── Help panel ────────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [helpPos, setHelpPos] = useState({ x: null, y: null })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef(null)

  const startHelpDrag = useCallback((e) => {
    if (e.target.closest('input, button, a')) return
    const rect = helpPanelRef.current?.getBoundingClientRect()
    if (!rect) return
    helpDragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (mv) => setHelpPos({ x: mv.clientX - helpDragOffset.current.dx, y: mv.clientY - helpDragOffset.current.dy })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) checkAdmin() }, [session])
  useEffect(() => {
    if (!isAdmin) return
    loadTeachers()
    loadStudents().then(data => { loadGroups(data); loadConflictAnalytics(data) })
    loadPasses()
    loadDnlo()
    loadSchoolSettings()
    loadScheduleConflicts()
  }, [isAdmin])

  async function handlePasswordLogin(e) {
    e.preventDefault()
    setLoginError(''); setLoginLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) setLoginError('Invalid email or password.')
    setLoginLoading(false)
  }

  const SCHEDULE_LABELS = {
    regular: 'Regular',
    earlyRelease: 'Early Release',
    blockWed: 'Block — Wednesday',
    blockThu: 'Block — Thursday',
    minimum: 'Minimum Day',
    activity: 'Activity (End of Day)',
    middayActivity: 'Midday Activity',
    middayActivityWed: 'Midday Activity — Wednesday',
    middayActivityThu: 'Midday Activity — Thursday',
    foggy: 'Foggy — Regular',
    foggyBlockWed: 'Foggy Block — Wednesday',
    foggyBlockThu: 'Foggy Block — Thursday',
    codeDay: 'Midday Activity Alternate',
    custom: 'Custom…',
  }

  function todayStr() { return new Date().toISOString().split('T')[0] }

  async function loadSchoolSettings() {
    const today = todayStr()
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['block_first_last_15', `schedule_override_global_${today}`])
    if (data) {
      const block = data.find(r => r.key === 'block_first_last_15')
      if (block) setBlockFirstLast15(block.value !== 'false')
      const ovr = data.find(r => r.key === `schedule_override_global_${today}`)
      if (ovr) { setGlobalOverrideActive(true); setGlobalOverrideActiveType(ovr.value) }
      else { setGlobalOverrideActive(false); setGlobalOverrideActiveType('') }
    }
  }

  async function saveBlockFirstLast15(val) {
    await supabase.from('settings').upsert({ key: 'block_first_last_15', value: val ? 'true' : 'false' }, { onConflict: 'key' })
    setBlockFirstLast15(val)
    setSchoolSettingsSaved(true)
    setTimeout(() => setSchoolSettingsSaved(false), 2500)
  }

  async function saveGlobalOverride() {
    setGlobalOverrideSaving(true)
    const ds = todayStr()
    await supabase.from('settings').upsert({ key: `schedule_override_global_${ds}`, value: globalOverrideType }, { onConflict: 'key' })
    if (globalOverrideType === 'custom') {
      await supabase.from('settings').upsert({ key: `schedule_override_custom_global_${ds}`, value: JSON.stringify(globalCustomPeriods) }, { onConflict: 'key' })
    }
    setGlobalOverrideActive(true)
    setGlobalOverrideActiveType(globalOverrideType)
    setGlobalOverrideSaving(false)
  }

  async function exportFullYearPassLog() {
    setExportingPassLog(true)
    // Fetch all passes (no date filter — full history)
    const { data: passData } = await supabase
      .from('passes')
      .select('*')
      .order('time_out', { ascending: false })
      .limit(50000)

    if (!passData || passData.length === 0) {
      setExportingPassLog(false)
      alert('No pass records found.')
      return
    }

    // Fetch student + teacher names for join
    const studentIds = [...new Set(passData.map(p => p.student_id))]
    const teacherIds = [...new Set(passData.map(p => p.teacher_id).filter(Boolean))]
    const { data: studs } = await supabase.from('students').select('id, full_name').in('id', studentIds)
    const { data: tchrs } = teacherIds.length
      ? await supabase.from('teachers').select('id, name, room').in('id', teacherIds)
      : { data: [] }
    const studMap = {}
    if (studs) studs.forEach(s => { studMap[s.id] = s.full_name })
    const tchrMap = {}
    if (tchrs) tchrs.forEach(t => { tchrMap[t.id] = t })

    const year = new Date().getFullYear()
    const headers = ['Student', 'Date', 'Reason', 'Time Out', 'Time In', 'Duration (min)', 'Room', 'Teacher', 'Period', 'Pass Type']
    const rows = passData.map(p => [
      studMap[p.student_id] || p.student_id,
      new Date(p.time_out).toLocaleDateString(),
      (p.reason || '').replace(/,/g, ';'),
      new Date(p.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      p.time_in ? new Date(p.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      p.duration_minutes || '',
      p.room || (p.teacher_id && tchrMap[p.teacher_id]?.room) || '',
      p.teacher_id && tchrMap[p.teacher_id] ? tchrMap[p.teacher_id].name : 'Kiosk',
      p.period || '',
      p.pass_type === 'late_pass' ? 'Late Pass' : 'Hall Pass',
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pass Log')
    XLSX.writeFile(wb, `passable-full-year-${year}-${new Date().toISOString().slice(0,10)}.xlsx`)
    setExportingPassLog(false)
  }

  async function yearEndClearRosters() {
    setYearEndWorking(true)
    const { error } = await supabase.from('student_periods').delete().neq('id', '00000000-0000-0000-0000-000000000000') // delete all
    setYearEndWorking(false)
    setYearEndConfirm(null)
    setYearEndMsg(error ? `Error: ${error.message}` : '✅ All class rosters cleared. Teachers can now re-import from Aeries.')
    setTimeout(() => setYearEndMsg(''), 6000)
  }

  async function yearEndClearDnlo() {
    setYearEndWorking(true)
    const { error } = await supabase.from('do_not_let_out').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setYearEndWorking(false)
    setYearEndConfirm(null)
    setYearEndMsg(error ? `Error: ${error.message}` : '✅ Do Not Let Out list cleared.')
    setTimeout(() => setYearEndMsg(''), 6000)
  }

  async function clearGlobalOverride() {
    const ds = todayStr()
    await supabase.from('settings').delete().in('key', [`schedule_override_global_${ds}`, `schedule_override_custom_global_${ds}`])
    setGlobalOverrideActive(false)
    setGlobalOverrideActiveType('')
  }

  async function checkAdmin() {
    const { data } = await supabase.from('teachers').select('is_admin').eq('email', session.user.email).single()
    if (data?.is_admin) setIsAdmin(true)
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  // ── Passcode helpers ──────────────────────────────────────────────────────
  function defaultPasscode(room) {
    // Room 27 → "2727", Room 7 → "0707", Room 17 → "1717"
    const r = String(room || '00').padStart(2, '0')
    return r + r
  }

  // ── Create teacher auth account ───────────────────────────────────────────
  async function handleSetPasscode(teacher) {
    if (!teacher.room) {
      setTeacherError(`${teacher.name} has no room number — add one first so we can set the default passcode.`)
      return
    }
    setSettingPasscode(prev => ({ ...prev, [teacher.id]: 'sending' }))
    const password = defaultPasscode(teacher.room)

    const res = await fetch('/api/admin/teacher-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', email: teacher.email, password })
    })
    const result = await res.json()

    if (result.error) {
      setSettingPasscode(prev => ({ ...prev, [teacher.id]: 'error' }))
      setTeacherError(`Could not create account for ${teacher.name}: ${result.error}`)
    } else {
      // Link auth_id and flag first-login password change
      await supabase.from('teachers')
        .update({ auth_id: result.user_id, must_change_password: true })
        .eq('id', teacher.id)
      setSettingPasscode(prev => ({ ...prev, [teacher.id]: 'sent' }))
      setTeacherMsg(`✅ Account created for ${teacher.name}. Passcode: ${password}`)
      loadTeachers()
      setTimeout(() => setTeacherMsg(''), 6000)
    }
    setTimeout(() => setSettingPasscode(prev => ({ ...prev, [teacher.id]: null })), 4000)
  }

  // ── Reset teacher password to default ────────────────────────────────────
  async function handleResetPasscode(teacher) {
    if (!teacher.auth_id) { setTeacherError(`${teacher.name} has no auth account yet — use Set Passcode first.`); return }
    if (!teacher.room) { setTeacherError(`${teacher.name} has no room number set.`); return }
    if (!confirm(`Reset ${teacher.name}'s passcode to default (${defaultPasscode(teacher.room)})?`)) return

    setResettingPassword(prev => ({ ...prev, [teacher.id]: true }))
    const password = defaultPasscode(teacher.room)

    const res = await fetch('/api/admin/teacher-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', auth_id: teacher.auth_id, password })
    })
    const result = await res.json()

    if (result.error) {
      setTeacherError(`Reset failed: ${result.error}`)
    } else {
      await supabase.from('teachers').update({ must_change_password: true }).eq('id', teacher.id)
      setTeacherMsg(`↩️ Passcode reset to ${password} for ${teacher.name}. They'll be prompted to change it on next login.`)
      loadTeachers()
      setTimeout(() => setTeacherMsg(''), 6000)
    }
    setResettingPassword(prev => ({ ...prev, [teacher.id]: false }))
  }

  // ── Teacher stats ─────────────────────────────────────────────────────────
  async function loadTeacherStats(teacherList) {
    const list = teacherList || teachers
    if (!list.length) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: passData } = await supabase
      .from('passes')
      .select('teacher_id, time_out')
      .gte('time_out', today.toISOString())
      .not('teacher_id', 'is', null)

    const { data: allPasses } = await supabase
      .from('passes')
      .select('teacher_id, time_out')
      .not('teacher_id', 'is', null)
      .order('time_out', { ascending: false })

    const stats = {}
    list.forEach(t => {
      const todayPasses = passData?.filter(p => p.teacher_id === t.id) || []
      const allTeacherPasses = allPasses?.filter(p => p.teacher_id === t.id) || []
      stats[t.id] = {
        todayCount: todayPasses.length,
        lastActive: allTeacherPasses[0]?.time_out || null,
      }
    })
    setTeacherStats(stats)
  }

  // ── Teacher functions ─────────────────────────────────────────────────────
  async function loadTeachers() {
    setTeachersLoading(true)
    const { data } = await supabase.from('teachers').select('*').order('name')
    const list = data || []
    setTeachers(list)
    setTeachersLoading(false)
    loadTeacherStats(list)
  }

  async function handleSave() {
    setTeacherError(''); setTeacherMsg('')
    if (!form.name || !form.email) { setTeacherError('Name and email are required.'); return }
    setSaving(true)
    if (editingTeacher) {
      const { error } = await supabase.from('teachers')
        .update({ name: form.name, email: form.email, room: form.room, department: form.department, pin: form.pin, is_admin: form.is_admin, is_active: form.is_active, periods: form.periods, period_labels: form.period_labels })
        .eq('id', editingTeacher.id)
      if (error) { setTeacherError(error.message); setSaving(false); return }
      setTeacherMsg(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('teachers')
        .insert({ name: form.name, email: form.email, room: form.room, department: form.department, pin: form.pin, is_admin: form.is_admin, is_active: form.is_active, periods: form.periods, period_labels: form.period_labels })
      if (error) { setTeacherError(error.message); setSaving(false); return }
      setTeacherMsg(`${form.name} added. Click 🔑 Set Passcode to create their login.`)
    }
    setSaving(false); setShowForm(false); setEditingTeacher(null); setForm(emptyForm)
    loadTeachers()
    setTimeout(() => setTeacherMsg(''), 5000)
  }

  function handleEdit(teacher) {
    setEditingTeacher(teacher)
    setForm({ name: teacher.name, email: teacher.email, room: teacher.room || '', department: teacher.department || '', pin: teacher.pin || '', is_admin: teacher.is_admin, is_active: teacher.is_active, periods: teacher.periods || ['1','4','6'], period_labels: teacher.period_labels || {} })
    setShowForm(true); setTeacherError(''); setTeacherMsg('')
  }

  function handleCancelForm() {
    setShowForm(false); setEditingTeacher(null); setForm(emptyForm); setTeacherError('')
  }

  async function handleToggleActive(teacher) {
    await supabase.from('teachers').update({ is_active: !teacher.is_active }).eq('id', teacher.id)
    loadTeachers()
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportErrors([]); setImportPreview([])
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const errors = []
        const parsed = rows.map((row, i) => {
          const get = (key) => {
            const match = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase())
            return match ? String(row[match]).trim() : ''
          }
          const name = get('name') || get('full_name') || get('fullname')
          const email = get('email')
          const room = get('room') || get('room number') || get('room_number')
          const department = get('department') || get('dept')
          const pin = get('pin')
          const is_admin = ['true', 'yes', '1'].includes(String(get('admin') || get('is_admin')).toLowerCase())
          if (!name) errors.push(`Row ${i + 2}: Missing name`)
          if (!email) errors.push(`Row ${i + 2}: Missing email`)
          if (email && !email.includes('@')) errors.push(`Row ${i + 2}: Invalid email — ${email}`)
          return { name, email, room, department, pin, is_admin, is_active: true, _row: i + 2 }
        }).filter(r => r.name && r.email && r.email.includes('@'))
        setImportErrors(errors)
        setImportPreview(parsed)
      } catch {
        setImportErrors(['Could not read file. Make sure it is a valid .xlsx file.'])
      }
    }
    reader.readAsBinaryString(file)
  }

  async function handleImportConfirm() {
    if (importPreview.length === 0) return
    setImporting(true); setTeacherError('')
    const existingEmails = teachers.map(t => t.email.toLowerCase())
    const toInsert = importPreview.filter(r => !existingEmails.includes(r.email.toLowerCase()))
    const skipped = importPreview.length - toInsert.length
    if (toInsert.length === 0) {
      setTeacherError('All emails already exist — nothing to import.')
      setImporting(false); return
    }
    const rows = toInsert.map(({ _row, ...r }) => r)
    const { error } = await supabase.from('teachers').insert(rows)
    if (error) {
      setTeacherError(`Import failed: ${error.message}`)
    } else {
      setTeacherMsg(`✅ Imported ${toInsert.length} teacher${toInsert.length !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} skipped (already exist)` : ''}. Use 🔑 Set Passcode to create their logins.`)
      setShowImport(false); setImportPreview([]); setImportErrors([])
      if (fileRef.current) fileRef.current.value = ''
      loadTeachers()
    }
    setImporting(false)
  }

  // ── Teacher pass log modal ────────────────────────────────────────────────
  async function openTeacherLog(teacher) {
    setLogModalTeacher(teacher)
    setLogModalFilter('today')
    setLogModalPasses([])
    setLogModalLoading(true)
    await fetchTeacherLog(teacher, 'today')
  }

  async function fetchTeacherLog(teacher, filter) {
    setLogModalLoading(true)
    let query = supabase
      .from('passes')
      .select('*')
      .eq('teacher_id', teacher.id)
      .order('time_out', { ascending: false })
    if (filter === 'today') {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      query = query.gte('time_out', today.toISOString())
    }
    const { data: passData } = await query.limit(100)
    if (!passData) { setLogModalLoading(false); return }
    const studentIds = [...new Set(passData.map(p => p.student_id))]
    const { data: studs } = studentIds.length > 0
      ? await supabase.from('students').select('id, full_name').in('id', studentIds)
      : { data: [] }
    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s.full_name)
    setLogModalPasses(passData.map(p => ({ ...p, studentName: studMap[p.student_id] || 'Unknown' })))
    setLogModalLoading(false)
  }

  function closeTeacherLog() {
    setLogModalTeacher(null)
    setLogModalPasses([])
  }

  // ── Demo reset ────────────────────────────────────────────────────────────
  async function handleDemoReset(teacher) {
    const confirmed = window.confirm(
      `Delete ALL pass records for ${teacher.name} (Room ${teacher.room})?\n\nThis cannot be undone. Use this only to reset demo data.`
    )
    if (!confirmed) return
    setResettingDemo(true)
    setDemoResetMsg('')
    const { error, count } = await supabase
      .from('passes')
      .delete({ count: 'exact' })
      .eq('teacher_id', teacher.id)
    if (error) {
      setDemoResetMsg(`Error: ${error.message}`)
    } else {
      setDemoResetMsg(`✅ Demo reset — all pass records for ${teacher.name} cleared.`)
      loadTeacherStats()
      setTimeout(() => setDemoResetMsg(''), 5000)
    }
    setResettingDemo(false)
  }

  async function handleDeleteTeacher(teacher) {
    setDeleting(true)
    // Nullify teacher_id on their passes so records stay but attribution is removed
    await supabase.from('passes').update({ teacher_id: null }).eq('teacher_id', teacher.id)
    // Remove from conflict groups
    await supabase.from('conflict_group_members').delete().eq('student_id', teacher.id) // no-op but safe
    // Delete the teacher record
    await supabase.from('teachers').delete().eq('id', teacher.id)
    setDeleting(false)
    setDeleteConfirm(null)
    setTeacherMsg(`${teacher.name} has been permanently deleted. Their pass records remain in the log with no teacher attribution.`)
    loadTeachers()
    setTimeout(() => setTeacherMsg(''), 7000)
  }

  // ── Signed photo URLs ─────────────────────────────────────────────────────
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

  // ── Student functions ─────────────────────────────────────────────────────
  async function loadStudents() {
    const { data } = await supabase.from('students').select('*').order('last_name')
    if (!data) return []
    // student_periods has the room link — fetch separately and merge
    const { data: periods } = await supabase.from('student_periods').select('student_id, room')
    const roomMap = {}
    if (periods) periods.forEach(p => { roomMap[p.student_id] = p.room })
    const enriched = data.map(s => ({ ...s, _room: roomMap[s.id] || null }))
    setStudents(enriched)
    loadSignedPhotoUrls(enriched)
    return enriched
  }

  // ── Schedule conflict detection ───────────────────────────────────────────
  async function loadScheduleConflicts() {
    // Find students enrolled in the same period across 2+ different rooms
    const { data: spRows } = await supabase
      .from('student_periods').select('student_id, period, room')
    if (!spRows || spRows.length === 0) { setScheduleConflicts([]); return }

    // Group by student_id + period → collect rooms
    const map = {} // `${student_id}::${period}` → Set of rooms
    spRows.forEach(({ student_id, period, room }) => {
      const key = `${student_id}::${period}`
      if (!map[key]) map[key] = { student_id, period, rooms: new Set() }
      map[key].rooms.add(room)
    })

    // Keep only entries with 2+ rooms (true cross-teacher conflict)
    const conflicts = Object.values(map).filter(c => c.rooms.size > 1)
    if (conflicts.length === 0) { setScheduleConflicts([]); return }

    // Enrich with student names
    const studentIds = [...new Set(conflicts.map(c => c.student_id))]
    const { data: studs } = await supabase.from('students').select('id, full_name').in('id', studentIds)
    const studMap = {}
    if (studs) studs.forEach(s => { studMap[s.id] = s.full_name })

    // Enrich with teacher names per room
    const allRooms = [...new Set(spRows.map(r => r.room).filter(Boolean))]
    const { data: tchrs } = await supabase.from('teachers').select('name, room').in('room', allRooms)
    const teacherByRoom = {}
    if (tchrs) tchrs.forEach(t => { teacherByRoom[String(t.room)] = t.name })

    const enriched = conflicts.map(c => ({
      student_id: c.student_id,
      full_name: studMap[c.student_id] || 'Unknown Student',
      period: c.period,
      rooms: [...c.rooms].map(r => ({ room: r, teacherName: teacherByRoom[String(r)] || `Room ${r}` })),
    })).sort((a, b) => a.full_name.localeCompare(b.full_name))

    setScheduleConflicts(enriched)
  }

  async function removeFromRoom(studentId, period, room) {
    await supabase.from('student_periods')
      .delete()
      .eq('student_id', studentId)
      .eq('period', period)
      .eq('room', room)
    loadScheduleConflicts()
    loadStudents()
  }

  // ── Pass log functions ────────────────────────────────────────────────────
  async function loadPasses(filter) {
    const f = filter || logFilter
    let query = supabase.from('passes').select('*').order('time_out', { ascending: false })
    const start = getLogStartDate(f)
    if (start) query = query.gte('time_out', start.toISOString())
    const { data: passData } = await query.limit(500)
    if (!passData) return

    const studentIds = [...new Set(passData.map(p => p.student_id))]
    const teacherIds = [...new Set(passData.map(p => p.teacher_id).filter(Boolean))]

    const { data: studs } = await supabase.from('students').select('id, full_name').in('id', studentIds)
    const { data: tchrs } = teacherIds.length
      ? await supabase.from('teachers').select('id, name, room').in('id', teacherIds)
      : { data: [] }

    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s.full_name)
    const tMap = {}
    if (tchrs) { tchrs.forEach(t => tMap[t.id] = t); setTeacherMap(tMap) }

    setPasses(passData.map(p => ({
      ...p,
      students: { full_name: studMap[p.student_id] || 'Unknown' },
      teacherInfo: p.teacher_id ? tMap[p.teacher_id] : null,
    })))
  }

  function exportAdminCSV() {
    const label = LOG_FILTER_OPTIONS.find(o => o.id === logFilter)?.label || 'All'
    const headers = ['Student', 'Date', 'Reason', 'Out', 'In', 'Duration (min)', 'Room', 'Teacher', 'Period', 'Type']
    const rows = passes.map(p => [
      p.students?.full_name || p.student_id,
      new Date(p.time_out).toLocaleDateString(),
      `"${(p.reason || '').replace(/"/g, '""')}"`,
      new Date(p.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      p.time_in ? new Date(p.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      p.duration_minutes || '',
      p.room || '',
      p.teacherInfo ? `${p.teacherInfo.name} (Rm ${p.teacherInfo.room})` : p.teacher_id ? 'Teacher' : 'Kiosk',
      p.period || '',
      p.pass_type === 'late_pass' ? 'Late Pass' : 'Hall Pass'
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `passable-school-log-${label.replace(/\s/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  async function checkInPass(passId) {
    setCheckingIn(passId)
    const pass = passes.find(p => p.id === passId)
    const mins = pass ? Math.floor((new Date() - new Date(pass.time_out)) / 60000) : 0
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    setCheckingIn(null)
    loadPasses()
  }

  // ── Conflict group functions ──────────────────────────────────────────────
  async function loadGroups(studentsList) {
    const list = studentsList || students
    const { data: grps } = await supabase.from('conflict_groups').select('*').order('name')
    if (!grps) return
    setGroups(grps)
    const membersMap = {}
    for (const g of grps) {
      const { data: members } = await supabase.from('conflict_group_members').select('id, student_id').eq('group_id', g.id)
      if (members) {
        membersMap[g.id] = members.map(m => ({ ...m, students: { full_name: list.find(s => s.id === m.student_id)?.full_name || m.student_id } }))
      } else { membersMap[g.id] = [] }
    }
    setGroupMembers(membersMap)
  }

  async function loadConflictAnalytics(studentsList) {
    const list = studentsList || students
    const { data: grps } = await supabase.from('conflict_groups').select('*').order('name')
    if (!grps || !grps.length) return
    const analytics = []
    for (const g of grps) {
      const { data: members } = await supabase.from('conflict_group_members').select('student_id').eq('group_id', g.id)
      if (!members || members.length < 2) { analytics.push({ group: g, conflicts: 0, members: members || [] }); continue }
      const memberIds = members.map(m => m.student_id)
      const { data: memberPasses } = await supabase.from('passes').select('student_id, time_out, time_in').in('student_id', memberIds).not('time_in', 'is', null).order('time_out')
      let conflictCount = 0
      if (memberPasses) {
        for (let i = 0; i < memberPasses.length; i++) {
          for (let j = i + 1; j < memberPasses.length; j++) {
            const a = memberPasses[i], b = memberPasses[j]
            if (a.student_id === b.student_id) continue
            const aOut = new Date(a.time_out), aIn = new Date(a.time_in)
            const bOut = new Date(b.time_out), bIn = new Date(b.time_in)
            if (aOut < bIn && bOut < aIn) conflictCount++
          }
        }
      }
      analytics.push({ group: g, conflicts: conflictCount, members: members.map(m => ({ student_id: m.student_id, full_name: list.find(s => s.id === m.student_id)?.full_name || m.student_id, passCount: memberPasses?.filter(p => p.student_id === m.student_id).length || 0 })) })
    }
    setConflictAnalytics(analytics)
  }

  async function addGroup() {
    if (!newGroupName.trim()) return
    const { error } = await supabase.from('conflict_groups').insert({ name: newGroupName.trim() })
    if (!error) { setNewGroupName(''); loadGroups(); setGroupMsg('Group created.'); setTimeout(() => setGroupMsg(''), 2000) }
  }

  async function deleteGroup(id, name) {
    if (!confirm(`Delete group "${name}"? Members will be removed too.`)) return
    await supabase.from('conflict_group_members').delete().eq('group_id', id)
    await supabase.from('conflict_groups').delete().eq('id', id)
    loadGroups()
  }

  async function addMember(groupId, studentId) {
    const already = (groupMembers[groupId] || []).find(m => m.student_id === studentId)
    if (already) { setMemberSearch(''); return }
    const student = students.find(s => s.id === studentId)
    const { error } = await supabase.from('conflict_group_members').insert({ group_id: groupId, student_id: studentId })
    if (!error) {
      const newMember = { id: Date.now(), student_id: studentId, students: { full_name: student?.full_name } }
      setGroupMembers(prev => ({ ...prev, [groupId]: [...(prev[groupId] || []), newMember] }))
    }
    setMemberSearch(''); loadGroups()
  }

  async function removeMember(memberId, groupId) {
    await supabase.from('conflict_group_members').delete().eq('id', memberId)
    loadGroups()
  }

  // ── DNLO functions ────────────────────────────────────────────────────────
  async function loadDnlo() {
    const { data } = await supabase.from('do_not_let_out').select('*').eq('active', true).eq('scope', 'admin').order('created_at', { ascending: false })
    if (data) {
      // Scope students fetch to only the IDs in this DNLO list
      const dnloStudentIds = data.map(d => d.student_id).filter(Boolean)
      const studMap = {}
      if (dnloStudentIds.length > 0) {
        const { data: studs } = await supabase.from('students').select('id, full_name').in('id', dnloStudentIds)
        if (studs) studs.forEach(s => { studMap[s.id] = s.full_name })
      }
      setDnloList(data.map(d => ({ ...d, full_name: studMap[d.student_id] || d.student_id })))
    }
  }

  async function addDnlo(studentId, studentName) {
    const { error } = await supabase.from('do_not_let_out').insert({ student_id: studentId, reason: dnloReason.trim() || 'Admin restriction', scope: 'admin', created_by: session?.user?.email || 'admin', active: true })
    if (!error) {
      setDnloMsg(`${studentName} added to Do Not Let Out list.`)
      setDnloSearch(''); setDnloReason(''); setDnloSearchResults([])
      loadDnlo(); setTimeout(() => setDnloMsg(''), 3000)
    }
  }

  async function removeDnlo(id, name) {
    await supabase.from('do_not_let_out').update({ active: false }).eq('id', id)
    setDnloMsg(`${name} removed from list.`)
    loadDnlo(); setTimeout(() => setDnloMsg(''), 3000)
  }

  useEffect(() => {
    if (!dnloSearch.trim()) { setDnloSearchResults([]); return }
    const results = students.filter(s => s.full_name?.toLowerCase().includes(dnloSearch.toLowerCase()) && !dnloList.find(d => d.student_id === s.id)).slice(0, 6)
    setDnloSearchResults(results)
  }, [dnloSearch, students, dnloList])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatLastActive(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function isDemoTeacher(t) {
    return t.room?.toLowerCase() === '11w'
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  // Short period label: "Periods 1 & 2" → "P1&2", "1" → "P1"
  function shortPeriod(period) {
    if (!period) return ''
    return 'P' + String(period).replace(/periods?\s*/i, '').replace(/\s*&\s*/g, '&').trim()
  }

  // Match students to teachers by room number (the actual join key in student_periods)
  const teacherByRoom = Object.fromEntries(teachers.map(t => [String(t.room), t]))

  // Active teachers first (alpha), then inactive (alpha)
  const sortedTeachers = [
    ...teachers.filter(t => t.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    ...teachers.filter(t => !t.is_active).sort((a, b) => a.name.localeCompare(b.name)),
  ]

  // Offer delete if deactivated and last pass was 4+ years ago (or never)
  const FOUR_YEARS_MS = 4 * 365.25 * 24 * 60 * 60 * 1000
  function isEligibleForDeletion(teacher) {
    if (teacher.is_active) return false
    const lastActive = teacherStats[teacher.id]?.lastActive
    if (!lastActive) return true // never had a pass — safe to delete
    return (Date.now() - new Date(lastActive).getTime()) > FOUR_YEARS_MS
  }

  const filteredStudents = students
    .filter(s => s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()))

  const memberSearchResults = students.filter(s => s.full_name?.toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 8)

  // ── Auth screens ──────────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-6" />
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Admin Panel</h1>
      <p className="text-gray-500 text-sm mb-8">Sign in with your school email and passcode</p>
      <form onSubmit={handlePasswordLogin} className="w-full max-w-sm space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={loginEmail}
          onChange={e => setLoginEmail(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:border-green-600"
        />
        <input
          type="password"
          placeholder="Passcode"
          value={loginPassword}
          onChange={e => setLoginPassword(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:border-green-600"
        />
        {loginError && <p className="text-red-600 text-sm">{loginError}</p>}
        <button
          type="submit"
          disabled={loginLoading}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: RHS_GREEN }}>
          {loginLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      <a href="/teacher" className="mt-8 text-sm text-gray-400 hover:text-gray-600">← Teacher Login</a>
    </div>
  )

  if (!isAdmin) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-4xl mb-4">🔒</div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">Admin Access Only</h1>
      <p className="text-gray-500 text-sm mb-6">You don't have admin permissions.</p>
      <a href="/teacher" className="px-6 py-3 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: RHS_GREEN }}>Go to Teacher Login</a>
    </div>
  )

  // ── Student Locator search ─────────────────────────────────────────────────
  async function runLocatorSearch(query) {
    if (!query.trim()) { setLocatorResults([]); return }
    setLocatorLoading(true)

    // 1. Find matching students
    const { data: studs } = await supabase
      .from('students')
      .select('id, full_name, photo_url, photo_file')
      .ilike('full_name', `%${query.trim()}%`)
      .limit(20)

    if (!studs || studs.length === 0) { setLocatorResults([]); setLocatorLoading(false); return }

    const ids = studs.map(s => s.id)

    // 2. Get all scheduled periods for these students
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id, period, room')
      .in('student_id', ids)

    // 3. Get any active passes (time_in is null)
    const { data: activePasses } = await supabase
      .from('passes')
      .select('id, student_id, time_out, reason, room, period, teacher_id')
      .in('student_id', ids)
      .is('time_in', null)

    // 4. Look up teacher names for all rooms that appear
    const allRooms = [...new Set([
      ...(spRows || []).map(r => r.room),
      ...(activePasses || []).map(p => p.room),
    ])]
    const teachersByRoom = {}
    if (allRooms.length > 0) {
      const { data: tchrs } = await supabase
        .from('teachers')
        .select('name, room')
        .in('room', allRooms)
        .eq('is_active', true)
      if (tchrs) tchrs.forEach(t => { teachersByRoom[t.room] = t.name })
    }

    // 5. Assemble results
    const results = studs.map(s => {
      const periods = (spRows || [])
        .filter(r => r.student_id === s.id)
        .sort((a, b) => Number(a.period) - Number(b.period))
        .map(r => ({ period: r.period, room: r.room, teacher: teachersByRoom[r.room] || null }))

      const active = (activePasses || [])
        .filter(p => p.student_id === s.id)
        .map(p => ({
          id: p.id,
          time_out: p.time_out,
          reason: p.reason,
          room: p.room,
          period: p.period,
          teacher: teachersByRoom[p.room] || null,
        }))

      return { student: s, periods, activePasses: active }
    })

    setLocatorResults(results)
    setLocatorLoading(false)
  }

  function handleLocatorInput(val) {
    setLocatorQuery(val)
    if (locatorTimerRef.current) clearTimeout(locatorTimerRef.current)
    locatorTimerRef.current = setTimeout(() => runLocatorSearch(val), 300)
  }

  const TABS = [
    { id: 'teachers', label: 'Teachers' },
    { id: 'conflicts', label: 'Conflict Groups' },
    { id: 'dnlo', label: 'Do Not Let Out' },
    { id: 'students', label: scheduleConflicts.length > 0 ? `Students ⚠️ ${scheduleConflicts.length}` : 'Students' },
    { id: 'locator', label: '🔍 Locate Student' },
    { id: 'log', label: 'Pass Log' },
    { id: 'settings', label: '⚙️ School Settings' },
  ]

  const ADMIN_HELP = [
    { title: 'Teachers', items: [
      { q: 'How do I add a new teacher or admin?', a: <>Click <strong>+ Add Staff Member</strong>, fill in their name, email, and room number, select their department, then save. Check <strong>Admin access</strong> if they should have admin panel access. After saving, click <strong>🔑 Set Passcode</strong> to create their login. Their default passcode will be their room number doubled (Room 30 → <strong>3030</strong>).</> },
      { q: 'What room number should I use?', a: 'Use the actual room number (e.g. 27). For shared spaces, add a suffix to keep rooms unique — gym-a / gym-b, office-1 / office-2. Admin-only staff with no classroom use admin. Getting this right from the start matters — changing a room number later requires a database update to re-link students.' },
      { q: 'How do I set up an admin account?', a: <>Fill in their name and email. Set Room to <strong>admin</strong> (or their actual room if they also teach). Set Department to <strong>Administration</strong>. Leave PIN blank. Check <strong>Admin access</strong>. Leave all Periods unchecked unless they also run a classroom. Save, then click <strong>🔑 Set Passcode</strong> to create their login.</> },
      { q: 'How do I set up a front office worker?', a: <>Fill in their name and email. Set Room to <strong>office-1</strong> (or office-2 if a second person). Set Department to <strong>Office</strong>. Leave PIN blank. Check <strong>Admin access</strong> so they can access the admin panel. Leave all Periods unchecked — they have no classroom or kiosk. Save, then click <strong>🔑 Set Passcode</strong> to create their login.</> },
      { q: 'A teacher forgot their passcode.', a: <>Click <strong>↩️ Reset Passcode</strong> next to their name. This resets it to their room number doubled and flags them to change it on next login. Tell them to check their room number if unsure what the default is.</> },
      { q: "A teacher can't log in at all.", a: <>If Reset Passcode doesn't work, go to <a href="https://supabase.com" target="_blank" rel="noopener" style={{color:RHS_GREEN,textDecoration:'underline'}}>supabase.com</a> → Authentication → Users → find them by email → Send password recovery. The link goes to their email (check spam).</> },
      { q: 'What does NEEDS PW CHANGE mean?', a: <>The teacher has been given a default passcode and hasn't changed it yet. Remind them to go to Settings on their teacher dashboard and set a personal passcode.</> },
      { q: 'What does NO ACCOUNT mean?', a: <>The teacher record exists but no login has been created yet. Click <strong>🔑 Set Passcode</strong> to create one.</> },
    ]},
    { title: 'Student Photos', items: [
      { q: 'How do I import Lifetouch photos?', a: <>Go to <a href="/admin/photos" style={{color:RHS_GREEN,textDecoration:'underline'}}>Admin Photos</a>. Drop in the entire Lifetouch photo folder — it matches by name against all students school-wide. Do this at the start of the year when Lifetouch delivers photos, or any time you get a new batch mid-year. You only need to do it once per batch, not per classroom.</> },
      { q: 'Some photos were skipped.', a: <>Skipped means the name in the photo filename didn't match a student in PassAble — usually a spelling difference between Lifetouch and Aeries. You can upload individual photos via the student's edit page in <a href="/admin/students" style={{color:RHS_GREEN,textDecoration:'underline'}}>Student Manager</a>.</> },
      { q: 'When I get new Lifetouch photos mid-year, do I re-import?', a: <>Yes — just run the import again. New photos replace old ones and existing data stays untouched. Teachers can also run <strong>Match the Photos</strong> from their Relay Station to pull in photos for just their class if needed.</> },
    ]},
    { title: 'Students', items: [
      { q: 'What is the Students tab?', a: 'A school-wide read-only roster of every student enrolled in PassAble. Each entry shows their period and teacher (e.g., P1 · Chavira). Use the search bar to find any student by name. If a scheduling conflict is detected — a student enrolled in the same period by two different teachers — a warning banner appears at the top so you can resolve it.' },
      { q: 'What is a Scheduling Conflict?', a: 'A scheduling conflict means a student appears on two teachers\' rosters for the same period in different rooms. This usually happens during a class transition when one teacher added the student but the other hasn\'t removed them yet. The yellow warning banner shows each conflict with a Remove button to clear the old room enrollment.' },
      { q: 'What does clicking a student show?', a: 'Their full profile — all pass history across every class and teacher, NFC card status, and pass stats. Useful for counselor meetings, intervention planning, or spotting students who leave frequently across multiple rooms.' },
      { q: 'Can I add or delete students from here?', a: 'No. Students are added by teachers via Import Roster or manually through Manage Students. To remove a student from a class, the teacher handles it in Manage Students.' },
      { q: 'A student has no period or teacher listed.', a: 'That student is in the system but not linked to any active classroom — usually leftover from a demo or a removed teacher account. They can be safely ignored or cleaned up via Supabase.' },
      { q: 'How do I print QR ID badges?', a: <>Go to <a href="/qr" style={{color:RHS_GREEN,textDecoration:'underline'}}>QR Badges</a>. It generates a printable sheet of QR codes — students scan these at the kiosk instead of tapping their name.</> },
    ]},
    { title: 'Student Locator', items: [
      { q: 'What is the Student Locator?', a: 'A real-time lookup for front office staff. Type any student\'s name to see their full schedule (every period and room) and whether they currently have an active pass. If they\'re out, it shows the reason, which room they left from, the issuing teacher, and how long ago the pass was issued.' },
      { q: 'A parent is calling — how do I find a student?', a: 'Go to 🔍 Locate Student, type their name, and check the result. If they\'re in class, you\'ll see their current period and room. If they\'re on a pass, the amber card tells you where they went and when.' },
      { q: 'The locator shows "No schedule on file."', a: 'That student is in the system but hasn\'t been assigned to any active classroom roster. Their teacher should add them through Manage Students or the roster import.' },
    ]},
    { title: 'Pass Log', items: [
      { q: 'The pass log only shows recent passes.', a: <>Use the filter buttons (Today / This Week / This Month / This Quarter / This Semester / All Time) to change the date range. The school-wide log shows passes from all classrooms.</> },
      { q: 'How do I export or print the log?', a: <>In the Pass Log tab, use the <strong>Export CSV</strong> or <strong>Print</strong> buttons on the right side of the filter row. The export filename includes the date range.</> },
    ]},
    { title: 'Conflict Groups & DNLO', items: [
      { q: 'What is a Conflict Group?', a: <>Students in the same group cannot be out at the same time. If two students in a group try to check out simultaneously, the second is held and the teacher is notified. You can override at any time.</> },
      { q: 'What is Do Not Let Out?', a: <>A school-wide restriction. Students on this list are blocked from checking out at any kiosk or teacher dashboard until you remove them. Use for disciplinary holds or admin-requested restrictions.</> },
    ]},
    { title: 'School Settings', items: [
      { q: 'What is the First & Last 15-Minute Rule?', a: <>When on, the status bar on the kiosk and teacher dashboard turns red during the first and last 15 minutes of each period as a reminder not to let students out. It does not block checkout — it's a warning only.</> },
      { q: 'How do I set a schedule override for the whole school?', a: <>Go to <strong>⚙️ School Settings</strong> and find <strong>Global Schedule Override</strong>. Pick the correct schedule and click <strong>Set for All Rooms</strong>. This pushes the override to every teacher's dashboard immediately. Individual teachers can still override their own room independently — a room-level override always takes priority over the global one. All overrides clear automatically at midnight.</> },
      { q: 'What schedules can I override to?', a: 'Regular, Early Release, Block Day (Wed or Thu), Minimum Day, Activity Day, Foggy / Late Arrival, and Code Day. These match the same schedules PassAble auto-detects from Google Calendar.' },
    ]},
    { title: 'Feedback & Feature Requests', items: [
      { q: 'How do I request a new feature or change?', a: <>Have an idea for a new feature or want to modify how something works? Reach out at <a href="mailto:ejoe@rjusd.org" style={{color:RHS_GREEN,textDecoration:'underline'}}>ejoe@rjusd.org</a>.</> },
    ]},
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Admin Help Panel (draggable + searchable) ── */}
      {showHelp && (() => {
        const q = helpSearch.trim().toLowerCase()
        const filtered = q
          ? ADMIN_HELP.map(s => ({ ...s, items: s.items.filter(i => (s.title + ' ' + i.q + ' ' + (i.keys || '')).toLowerCase().includes(q)) })).filter(s => s.items.length > 0)
          : ADMIN_HELP
        return (
          <div
            ref={helpPanelRef}
            className="bg-white rounded-2xl shadow-2xl flex flex-col"
            style={{
              position: 'fixed',
              left: helpPos.x !== null ? helpPos.x : 'calc(100vw - 440px)',
              top: helpPos.y !== null ? helpPos.y : 80,
              width: 420, maxHeight: '85vh', zIndex: 9999,
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl select-none"
              style={{ cursor: 'grab', backgroundColor: '#f9fafb' }}
              onMouseDown={startHelpDrag}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 text-sm">⠿</span>
                <p className="text-sm font-bold text-gray-800">PassAble Admin Help</p>
              </div>
              <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-5 pt-3 pb-2">
              <input
                type="search"
                placeholder="Search help topics…"
                value={helpSearch}
                onChange={e => setHelpSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none"
                autoComplete="off"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 flex flex-col gap-5">
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No results for "{helpSearch}"</p>
              )}
              {filtered.map(section => (
                <div key={section.title}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: RHS_GREEN }}>{section.title}</p>
                  <div>
                    {section.items.map((item, i) => (
                      <details key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="w-full py-2.5 text-sm font-medium rounded-xl text-white" style={{ backgroundColor: RHS_GREEN }}>Got it</button>
            </div>
          </div>
        )
      })()}

      {/* ── Teacher Pass Log Modal ── */}
      {logModalTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">{logModalTeacher.name}</h2>
                <p className="text-xs text-gray-400">
                  Room {logModalTeacher.room || '—'}{logModalTeacher.department ? ` · ${logModalTeacher.department}` : ''} · Pass Log
                </p>
              </div>
              <button onClick={closeTeacherLog} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex gap-2 px-5 pt-4 pb-2">
              {['today', 'all'].map(f => (
                <button key={f}
                  onClick={() => { setLogModalFilter(f); fetchTeacherLog(logModalTeacher, f) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${logModalFilter === f ? 'text-white border-transparent' : 'text-gray-500 bg-white border-gray-200'}`}
                  style={logModalFilter === f ? { backgroundColor: RHS_GREEN } : {}}>
                  {f === 'today' ? 'Today' : 'All Time'}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400 self-center">
                {logModalLoading ? 'Loading...' : `${logModalPasses.length} pass${logModalPasses.length !== 1 ? 'es' : ''}`}
              </span>
            </div>
            <div className="overflow-y-auto flex-1 px-2 pb-4">
              {logModalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
                </div>
              ) : logModalPasses.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">No passes found</div>
              ) : logModalPasses.map(p => {
                const isOut = !p.time_in
                const duration = p.duration_minutes != null ? `${p.duration_minutes}m` : isOut ? 'Out' : '—'
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: isOut ? '#dc2626' : RHS_GREEN }}>
                      {p.studentName?.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{p.studentName}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {p.reason} · P{p.period} · {new Date(p.time_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(p.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isOut ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                      {duration}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
              <a href={`/log?teacher_id=${logModalTeacher.id}`}
                className="text-xs hover:underline" style={{ color: RHS_GREEN }}>
                Full Log & Export →
              </a>
              <button onClick={closeTeacherLog}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Admin Panel</h1>
            <p className="text-green-200 text-xs">{session?.user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/photos" className="text-sm text-green-200 hover:text-white">📷 Photo Import</a>
          <button onClick={() => { setShowHelp(v => !v); setHelpSearch(''); setHelpPos({ x: null, y: null }) }} className="text-sm text-green-200 hover:text-white">❓ Help</button>
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

      {/* ── Schedule status bar ── */}
      {(() => {
        const schedKey = globalOverrideActive ? globalOverrideActiveType : 'regular'
        const sched = SCHEDULES[schedKey] || SCHEDULES.regular
        const schedName = sched?.name || SCHEDULE_LABELS[schedKey] || 'Regular'
        const t2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
        const mins = now.getHours() * 60 + now.getMinutes()
        const currentSlot = sched?.periods?.find(p => mins >= t2m(p.start) && mins < t2m(p.end)) || null
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        let periodLabel, periodColor
        if (!currentSlot) {
          periodLabel = 'Between Periods'
          periodColor = '#6b7280'
        } else if (currentSlot.break) {
          periodLabel = currentSlot.label
          periodColor = '#d97706'
        } else {
          periodLabel = currentSlot.label
          periodColor = RHS_GREEN
        }
        return (
          <div className="border-b border-gray-200 bg-white px-6 py-2 flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-700">{timeStr}</span>
            <span className="text-gray-300">·</span>
            <span className="text-sm font-medium" style={{ color: periodColor }}>{periodLabel}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">{schedName}{globalOverrideActive ? ' (Override)' : ''}</span>
          </div>
        )
      })()}

      <div className="max-w-4xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${activeTab === tab.id ? 'text-white border-transparent' : 'text-gray-600 bg-white border-gray-200 hover:bg-gray-50'}`}
              style={activeTab === tab.id ? { backgroundColor: RHS_GREEN } : {}}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TEACHERS ── */}
        {activeTab === 'teachers' && (
          <>
            {teacherError && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">⚠️ {teacherError}</div>}
            {teacherMsg && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">{teacherMsg}</div>}
            {demoResetMsg && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">{demoResetMsg}</div>}

            {!showForm && !showImport && (
              <div className="flex justify-end gap-3 mb-4">
                <button onClick={() => { setShowImport(true); setTeacherError(''); setTeacherMsg('') }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border"
                  style={{ color: RHS_GREEN, borderColor: RHS_GREEN, background: 'white' }}>
                  📥 Import from Excel
                </button>
                <button onClick={() => { setShowForm(true); setTeacherError(''); setTeacherMsg('') }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl text-white"
                  style={{ backgroundColor: RHS_GREEN }}>
                  + Add Staff Member
                </button>
              </div>
            )}

            {/* Excel Import */}
            {showImport && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="text-base font-bold text-gray-800 mb-1">📥 Import from Excel</h2>
                <p className="text-sm text-gray-500 mb-3">Upload a .xlsx with columns: <strong>name, email, room, department, pin, admin</strong>. Only name and email required. Duplicates skipped.</p>
                <div className="bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700 mb-4">💡 Column headers are flexible — "Full Name", "name", "fullname" all work.</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="mb-4 text-sm" />
                {importErrors.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-3 mb-4">
                    <p className="text-xs font-semibold text-amber-800 mb-1">⚠ Some rows will be skipped:</p>
                    {importErrors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
                  </div>
                )}
                {importPreview.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-800 mb-2">{importPreview.length} teacher{importPreview.length !== 1 ? 's' : ''} ready to import:</p>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50">
                          {['Name','Email','Room','Dept','Admin'].map(h => <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium border-b border-gray-200">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {importPreview.slice(0, 8).map((r, i) => (
                            <tr key={i} className="border-b border-gray-50 last:border-0">
                              <td className="px-3 py-2 text-gray-800">{r.name}</td>
                              <td className="px-3 py-2 text-gray-500">{r.email}</td>
                              <td className="px-3 py-2 text-gray-500">{r.room || '—'}</td>
                              <td className="px-3 py-2 text-gray-500">{r.department || '—'}</td>
                              <td className="px-3 py-2 text-gray-500">{r.is_admin ? '✅' : '—'}</td>
                            </tr>
                          ))}
                          {importPreview.length > 8 && <tr><td colSpan={5} className="px-3 py-2 text-gray-400">...and {importPreview.length - 8} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowImport(false); setImportPreview([]); setImportErrors([]); if (fileRef.current) fileRef.current.value = '' }}
                    className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleImportConfirm} disabled={importPreview.length === 0 || importing}
                    className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {importing ? 'Importing...' : `Import ${importPreview.length} Teacher${importPreview.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {/* Add / Edit Form */}
            {showForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="text-base font-bold text-gray-800 mb-4">
                  {editingTeacher ? `Edit — ${editingTeacher.name}` : 'Add New Staff Member'}
                </h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: 'Full Name *', key: 'name', placeholder: 'Jane Smith' },
                    { label: 'Email *', key: 'email', placeholder: 'jsmith@rjusd.org' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">PIN (optional)</label>
                    <input value={form.pin} onChange={e => setForm(prev => ({ ...prev, pin: e.target.value }))}
                      placeholder="4-digit PIN"
                      className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800" />
                    <p className="text-xs text-gray-400 mt-1">This is the staff member's login passcode for PassAble. Leave blank — it defaults to their room number doubled (Room 27 → 2727). They'll be prompted to change it on first login.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Room</label>
                    <input value={form.room} onChange={e => setForm(prev => ({ ...prev, room: e.target.value }))}
                      placeholder="27"
                      className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800" />
                    <p className="text-xs text-gray-400 mt-1">Use room number (e.g. 27). Traveling teachers: comma-separate rooms (e.g. gym-a, gym-b). Admin only: use admin.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
                    <select value={form.department || 'Other'} onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                      className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800">
                      <option value="Other">Other</option>
                      <option value="English / Language Arts">English / Language Arts</option>
                      <option value="Math">Math</option>
                      <option value="Science">Science</option>
                      <option value="Social Studies">Social Studies</option>
                      <option value="Physical Education">Physical Education</option>
                      <option value="CTE">CTE</option>
                      <option value="World Languages">World Languages</option>
                      <option value="Arts">Arts</option>
                      <option value="Special Programs">Special Programs</option>
                      <option value="Counseling">Counseling</option>
                      <option value="Administration">Administration</option>
                      <option value="Office">Office</option>
                      <option value="Library">Library</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 justify-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.is_admin} onChange={e => setForm(prev => ({ ...prev, is_admin: e.target.checked }))} />
                      Admin access
                    </label>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">Periods Taught</label>
                      <div className="grid grid-cols-7 gap-1">
                        {['1','2','3','4','5','6','7'].map(p => (
                          <label key={p} className="flex flex-col items-center gap-1 cursor-pointer">
                            <input type="checkbox"
                              checked={(form.periods || []).includes(p)}
                              onChange={e => {
                                const periods = form.periods || []
                                setForm(prev => ({ ...prev, periods: e.target.checked ? [...periods, p].sort() : periods.filter(x => x !== p) }))
                              }} />
                            <span className="text-xs text-gray-600">P{p}</span>
                          </label>
                        ))}
                      </div>
                      {(form.periods || []).length > 0 && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Kiosk Display Labels <span className="font-normal text-gray-400">(optional)</span></label>
                          <p className="text-xs text-gray-400 mb-2">Label fields appear for each selected period</p>
                          <div className="space-y-1.5">
                            {(form.periods || []).sort().map(p => (
                              <div key={p} className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-6">P{p}</span>
                                <input type="text" placeholder={`Period ${p}`}
                                  value={(form.period_labels || {})[p] || ''}
                                  onChange={e => setForm(prev => ({ ...prev, period_labels: { ...(prev.period_labels || {}), [p]: e.target.value } }))}
                                  className="flex-1 p-1.5 text-xs border rounded-lg bg-white text-gray-800 border-gray-200" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={handleCancelForm} className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {saving ? 'Saving...' : editingTeacher ? 'Save Changes' : 'Add Staff Member'}
                  </button>
                </div>
              </div>
            )}

            {/* Teacher List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Teachers ({teachers.length})</p>
                <p className="text-xs text-gray-400">Click a name to view pass log</p>
              </div>
              {teachersLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
              ) : sortedTeachers.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No teachers yet</div>
              ) : sortedTeachers.map((t) => {
                const stats = teacherStats[t.id] || { todayCount: 0, lastActive: null }
                const isDemo = isDemoTeacher(t)
                const passcodeState = settingPasscode[t.id]
                const isResetting = resettingPassword[t.id]
                return (
                  <div key={t.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                    style={{ opacity: t.is_active ? 1 : 0.5 }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: isDemo ? '#FEE2E2' : t.is_admin ? '#FEF3C7' : '#f0fdf4' }}>
                      {isDemo ? '🎬' : t.is_admin ? '⭐' : '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openTeacherLog(t)}
                          className="text-sm font-semibold hover:underline text-left"
                          style={{ color: RHS_GREEN }}>
                          {t.name}
                        </button>
                        {t.is_admin && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">ADMIN</span>}
                        {isDemo && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">DEMO</span>}
                        {!t.is_active && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full font-bold">INACTIVE</span>}
                        {!t.auth_id && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">NO ACCOUNT</span>}
                        {t.auth_id && t.must_change_password && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">NEEDS PW CHANGE</span>}
                        {stats.todayCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#dcfce7', color: RHS_GREEN }}>
                            {stats.todayCount} today
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{t.email}{t.room ? ` · Room ${t.room}` : ''}{t.department ? ` · ${t.department}` : ''}</span>
                        {!t.auth_id && t.room && (
                          <span className="text-gray-300">·</span>
                        )}
                        {!t.auth_id && t.room && (
                          <span className="text-gray-400">default passcode: {defaultPasscode(t.room)}</span>
                        )}
                        {stats.lastActive && <span className="text-gray-300">·</span>}
                        {stats.lastActive && <span className="text-gray-400">last active {formatLastActive(stats.lastActive)}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                      {isDemo && (
                        <button
                          onClick={() => handleDemoReset(t)}
                          disabled={resettingDemo}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                          style={{ background: '#FEE2E2', color: '#DC2626' }}>
                          {resettingDemo ? '...' : '🗑 Reset Demo'}
                        </button>
                      )}
                      {/* Passcode button: Set if no auth_id, Reset if auth_id exists */}
                      {!t.auth_id ? (
                        <button
                          onClick={() => handleSetPasscode(t)}
                          disabled={!!passcodeState}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                          style={{ background: passcodeState === 'sent' ? '#f0fdf4' : passcodeState === 'error' ? '#FEE2E2' : '#EFF6FF', color: passcodeState === 'sent' ? '#166534' : passcodeState === 'error' ? '#DC2626' : '#1D4ED8' }}>
                          {passcodeState === 'sending' ? 'Creating...' : passcodeState === 'sent' ? '✓ Done' : passcodeState === 'error' ? 'Failed' : '🔑 Set Passcode'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleResetPasscode(t)}
                          disabled={isResetting}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                          style={{ background: '#FEF3C7', color: '#92400E' }}>
                          {isResetting ? '...' : '↩️ Reset Passcode'}
                        </button>
                      )}
                      <button onClick={() => handleEdit(t)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                        Edit
                      </button>
                      <button onClick={() => handleToggleActive(t)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: t.is_active ? '#FEE2E2' : '#f0fdf4', color: t.is_active ? '#DC2626' : '#166534' }}>
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {/* Delete — only offered for deactivated teachers inactive 4+ years */}
                      {isEligibleForDeletion(t) && (
                        deleteConfirm === t.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDeleteTeacher(t)} disabled={deleting}
                              className="text-xs px-2 py-1.5 rounded-lg font-semibold bg-red-600 text-white disabled:opacity-50">
                              {deleting ? '...' : 'Confirm Delete'}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(t.id)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50"
                            title="Inactive for 4+ years — eligible for permanent removal">
                            🗑 Delete
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 px-4 py-3 bg-green-50 rounded-xl text-xs text-green-700">
              💡 After adding a teacher, click <strong>🔑 Set Passcode</strong> to create their login. Default passcode = room number doubled (Room 27 → <strong>2727</strong>). They'll be prompted to change it on first login. Use <strong>↩️ Reset Passcode</strong> if they forget it.
            </div>
          </>
        )}

        {/* ── CONFLICT GROUPS ── */}
        {activeTab === 'conflicts' && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              Students in the same group cannot be out at the same time. When a conflict is detected, the student is held and you are notified. You can override at any time.
            </div>
            {conflictAnalytics.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 mb-6">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Conflict Analytics</p>
                  <p className="text-xs text-gray-400">Based on pass history — simultaneous checkouts from same group</p>
                </div>
                {conflictAnalytics.map(a => (
                  <div key={a.group.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800">{a.group.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.conflicts > 0 ? 'bg-red-100 text-red-600' : 'bg-green-50 text-green-700'}`}>
                        {a.conflicts} conflict{a.conflicts !== 1 ? 's' : ''} detected
                      </span>
                    </div>
                    {a.members.length > 0 && (
                      <div className="grid grid-cols-2 gap-1">
                        {a.members.map(m => (
                          <div key={m.student_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1">
                            <span className="text-xs text-gray-700">{m.full_name}</span>
                            <span className="text-xs text-gray-400">{m.passCount} passes</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Create New Group</p>
              <div className="flex gap-2">
                <input placeholder="Group name (e.g. Period 1 Conflict A)" value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGroup()}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={addGroup} disabled={!newGroupName.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: RHS_GREEN }}>Create</button>
              </div>
              {groupMsg && <p className="text-xs text-green-600 mt-2">{groupMsg}</p>}
            </div>
            {groups.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No conflict groups yet. Create one above and add students to it.</div>
            ) : groups.map(group => {
              const members = groupMembers[group.id] || []
              const isExpanded = expandedGroup === group.id
              const isAddingHere = addingMember === group.id
              return (
                <div key={group.id} className="bg-white rounded-xl border border-gray-200 mb-4">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{group.name}</p>
                      <p className="text-xs text-gray-400">{members.length} student{members.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                        className="text-xs px-2.5 py-1 border rounded-lg text-gray-500 hover:bg-gray-50">
                        {isExpanded ? 'Collapse' : 'View Members'}
                      </button>
                      <button onClick={() => { setAddingMember(isAddingHere ? null : group.id); setMemberSearch('') }}
                        className="text-xs px-2.5 py-1 rounded-lg text-white" style={{ backgroundColor: RHS_GREEN }}>
                        + Add Student
                      </button>
                      <button onClick={() => deleteGroup(group.id, group.name)}
                        className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-400 hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                  {isAddingHere && (
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                      <input placeholder="Search student name..." value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)} autoFocus
                        className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                      {memberSearch && (
                        <div className="mt-2 space-y-1">
                          {memberSearchResults.length === 0 ? (
                            <p className="text-xs text-gray-400 py-1">No students found</p>
                          ) : memberSearchResults.map(s => (
                            <button key={s.id} onClick={() => addMember(group.id, s.id)}
                              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-green-50 text-gray-700">
                              {s.full_name}{s.grade ? <span className="text-xs text-gray-400"> (Gr {s.grade})</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {(isExpanded || isAddingHere) && members.length > 0 && (
                    <div>
                      {members.map(m => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-700">{m.students?.full_name}</span>
                          <button onClick={() => removeMember(m.id, group.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && members.length === 0 && (
                    <div className="px-4 py-4 text-center text-xs text-gray-400">No students in this group yet</div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── DO NOT LET OUT ── */}
        {activeTab === 'dnlo' && (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-800">
              Students on this list will be blocked from checking out at the kiosk and teacher page. Admin restrictions apply to all teachers school-wide.
            </div>
            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Add Student — Admin Restriction</p>
              <div className="flex flex-col gap-2">
                <input placeholder="Search student name..." value={dnloSearch} onChange={e => setDnloSearch(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                {dnloSearchResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {dnloSearchResults.map(s => (
                      <button key={s.id} onClick={() => { setDnloSearch(s.full_name); setDnloSearchResults([{ ...s, selected: true }]) }}
                        className="w-full text-left text-sm px-3 py-2 hover:bg-green-50 text-gray-700 border-b border-gray-50 last:border-0">
                        {s.full_name}{s.grade ? <span className="text-xs text-gray-400"> (Gr {s.grade})</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                <input placeholder="Reason (e.g. disciplinary, admin hold)" value={dnloReason} onChange={e => setDnloReason(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                {dnloSearchResults.length === 1 && dnloSearchResults[0].selected && (
                  <button onClick={() => addDnlo(dnloSearchResults[0].id, dnloSearchResults[0].full_name)}
                    className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700">
                    Add to Do Not Let Out
                  </button>
                )}
              </div>
              {dnloMsg && <p className="text-xs text-green-600 mt-2">{dnloMsg}</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Admin Restrictions ({dnloList.length})</p>
                {dnloList.length > 0 && <span className="text-xs text-red-600 font-medium">⛔ Blocks checkout school-wide</span>}
              </div>
              {dnloList.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No students on the Do Not Let Out list</div>
              ) : dnloList.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">⛔</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">{d.full_name}</div>
                    <div className="text-xs text-gray-400">{d.reason} · Added by {d.created_by}</div>
                  </div>
                  <button onClick={() => removeDnlo(d.id, d.full_name)}
                    className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-400 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── STUDENTS ── */}
        {activeTab === 'students' && (
          <>
            {/* ── Scheduling conflicts banner ── */}
            {scheduleConflicts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-600 text-lg">⚠️</span>
                  <p className="text-sm font-semibold text-amber-800">
                    {scheduleConflicts.length} Scheduling Conflict{scheduleConflicts.length !== 1 ? 's' : ''} — students enrolled in the same period by multiple teachers
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {scheduleConflicts.map((c, i) => (
                    <div key={i} className="bg-white border border-amber-100 rounded-lg px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                          <p className="text-xs text-amber-700 mt-0.5">Period {c.period} — enrolled in {c.rooms.length} rooms</p>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {c.rooms.map(({ room, teacherName }) => (
                              <div key={room} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                <span className="text-xs text-gray-700">Room {room} · {teacherName}</span>
                                <button
                                  onClick={() => removeFromRoom(c.student_id, c.period, room)}
                                  className="text-xs text-red-500 hover:text-red-700 font-medium ml-1"
                                  title={`Remove ${c.full_name} from Room ${room}`}>
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <input placeholder="Search students..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                className="w-full p-3 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students ({filteredStudents.length})</p>
                <div className="flex gap-3">
                  <a href="/qr" className="text-xs text-gray-400 hover:text-gray-600">Print QR Badges →</a>
                </div>
              </div>
              {filteredStudents.slice(0, 200).map(s => (
                <div key={s.id + (s.period || '')} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  {(photoUrls[s.id] || s.photo_url)
                    ? <img src={photoUrls[s.id] || s.photo_url} alt={s.full_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>
                        {s.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                      </div>
                  }
                  <div className="flex-1">
                    {/* no confirmed /student/[id] route — plain span instead of link */}
                    <span className="text-sm" style={{ color: RHS_GREEN }}>{s.full_name}</span>
                    {(() => {
                      const teacher = teacherByRoom[String(s._room)]
                      const teacherLast = teacher?.name?.split(' ').pop()
                      const parts = [s.period ? shortPeriod(s.period) : null, teacherLast].filter(Boolean)
                      return parts.length > 0 ? <div className="text-xs text-gray-400">{parts.join(' · ')}</div> : null
                    })()}
                  </div>
                </div>
              ))}
              {filteredStudents.length > 200 && (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">Showing 200 of {filteredStudents.length} — use search to narrow results</div>
              )}
            </div>
          </>
        )}

        {/* ── STUDENT LOCATOR ── */}
        {activeTab === 'locator' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Search any student to see their scheduled period and room — and whether they're currently on a pass.
            </p>

            <div className="relative mb-6">
              <input
                autoFocus
                type="search"
                placeholder="Search student by name…"
                value={locatorQuery}
                onChange={e => handleLocatorInput(e.target.value)}
                className="w-full p-3 text-sm border-2 rounded-xl bg-white text-gray-800 pr-10"
                style={{ borderColor: RHS_GREEN }}
              />
              {locatorLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
              )}
            </div>

            {/* Empty state */}
            {!locatorQuery && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-sm font-medium">Type a student's name above</p>
                <p className="text-xs mt-1 text-gray-300">Shows scheduled room and any active pass</p>
              </div>
            )}

            {/* No results */}
            {locatorQuery && !locatorLoading && locatorResults.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">No students match "{locatorQuery}"</div>
            )}

            {/* Results */}
            <div className="flex flex-col gap-3">
              {locatorResults.map(({ student: s, periods, activePasses: ap }) => {
                const photoSrc = photoUrls[s.id] || s.photo_url || null
                const hasActivePass = ap.length > 0

                return (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Student header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                      {photoSrc
                        ? <img src={photoSrc} alt={s.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>
                            {s.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{s.full_name}</div>
                        {hasActivePass ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-xs font-medium text-amber-700">Currently on a pass</span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 mt-0.5">In class</div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3 flex flex-col gap-3">
                      {/* Active pass */}
                      {ap.map(pass => {
                        const mins = Math.floor((Date.now() - new Date(pass.time_out).getTime()) / 60000)
                        return (
                          <div key={pass.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                            <div className="text-xs font-semibold text-amber-800 mb-1">🟡 On a Pass</div>
                            <div className="text-sm text-gray-800 font-medium">{pass.reason}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Left Rm {pass.room}{pass.teacher ? ` · ${pass.teacher.split(' ').pop()}` : ''} · {mins} min ago
                              {' · '}issued {new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        )
                      })}

                      {/* Schedule */}
                      {periods.length > 0 ? (
                        <div>
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Schedule</div>
                          <div className="flex flex-wrap gap-1.5">
                            {periods.map(p => (
                              <span key={p.period + p.room}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 font-medium">
                                P{p.period} · Rm {p.room}{p.teacher ? ` · ${p.teacher.split(' ').pop()}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic">No schedule on file</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── PASS LOG ── */}
        {activeTab === 'log' && (
          <>
            {/* Filter + actions row */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {LOG_FILTER_OPTIONS.map(opt => (
                <button key={opt.id}
                  onClick={() => { setLogFilter(opt.id); loadPasses(opt.id) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${logFilter === opt.id ? 'text-white border-transparent' : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'}`}
                  style={logFilter === opt.id ? { backgroundColor: RHS_GREEN } : {}}>
                  {opt.label}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button onClick={exportAdminCSV}
                  disabled={passes.length === 0}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  Export CSV
                </button>
                <button onClick={() => window.print()}
                  disabled={passes.length === 0}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  Print
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>
                  School-Wide Pass Log ({passes.length}{passes.length === 500 ? '+' : ''})
                </p>
                <p className="text-xs text-gray-400">All classrooms · {LOG_FILTER_OPTIONS.find(o => o.id === logFilter)?.label}</p>
              </div>
              {passes.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No passes found</div>
              ) : passes.map(p => {
                const isOut = !p.time_in
                const duration = p.duration_minutes != null ? `${p.duration_minutes}m` : isOut ? 'Out' : '—'
                const teacherLabel = p.teacherInfo
                  ? `${p.teacherInfo.name} · Rm ${p.teacherInfo.room}`
                  : p.teacher_id ? 'Teacher' : 'Kiosk'
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800">{p.students?.full_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {p.reason} · P{p.period} · {teacherLabel} · {new Date(p.time_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(p.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${p.time_in ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {duration}
                    </span>
                    {isOut && (
                      <button onClick={() => checkInPass(p.id)} disabled={checkingIn === p.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-40 flex-shrink-0"
                        style={{ backgroundColor: RHS_GREEN }}>
                        {checkingIn === p.id ? '...' : 'Check In'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {passes.length === 500 && (
              <p className="text-xs text-gray-400 text-center mt-2">Showing first 500 passes — narrow the date range to see all.</p>
            )}
          </>
        )}

        {/* ── SCHOOL SETTINGS ── */}
        {activeTab === 'settings' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-semibold text-gray-800">First & Last 15-Minute Rule</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Shows a warning on the kiosk during the first and last 15 minutes of each period.
                    Students can still check out — this is a reminder only.
                  </p>
                </div>
                <button
                  onClick={() => saveBlockFirstLast15(!blockFirstLast15)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${blockFirstLast15 ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blockFirstLast15 ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {schoolSettingsSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-800 mb-0.5">Global Schedule Override</p>
              <p className="text-xs text-gray-400 mb-3">
                Force a specific bell schedule for all teachers today. Clears automatically at midnight.
                Individual teachers can also set their own room-level override from their dashboard.
              </p>
              {globalOverrideActive && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}>
                  <span className="text-xs font-semibold" style={{ color: '#92400e' }}>⚠️ Active: {SCHEDULE_LABELS[globalOverrideActiveType] || globalOverrideActiveType}</span>
                  <button onClick={clearGlobalOverride} className="text-xs underline ml-2" style={{ color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear Override</button>
                </div>
              )}
              <div className="flex gap-2">
                <ScheduleSelectWithPreview
                  value={globalOverrideType}
                  onChange={setGlobalOverrideType}
                  labels={SCHEDULE_LABELS}
                />
                <button
                  onClick={saveGlobalOverride}
                  disabled={globalOverrideSaving}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40"
                  style={{ backgroundColor: RHS_GREEN }}
                >
                  {globalOverrideSaving ? 'Saving…' : 'Set for All Rooms'}
                </button>
              </div>
              {globalOverrideType === 'custom' && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Define custom periods:</p>
                  <div className="space-y-1.5">
                    {globalCustomPeriods.map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="text" value={p.label}
                          onChange={e => setGlobalCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                          placeholder="Label" className="p-1.5 text-xs border rounded-lg" style={{ width: 100 }} />
                        <input type="time" value={p.start}
                          onChange={e => setGlobalCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, start: e.target.value } : r))}
                          className="p-1.5 text-xs border rounded-lg" style={{ width: 96 }} />
                        <span className="text-xs text-gray-400">–</span>
                        <input type="time" value={p.end}
                          onChange={e => setGlobalCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, end: e.target.value } : r))}
                          className="p-1.5 text-xs border rounded-lg" style={{ width: 96 }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={p.break || false}
                            onChange={e => setGlobalCustomPeriods(prev => prev.map((r, j) => j === i ? { ...r, break: e.target.checked } : r))} />
                          Break
                        </label>
                        <button onClick={() => setGlobalCustomPeriods(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-400 text-xs" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setGlobalCustomPeriods(prev => [...prev, { id: String(Date.now()), label: '', start: '', end: '', break: false }])}
                    className="mt-2 text-xs underline" style={{ color: RHS_GREEN, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add period</button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Schedule is otherwise auto-detected from Google Calendar event titles (Minimum Day, Block Day, etc.).
              </p>
            </div>

            {/* ── Year-End Tools ── */}
            <div className="mt-6 rounded-xl border border-red-200 overflow-hidden">
              <div className="px-5 py-4 bg-red-50 border-b border-red-100">
                <p className="text-sm font-semibold text-red-700">🎓 End of Year Tools</p>
                <p className="text-xs text-red-500 mt-0.5">Run these once at the end of the school year. Export your pass log first, then clear what teachers didn't clean up.</p>
              </div>
              <div className="p-5 bg-white space-y-5">

                {yearEndMsg && (
                  <div className={`px-4 py-3 rounded-xl text-sm ${yearEndMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {yearEndMsg}
                  </div>
                )}

                {/* Step 1 — Export */}
                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5" style={{ backgroundColor: RHS_GREEN }}>1</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Export Full Year Pass Log</p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-3">Downloads every pass record from this school year as an Excel file — names, dates, rooms, durations, all joined and readable. Save this before clearing anything.</p>
                    <button
                      onClick={exportFullYearPassLog}
                      disabled={exportingPassLog}
                      className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
                      style={{ backgroundColor: RHS_GREEN }}>
                      {exportingPassLog ? 'Exporting…' : '📥 Download Pass Log (.xlsx)'}
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Step 2 — Clear rosters */}
                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-red-100 text-red-600 flex-shrink-0 mt-0.5">2</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Clear All Class Rosters</p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-3">Removes every student from every teacher's class list school-wide. Pass history is kept. Teachers re-import from Aeries at the start of next year.</p>
                    {yearEndConfirm === 'rosters' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-red-600 font-semibold">This clears rosters for every teacher in the school. Are you sure?</span>
                        <button onClick={yearEndClearRosters} disabled={yearEndWorking}
                          className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50">
                          {yearEndWorking ? 'Clearing…' : 'Yes, clear all rosters'}
                        </button>
                        <button onClick={() => setYearEndConfirm(null)}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setYearEndConfirm('rosters')}
                        className="text-xs px-3 py-1.5 border-2 border-red-400 text-red-600 font-semibold rounded-xl hover:bg-red-50">
                        Clear All Rosters
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Step 3 — Clear DNLO */}
                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-red-100 text-red-600 flex-shrink-0 mt-0.5">3</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Clear Do Not Let Out List</p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-3">Removes all active DNLO restrictions. These don't carry over year to year — a fresh start for all students.</p>
                    {yearEndConfirm === 'dnlo' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-red-600 font-semibold">Remove all active DNLO entries?</span>
                        <button onClick={yearEndClearDnlo} disabled={yearEndWorking}
                          className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50">
                          {yearEndWorking ? 'Clearing…' : 'Yes, clear DNLO list'}
                        </button>
                        <button onClick={() => setYearEndConfirm(null)}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setYearEndConfirm('dnlo')}
                        className="text-xs px-3 py-1.5 border-2 border-red-400 text-red-600 font-semibold rounded-xl hover:bg-red-50">
                        Clear DNLO List
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </>
        )}

      </div>
    </div>
  )
}
