/*
  PassAble — RHS Hall Pass System
  FILE:    app/roster/page.jsx
  ROUTE:   /roster
  PURPOSE: Teacher-scoped student roster management. Add, edit, remove, and move
           students between periods. Period membership sourced from student_periods
           table (not students.period). Supports manual photo upload.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, student_periods)
  STORAGE: student-photos bucket (numeric Lifetouch ID filenames e.g. 801888.jpg)
  UPDATED: 2026-06-23 — added file header; reverted photo bucket to student-photos
           in getPhotoUrl, getStorageUrl, and handlePhotoUpload;
           removed dead /student/[id] link (no confirmed route)
*/
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'

const DEFAULT_PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function StudentsAdmin() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [periods, setPeriods] = useState(DEFAULT_PERIODS)
  const [room, setRoom] = useState('27')

  const [activePeriod, setActivePeriod] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [notAuthed, setNotAuthed] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [addPeriod, setAddPeriod] = useState(null)
  const [addId, setAddId] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editDisplay, setEditDisplay] = useState('')
  const [editId, setEditId] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoUrls, setPhotoUrls] = useState({})
  const photoRef = useRef()

  // ── Import ────────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('manage') // 'manage' | 'import'
  const [importPreview, setImportPreview] = useState([])
  const [importPeriod, setImportPeriod] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [importParseError, setImportParseError] = useState('')
  const [detectedMeta, setDetectedMeta] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showImportHelp, setShowImportHelp] = useState(false)
  const [currentRoster, setCurrentRoster] = useState([])
  const [allRoomPeriods, setAllRoomPeriods] = useState({}) // { student_id: period } for entire room
  const [removeSelected, setRemoveSelected] = useState(new Set())
  const [roomMismatch, setRoomMismatch] = useState(null) // { detectedRoom, detectedTeacher }
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(null) // null | 'period-X' | 'all'
  const [clearing, setClearing] = useState(false)
  const [crossTeacherConflicts, setCrossTeacherConflicts] = useState([]) // [{ student_id, full_name, otherRoom, otherTeacherName }]
  const importFileRef = useRef()

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

  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setNotAuthed(true); return }
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (data) {
        setCurrentTeacher(data)
        const teacherRoom = data.room || '27'
        setRoom(teacherRoom)
        if (data.periods?.length) {
          const sorted = [...data.periods].sort()
          const builtPeriods = sorted.map(p => ({
            value: p,
            label: data.period_labels?.[p] || `Period ${p}`,
          }))
          setPeriods(builtPeriods)
          setActivePeriod(sorted[0])
          setAddPeriod(sorted[0])
        } else {
          setActivePeriod('1')
          setAddPeriod('1')
        }
      }
    }
    loadTeacher()
  }, [])

  useEffect(() => {
    if (activePeriod && room) loadStudents()
  }, [activePeriod, room])

  async function loadStudents() {
    setLoading(true)
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('period', activePeriod)
      .eq('room', room)
    const studentIds = spRows?.map(r => r.student_id) || []
    if (studentIds.length === 0) {
      setStudents([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name, period, nfc_uid, photo_file, photo_url')
      .in('id', studentIds)
      .order('first_name')
    if (data) { setStudents(data); loadSignedPhotoUrls(data) }
    setLoading(false)
  }

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

  function getPhotoUrl(student) {
    // photo_url is a direct URL; storage photos now use signed URLs from photoUrls map
    return student.photo_url || null
  }

  async function addStudent() {
    if (!firstName.trim() || !lastName.trim()) return
    setAdding(true)
    const full_name = `${firstName.trim()} ${lastName.trim()}`
    const id = addId.trim() || `NEW${Date.now()}`
    const { error } = await supabase.from('students').insert({
      id, first_name: firstName.trim(), last_name: lastName.trim(),
      full_name, period: addPeriod
    })
    if (!error) {
      await supabase.from('student_periods').insert({
        student_id: id, period: addPeriod, room
      })
      setFirstName(''); setLastName(''); setAddId('')
      if (addPeriod === activePeriod) loadStudents()
    }
    setAdding(false)
  }

  async function removeStudent(studentId) {
    await supabase.from('student_periods')
      .delete()
      .eq('student_id', studentId)
      .eq('period', activePeriod)
      .eq('room', room)
    const { data: remaining } = await supabase
      .from('student_periods')
      .select('id')
      .eq('student_id', studentId)
    if (!remaining || remaining.length === 0) {
      await supabase.from('students').delete().eq('id', studentId)
    }
    setConfirmDelete(null)
    loadStudents()
  }

  async function clearPeriod(periodValue) {
    setClearing(true)
    await supabase.from('student_periods').delete().eq('room', room).eq('period', periodValue)
    setClearConfirm(null)
    setClearing(false)
    loadStudents()
  }

  async function clearAllPeriods() {
    setClearing(true)
    await supabase.from('student_periods').delete().eq('room', room)
    setClearConfirm(null)
    setClearing(false)
    loadStudents()
  }

  async function movePeriod(studentId, newPeriod) {
    const { data: existing } = await supabase
      .from('student_periods')
      .select('id')
      .eq('student_id', studentId)
      .eq('period', activePeriod)
      .eq('room', room)
      .maybeSingle()
    if (existing) {
      await supabase.from('student_periods')
        .update({ period: newPeriod })
        .eq('id', existing.id)
    } else {
      await supabase.from('student_periods').insert({
        student_id: studentId, period: newPeriod, room
      })
    }
    await supabase.from('students').update({ period: newPeriod }).eq('id', studentId)
    loadStudents()
  }

  async function openEdit(s) {
    setEditStudent(s)
    setEditFirst(s.first_name || '')
    setEditLast(s.last_name || '')
    setEditDisplay(s.full_name || '')
    setEditId('')
    if (s.photo_url) {
      setPhotoUrl(s.photo_url)
    } else if (s.photo_file) {
      const { data } = await supabase.storage.from('student-photos').createSignedUrl(s.photo_file, 3600)
      setPhotoUrl(data?.signedUrl || null)
    } else {
      setPhotoUrl(null)
    }
  }

  async function saveEdit() {
    if (!editStudent) return
    setSaving(true)
    const full_name = editDisplay.trim() || `${editFirst.trim()} ${editLast.trim()}`
    const newId = editId.trim()
    if (newId && newId !== editStudent.id) {
      let photoFile = editStudent.photo_file || null
      if (photoFile && photoFile.startsWith(editStudent.id)) {
        photoFile = newId + '.jpg'
      }
      await supabase.from('students').insert({
        id: newId,
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        full_name,
        period: editStudent.period,
        nfc_uid: editStudent.nfc_uid || null,
        photo_file: photoFile,
        photo_url: editStudent.photo_url || null,
      })
      const { data: oldPeriods } = await supabase
        .from('student_periods')
        .select('period, room')
        .eq('student_id', editStudent.id)
      if (oldPeriods && oldPeriods.length > 0) {
        await supabase.from('student_periods').insert(
          oldPeriods.map(p => ({ student_id: newId, period: p.period, room: p.room }))
        )
      }
      await supabase.from('student_periods').delete().eq('student_id', editStudent.id)
      await supabase.from('students').delete().eq('id', editStudent.id)
    } else {
      await supabase.from('students').update({
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        full_name,
      }).eq('id', editStudent.id)
    }
    setSaving(false)
    setEditStudent(null)
    loadStudents()
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file || !editStudent) return
    setPhotoUploading(true)
    const path = `${editStudent.id}.jpg`
    // Upload to student-photos bucket
    const { error: uploadError } = await supabase.storage
      .from('student-photos')
      .upload(path, file, { upsert: true, contentType: 'image/jpeg' })
    if (!uploadError) {
      await supabase.from('students').update({ photo_file: path }).eq('id', editStudent.id)
      // Get signed URL for immediate display (private bucket)
      const { data } = await supabase.storage.from('student-photos').createSignedUrl(path, 3600)
      setPhotoUrl(data?.signedUrl || null)
      setEditStudent(prev => ({ ...prev, photo_file: path }))
    }
    setPhotoUploading(false)
  }

  // ── Aeries xlsx parser ────────────────────────────────────────────────────
  function parseAeriesXlsx(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
          // Row index 2: Period (col 0), Teacher (col 15), Room (col 27)
          const classRow = rows[2] || []
          const detectedPeriod = String(classRow[0] || '').trim()
          const detectedTeacher = String(classRow[15] || '').trim()
          const detectedRoom = String(classRow[27] || '').trim()
          // Student rows start at index 5; col B = Student ID, col E = Name, col L = Grade
          const students = []
          for (let i = 5; i < rows.length; i++) {
            const row = rows[i]
            if (!row) continue
            const studentId = String(row[1] || '').trim()
            const aeriesName = String(row[4] || '').trim()
            const grade = String(row[11] || '').trim()
            if (!studentId || !aeriesName || !/^\d+$/.test(studentId)) continue
            // Parse "Last, First MI" → first, last, full_name ("First MI Last")
            const commaIdx = aeriesName.indexOf(',')
            let first, last, full_name
            if (commaIdx === -1) {
              first = aeriesName; last = ''; full_name = aeriesName
            } else {
              last = aeriesName.slice(0, commaIdx).trim()
              first = aeriesName.slice(commaIdx + 1).trim()
              full_name = `${first} ${last}`
            }
            students.push({ id: studentId, first, last, full_name, grade, aeriesName })
          }
          resolve({ students, detectedPeriod, detectedTeacher, detectedRoom })
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function fetchCurrentRoster(period) {
    if (!period || !room) return
    // Fetch the target period's roster
    const { data: spRows } = await supabase
      .from('student_periods').select('student_id').eq('period', period).eq('room', room)
    const ids = spRows?.map(r => r.student_id) || []
    if (ids.length === 0) { setCurrentRoster([]); }
    else {
      const { data: studs } = await supabase
        .from('students').select('id, full_name').in('id', ids)
      setCurrentRoster(studs || [])
    }
    // Also fetch ALL period assignments for this room so we can detect moved/multi-period students
    const { data: allRows } = await supabase
      .from('student_periods').select('student_id, period').eq('room', room)
    const periodMap = {}
    if (allRows) allRows.forEach(r => {
      if (!periodMap[r.student_id]) periodMap[r.student_id] = []
      if (!periodMap[r.student_id].includes(r.period)) periodMap[r.student_id].push(r.period)
    })
    setAllRoomPeriods(periodMap)
  }

  async function processImportFile(file) {
    if (!file) return
    setImportParseError(''); setImportResults(null); setImportPreview([])
    setRemoveSelected(new Set()); setRoomMismatch(null); setMismatchConfirmed(false); setCrossTeacherConflicts([])
    try {
      const { students, detectedPeriod, detectedTeacher, detectedRoom } = await parseAeriesXlsx(file)
      setImportPreview(students)
      setDetectedMeta({ period: detectedPeriod, teacher: detectedTeacher, room: detectedRoom })
      // Check if the file's room matches the logged-in teacher's room
      if (detectedRoom && String(detectedRoom).trim() !== String(room).trim()) {
        setRoomMismatch({ detectedRoom, detectedTeacher })
      }
      // Auto-select the period that matches the detected period from the file
      // e.g. detectedPeriod=5 should match teacher period "4&5" or "5"
      let matchedPeriod = null
      if (detectedPeriod && periods.length > 0) {
        const dp = String(detectedPeriod).trim()
        const exact = periods.find(p => String(p.value).trim() === dp)
        const contained = !exact && periods.find(p =>
          String(p.value).split(/[&,]/).map(s => s.trim()).includes(dp)
        )
        matchedPeriod = exact?.value || contained?.value || null
      }
      const targetPeriod = matchedPeriod || importPeriod || (periods.length > 0 ? periods[0].value : null)
      if (targetPeriod) setImportPeriod(targetPeriod)
      if (targetPeriod) await fetchCurrentRoster(targetPeriod)

      // Check for cross-teacher conflicts: students in this file already claimed
      // by a different teacher/room in the same period
      if (targetPeriod && students.length > 0) {
        const studentIds = students.map(s => s.id)
        const { data: conflictRows } = await supabase
          .from('student_periods')
          .select('student_id, room')
          .in('student_id', studentIds)
          .eq('period', targetPeriod)
          .neq('room', room)
        if (conflictRows && conflictRows.length > 0) {
          const conflictRooms = [...new Set(conflictRows.map(r => r.room))]
          const { data: tchrs } = await supabase.from('teachers').select('name, room').in('room', conflictRooms)
          const teacherByRoom = {}
          if (tchrs) tchrs.forEach(t => { teacherByRoom[String(t.room)] = t.name })
          setCrossTeacherConflicts(conflictRows.map(r => {
            const student = students.find(s => s.id === r.student_id)
            return {
              student_id: r.student_id,
              full_name: student?.full_name || 'Unknown',
              otherRoom: r.room,
              otherTeacherName: teacherByRoom[String(r.room)] || `Room ${r.room}`,
            }
          }))
        } else {
          setCrossTeacherConflicts([])
        }
      }
    } catch {
      setImportParseError('Could not read this file. Make sure it is an Aeries Class Roster .xlsx export.')
    }
  }

  function handleImportFile(e) {
    if (e.target.files.length > 1) {
      setImportParseError('One file at a time only. Each period needs its own import — drag one .xlsx file, sync it, then move to the next period.')
      e.target.value = ''
      return
    }
    processImportFile(e.target.files[0])
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length > 1) {
      setImportParseError(`You dropped ${e.dataTransfer.files.length} files. Import one period at a time — drag a single .xlsx file for each class period.`)
      return
    }
    const file = e.dataTransfer.files[0]
    if (file) processImportFile(file)
  }

  function toggleRemove(id) {
    setRemoveSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleImport() {
    if (!importPreview.length || !importPeriod) return
    setImportLoading(true)
    let added = 0, updated = 0, removed = 0, dupsRemoved = 0
    const errors = []

    // 1. Sync all students from Aeries file (corrects names to Aeries spelling)
    // Batch-fetch which IDs already exist so we can insert vs. update appropriately.
    // (Upsert with onConflict:'id' requires a UNIQUE constraint — using select+insert/update instead.)
    const allImportIds = importPreview.map(s => s.id)
    const { data: existingStudentRows } = await supabase
      .from('students').select('id').in('id', allImportIds)
    const existingIdSet = new Set((existingStudentRows || []).map(s => s.id))

    for (const student of importPreview) {
      let sErr = null
      if (existingIdSet.has(student.id)) {
        const { error } = await supabase.from('students').update({
          first_name: student.first,
          last_name: student.last,
          full_name: student.full_name,
          grade: student.grade || null,
          period: importPeriod,
        }).eq('id', student.id)
        sErr = error
      } else {
        const { error } = await supabase.from('students').insert({
          id: student.id,
          first_name: student.first,
          last_name: student.last,
          full_name: student.full_name,
          grade: student.grade || null,
          period: importPeriod,
        })
        sErr = error
      }
      if (sErr) { errors.push(`${student.full_name}: ${sErr.message}`); continue }

      // Add to student_periods if not already in this specific period
      // IMPORTANT: filter by period so multi-period students (e.g. student aids)
      // don't get their other period enrollments wiped during deduplication
      const { data: periodSp } = await supabase.from('student_periods')
        .select('id').eq('student_id', student.id).eq('room', room).eq('period', importPeriod)
      if (!periodSp || periodSp.length === 0) {
        await supabase.from('student_periods').insert({ student_id: student.id, period: importPeriod, room })
        added++
      } else {
        // Deduplicate within this period only — other period enrollments are untouched
        if (periodSp.length > 1) {
          const idsToDelete = periodSp.slice(1).map(r => r.id)
          await supabase.from('student_periods').delete().in('id', idsToDelete)
          dupsRemoved += idsToDelete.length
        }
        updated++
      }
    }

    // 2. Remove students checked for removal (not on Aeries list)
    for (const id of removeSelected) {
      await supabase.from('student_periods')
        .delete().eq('student_id', id).eq('room', room).eq('period', importPeriod)
      removed++
    }

    setImportResults({ added, updated, removed, dupsRemoved, errors })
    setImportLoading(false)
    if (errors.length === 0) {
      setImportPreview([]); setDetectedMeta(null); setCurrentRoster([]); setRemoveSelected(new Set())
      if (importFileRef.current) importFileRef.current.value = ''
      setActivePeriod(importPeriod)
      setTimeout(() => { setActiveView('manage'); loadStudents() }, 1800)
    }
  }

  const teacherName = currentTeacher?.name || 'Loading...'

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  const ROSTER_HELP = [
    { title: 'Importing from Aeries', items: [
      { q: 'How do I export a class roster from Aeries?', a: 'In Aeries, go to Reports → Print Class Rosters. Select one class/period only, then click Export to Excel. This saves a .xlsx file. Repeat for each period — 6 periods means 6 separate exports.' },
      { q: 'Why one file per period?', a: 'Each Aeries export is tied to one period and room. If you export multiple classes together, PassAble can\'t tell which student belongs to which period and will assign everyone to the wrong one.' },
      { q: 'What does the sync preview show?', a: <>The preview has three sections: <strong>🟢 New</strong> — in Aeries, not yet in PassAble, will be added. <strong>⚫ Already in class</strong> — in both, names will be corrected to match Aeries spelling. <strong>🔴 Not on Aeries list</strong> — in PassAble but not in this export, may have transferred — check the box to remove them. Nothing is deleted until you click Sync Roster.</> },
      { q: 'What does "Sync Roster" actually do?', a: 'It adds new students, corrects name spellings for existing students to match Aeries exactly, removes anyone you checked off, and deduplicates any student who appears more than once in your roster for the same period.' },
      { q: 'I uploaded the wrong file. What happens?', a: 'If the file is for a different room, a red warning appears and the sync is blocked. Click "Cancel — pick a different file" to start over. Nothing is changed until you click Sync Roster.' },
    ]},
    { title: 'Managing Students', items: [
      { q: 'How do I add a student manually?', a: 'In the Manage Students tab, use the Add Student form at the top. Enter first name, last name, and optionally their Aeries student ID (6 digits). Select the period and click Add. If you leave the ID blank, one is auto-generated.' },
      { q: 'How do I fix a student\'s name?', a: 'Click Edit next to the student\'s name. You can update first name, last name, or student ID. If you re-import from Aeries later, names will be corrected automatically to match the Aeries spelling.' },
      { q: 'How do I move a student to a different period?', a: 'Click the period dropdown next to their name and select the new period. The change saves immediately.' },
      { q: 'How do I remove a student from my class?', a: 'Click Remove next to their name. This removes them from your roster only — it does not delete their record from the system.' },
      { q: 'What does NFC mean next to a student\'s name?', a: 'NFC means the student has been assigned an NFC card. They can tap their card at the kiosk instead of searching for their name.' },
    ]},
    { title: 'Photos', items: [
      { q: 'How do student photos get added?', a: 'Your admin imports the Lifetouch photo batch for the whole school. After they do that, click Match the Photos from your dashboard to pull in photos for your class specifically.' },
      { q: 'A student\'s photo is missing after matching.', a: "Usually means the name in the Lifetouch file doesn't match the name in PassAble. Contact your admin — they can check the photo filename and fix the mismatch. You can also add a photo manually by clicking Edit next to the student's name." },
      { q: 'Can I upload a photo for one student?', a: 'Yes. Click Edit next to their name, then use the photo upload option. Accepts JPG or PNG.' },
    ]},
    { title: 'Feedback & Feature Requests', items: [
      { q: 'Something isn\'t working or I want to suggest a change.', a: <a href="mailto:ejoe@rjusd.org" style={{color:RHS_GREEN,textDecoration:'underline'}}>ejoe@rjusd.org</a> },
    ]},
  ]

  if (notAuthed) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-gray-500">You need to be signed in to view this page.</p>
      <a href="/teacher" className="text-sm font-medium text-green-700 hover:underline">← Go to Teacher Login</a>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Help Panel (draggable + searchable) ── */}
      {showHelp && (() => {
        const q = helpSearch.trim().toLowerCase()
        const filtered = q
          ? ROSTER_HELP.map(s => ({ ...s, items: s.items.filter(i => (s.title + ' ' + i.q).toLowerCase().includes(q)) })).filter(s => s.items.length > 0)
          : ROSTER_HELP
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
            }}>
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl select-none"
              style={{ cursor: 'grab', backgroundColor: '#f9fafb' }}
              onMouseDown={startHelpDrag}>
              <div className="flex items-center gap-2">
                <span className="text-gray-300 text-sm">⠿</span>
                <p className="text-sm font-bold text-gray-800">Student Roster Help</p>
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
                autoComplete="off" />
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

      {/* Edit Modal */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Edit Student</h2>
                <p className="text-xs text-gray-400">ID: {editStudent.id}</p>
              </div>
              <button onClick={() => setEditStudent(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {editStudent.id?.startsWith('NEW') && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="text-xs text-amber-700 font-medium mb-1 block">⚠ Set Aeries Student ID</label>
                <input type="text" placeholder="6-digit Aeries ID"
                  value={editId} onChange={e => setEditId(e.target.value)}
                  maxLength={6}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: '#f59e0b' }} />
                <p className="text-xs text-amber-600 mt-1">This will replace the auto-generated ID. Enter the student's real Aeries ID.</p>
              </div>
            )}

            {/* Photo */}
            <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                {photoUrl
                  ? <img src={photoUrl} alt={editStudent.full_name} className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-gray-400">
                      {editStudent.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </span>
                }
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={photoUploading}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: RHS_GREEN }}>
                  {photoUploading ? 'Uploading...' : photoUrl ? 'Replace Photo' : 'Add Photo'}
                </button>
                <p className="text-xs text-gray-400">JPG only</p>
                <input ref={photoRef} type="file" accept=".jpg,.jpeg" className="hidden" onChange={handlePhotoUpload} />
              </div>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">First Name</label>
                <input type="text" value={editFirst} onChange={e => setEditFirst(e.target.value)}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Last Name</label>
                <input type="text" value={editLast} onChange={e => setEditLast(e.target.value)}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Display Name <span className="text-gray-400 font-normal">(what shows on passes)</span></label>
                <input type="text" value={editDisplay} onChange={e => setEditDisplay(e.target.value)}
                  placeholder={`${editFirst} ${editLast}`}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }} />
                <p className="text-xs text-gray-400 mt-1">Leave as-is or type a preferred name</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30"
                style={{ backgroundColor: RHS_GREEN }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditStudent(null)}
                className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Manage &amp; Import Students</h1>
            <p className="text-green-200 text-xs">Room {room} · {teacherName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setShowHelp(v => !v); setHelpSearch(''); setHelpPos({ x: null, y: null }) }} className="text-sm text-green-200 hover:text-white">❓ Help</button>
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {/* View Switcher */}
        <div className="flex items-center gap-2 mb-6">
          {[{ id: 'manage', label: 'Manage Students' }, { id: 'import', label: '📥 Import from Aeries' }].map(v => (
            <button key={v.id} onClick={() => { setActiveView(v.id); setImportResults(null); setImportPreview([]); setImportParseError(''); if (importFileRef.current) importFileRef.current.value = '' }}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
              style={activeView === v.id
                ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
                : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
              {v.label}
            </button>
          ))}
          <a href="/teacher/match-photos"
            className="ml-auto px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
            📷 Match Photos
          </a>
        </div>

        {/* ── IMPORT VIEW ── */}
        {activeView === 'import' && (
          <div className="space-y-4">

            {/* ⚠ One class per file warning */}
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-3 items-start">
              <span className="text-red-500 text-lg mt-0.5 flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-700">One class per file — do not combine classes</p>
                <p className="text-xs text-red-600 mt-0.5">
                  In Aeries, export each period separately. If you teach 6 periods, that means 6 exports and 6 imports — one at a time. Importing a file with multiple classes will cause students to be assigned to the wrong period.
                </p>
              </div>
            </div>

            {/* Help link */}
            <button
              onClick={() => { setShowHelp(true); setHelpSearch('import'); setHelpPos({ x: null, y: null }) }}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5">
              ❓ How this works
            </button>

            {/* Drop zone */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Upload Aeries Class Roster (.xlsx)</h2>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => importFileRef.current?.click()}
                className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 cursor-pointer transition-colors"
                style={{
                  borderColor: isDragging ? RHS_GREEN : '#d1d5db',
                  backgroundColor: isDragging ? '#f0fdf4' : '#fafafa',
                }}>
                <span className="text-3xl mb-2">📂</span>
                <p className="text-sm font-medium text-gray-700">
                  {isDragging ? 'Drop to upload' : 'Drag & drop your .xlsx file here'}
                </p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input ref={importFileRef} type="file" accept=".xlsx,.xls"
                  onChange={handleImportFile} className="hidden" />
              </div>
              {importParseError && (
                <p className="text-xs text-red-600 mt-3">⚠ {importParseError}</p>
              )}
            </div>

            {detectedMeta && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-xs text-gray-600 flex gap-6">
                <span>📋 <strong>Detected Period:</strong> {detectedMeta.period || '—'}</span>
                <span>👤 <strong>Teacher:</strong> {detectedMeta.teacher || '—'}</span>
                <span>🚪 <strong>Room:</strong> {detectedMeta.room || '—'}</span>
              </div>
            )}

            {/* ⚠ Room mismatch warning */}
            {roomMismatch && !mismatchConfirmed && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                <div className="flex gap-3 items-start mb-3">
                  <span className="text-2xl flex-shrink-0">🚫</span>
                  <div>
                    <p className="text-sm font-bold text-red-700">Wrong class file</p>
                    <p className="text-xs text-red-600 mt-1">
                      This file is for <strong>Room {roomMismatch.detectedRoom} ({roomMismatch.detectedTeacher})</strong> — but you're logged in as <strong>Room {room} ({teacherName})</strong>.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      Importing this will add {roomMismatch.detectedTeacher}'s students to your class list. Make sure you exported the right period from Aeries.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setImportPreview([]); setDetectedMeta(null); setRoomMismatch(null); if (importFileRef.current) importFileRef.current.value = '' }}
                    className="flex-1 py-2 text-sm font-semibold rounded-xl border-2 border-red-300 text-red-600 bg-white hover:bg-red-50">
                    Cancel — pick a different file
                  </button>
                  <button
                    onClick={() => setMismatchConfirmed(true)}
                    className="px-4 py-2 text-xs text-red-500 hover:underline">
                    Import anyway
                  </button>
                </div>
              </div>
            )}

            {importPreview.length > 0 && (mismatchConfirmed || !roomMismatch) && (() => {
              const importIds = new Set(importPreview.map(s => s.id))
              const currentIds = new Set(currentRoster.map(s => s.id))
              const newStudents = importPreview.filter(s => !currentIds.has(s.id))
              const existingStudents = importPreview.filter(s => currentIds.has(s.id))
              const missingStudents = currentRoster.filter(s => !importIds.has(s.id))
              return (
                <div className="space-y-3">
                  {/* File summary — no manual period selector, period is detected from file */}
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{importPreview.length} students in this file</p>
                    {importPeriod && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: '#f0fdf4', color: RHS_GREEN }}>
                        → {periods.find(p => p.value === importPeriod)?.label || `Period ${importPeriod}`}
                      </div>
                    )}
                  </div>

                  {/* Cross-teacher conflict warning */}
                  {crossTeacherConflicts.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-orange-500">⚠️</span>
                        <p className="text-sm font-semibold text-orange-800">
                          {crossTeacherConflicts.length} student{crossTeacherConflicts.length !== 1 ? 's' : ''} already enrolled in this period by another teacher
                        </p>
                      </div>
                      <p className="text-xs text-orange-700 mb-3">These students will be added to your roster, but they'll also remain on the other teacher's roster until resolved. The admin dashboard will flag this as a scheduling conflict.</p>
                      <div className="flex flex-col gap-1.5">
                        {crossTeacherConflicts.map(c => (
                          <div key={c.student_id} className="flex items-center justify-between bg-white border border-orange-100 rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-800">{c.full_name}</span>
                            <span className="text-xs text-orange-600">Also in Room {c.otherRoom} · {c.otherTeacherName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New students to add */}
                  {newStudents.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <p className="text-xs font-semibold text-gray-700">{newStudents.length} new — will be added</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {newStudents.map((s, i) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
                            <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                            <span className="text-xs font-mono text-gray-400 w-16">{s.id}</span>
                            <span className="text-sm text-gray-800 flex-1">{s.full_name}</span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f0fdf4', color: RHS_GREEN }}>
                              {periods.find(p => p.value === importPeriod)?.label || `P${importPeriod}`}
                            </span>
                            <span className="text-xs text-gray-400">Gr {s.grade || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Already in class — names will sync */}
                  {existingStudents.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                        <p className="text-xs font-semibold text-gray-700">{existingStudents.length} already in class — names will sync to Aeries spelling</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {existingStudents.map((s, i) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 opacity-60">
                            <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                            <span className="text-xs font-mono text-gray-400 w-16">{s.id}</span>
                            <span className="text-sm text-gray-600 flex-1">{s.full_name}</span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {periods.find(p => p.value === importPeriod)?.label || `P${importPeriod}`}
                            </span>
                            <span className="text-xs text-gray-400">Gr {s.grade || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing from Aeries — likely dropped/transferred */}
                  {missingStudents.length > 0 && (
                    <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-red-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                          <p className="text-xs font-semibold text-gray-700">{missingStudents.length} in PassAble but NOT on this Aeries export</p>
                        </div>
                        <button onClick={() => {
                          const allIds = new Set(missingStudents.map(s => s.id))
                          setRemoveSelected(prev => prev.size === missingStudents.length ? new Set() : allIds)
                        }} className="text-xs text-red-500 hover:underline">
                          {removeSelected.size === missingStudents.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <p className="px-4 pt-2 text-xs text-gray-500">These students may have transferred or dropped. Check the box to remove them from this period.</p>
                      <div className="max-h-48 overflow-y-auto mt-1">
                        {missingStudents.map(s => {
                          // allRoomPeriods[s.id] is now an array of all periods this student is in
                          const studentPeriods = allRoomPeriods[s.id] || []
                          const otherPeriods = studentPeriods.filter(p => p !== importPeriod)
                          const isInOtherPeriods = otherPeriods.length > 0
                          const otherPeriodLabels = otherPeriods
                            .map(p => periods.find(pp => pp.value === p)?.label || `Period ${p}`)
                            .join(', ')
                          return (
                            <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
                              <input type="checkbox" checked={removeSelected.has(s.id)} onChange={() => toggleRemove(s.id)}
                                className="rounded" />
                              <span className="text-xs font-mono text-gray-400 w-16">{s.id}</span>
                              <span className={`text-sm flex-1 ${removeSelected.has(s.id) ? 'line-through text-gray-400' : 'text-gray-800'}`}>{s.full_name}</span>
                              {isInOtherPeriods ? (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                  Also in {otherPeriodLabels}
                                </span>
                              ) : (
                                <span className="text-xs text-red-400">Not on list</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {removeSelected.size > 0 ? `${removeSelected.size} student${removeSelected.size !== 1 ? 's' : ''} will be removed` : 'No removals selected'}
                    </p>
                    <button onClick={handleImport} disabled={importLoading || !importPeriod}
                      className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-40"
                      style={{ backgroundColor: RHS_GREEN }}>
                      {importLoading ? 'Syncing...' : `Sync Roster`}
                    </button>
                  </div>
                </div>
              )
            })()}

            {importResults && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${importResults.errors.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                {importResults.errors.length === 0 ? (
                  <div className="text-green-700 space-y-0.5">
                    <p className="font-medium">✅ Roster synced</p>
                    {importResults.added > 0 && <p className="text-xs">{importResults.added} student{importResults.added !== 1 ? 's' : ''} added</p>}
                    {importResults.updated > 0 && <p className="text-xs">{importResults.updated} name{importResults.updated !== 1 ? 's' : ''} synced to Aeries spelling</p>}
                    {importResults.removed > 0 && <p className="text-xs">{importResults.removed} student{importResults.removed !== 1 ? 's' : ''} removed</p>}
                    {importResults.dupsRemoved > 0 && <p className="text-xs">{importResults.dupsRemoved} duplicate entr{importResults.dupsRemoved !== 1 ? 'ies' : 'y'} cleaned up</p>}
                    <p className="text-xs text-green-600 mt-1">Switching to Manage view…</p>
                  </div>
                ) : (
                  <>
                    <p className="text-amber-800 font-medium mb-2">⚠ Completed with {importResults.errors.length} error{importResults.errors.length !== 1 ? 's' : ''}:</p>
                    {importResults.errors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MANAGE VIEW ── */}
        {activeView === 'manage' && <>

        {/* Add Student */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
          <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Add Student</p>
          <div className="flex gap-2 mb-2">
            <input type="text" placeholder="First name" value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }} />
            <input type="text" placeholder="Last name" value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }} />
            <input type="text" placeholder="Student ID (optional)" value={addId}
              onChange={e => setAddId(e.target.value)}
              className="w-36 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }} />
            <select value={addPeriod} onChange={e => setAddPeriod(e.target.value)}
              className="p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }}>
              {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={addStudent} disabled={adding || !firstName.trim() || !lastName.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-30"
              style={{ backgroundColor: RHS_GREEN }}>
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Student ID from Aeries (6 digits). Leave blank to auto-generate.</p>
        </div>

        {/* Student List */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex gap-2">
              {periods.map(p => (
                <button key={p.value} onClick={() => setActivePeriod(p.value)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border"
                  style={activePeriod === p.value
                    ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
                    : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{students.length} students</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No students in this period</div>
          ) : (
            students.map(s => {
              const url = photoUrls[s.id] || s.photo_url
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  {/* Photo: prefer photo_url, fall back to student-photos storage, then initials */}
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-medium text-white"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {url
                      ? <img src={url} alt={s.full_name} className="w-full h-full object-cover" />
                      : s.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')
                    }
                  </div>
                  <div className="flex-1">
                    {/* no confirmed /student/[id] route — plain span instead of link */}
                    <span className="text-sm font-medium" style={{ color: RHS_GREEN }}>
                      {s.full_name}
                    </span>
                    <div className="flex gap-2 mt-0.5">
                      {s.nfc_uid && <p className="text-xs text-gray-400">📲 NFC</p>}
                      {(s.photo_file || s.photo_url) && <p className="text-xs text-gray-400">📷 Photo</p>}
                    </div>
                  </div>
                  <select
                    value={activePeriod}
                    onChange={e => movePeriod(s.id, e.target.value)}
                    className="text-xs border rounded-lg p-1 text-gray-600 bg-white"
                    style={{ borderColor: '#e5e7eb' }}>
                    {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <button onClick={() => openEdit(s)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    Edit
                  </button>
                  {confirmDelete === s.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => removeStudent(s.id)}
                        className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(s.id)}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                      Remove
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Clear Roster ── */}
        <div className="mt-8 rounded-xl border border-red-200 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <span className="text-red-500">⚠️</span>
            <p className="text-sm font-semibold text-red-700">Clear Roster</p>
            <p className="text-xs text-red-500 ml-1">Use this at the start of a new school year to remove students before re-importing from Aeries.</p>
          </div>
          <div className="p-4 bg-white space-y-3">

            {/* Per-period clear buttons */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Clear one period:</p>
              <div className="flex flex-wrap gap-2">
                {periods.map(p => (
                  <div key={p.value}>
                    {clearConfirm === `period-${p.value}` ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600 font-medium">Remove all students from {p.label}?</span>
                        <button onClick={() => clearPeriod(p.value)} disabled={clearing}
                          className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg disabled:opacity-50">
                          {clearing ? '...' : 'Yes, clear'}
                        </button>
                        <button onClick={() => setClearConfirm(null)}
                          className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded-lg">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setClearConfirm(`period-${p.value}`)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
                        Clear {p.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Clear all */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Clear all periods at once:</p>
              {clearConfirm === 'all' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-semibold">This removes every student from all your periods. Are you sure?</span>
                  <button onClick={clearAllPeriods} disabled={clearing}
                    className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50">
                    {clearing ? 'Clearing...' : 'Yes, clear all'}
                  </button>
                  <button onClick={() => setClearConfirm(null)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setClearConfirm('all')}
                  className="text-xs px-3 py-1.5 rounded-lg border-2 border-red-400 text-red-600 font-semibold hover:bg-red-50">
                  Clear All Periods
                </button>
              )}
            </div>

          </div>
        </div>

        </> /* end manage view */}

      </div>
    </div>
  )
}
