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
import { useState, useEffect, useRef } from 'react'
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
  const importFileRef = useRef()

  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
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
    if (data) setStudents(data)
    setLoading(false)
  }

  function getPhotoUrl(student) {
    // Prefer photo_url (Aeries/direct URL), fall back to storage file
    if (student.photo_url) return student.photo_url
    if (!student.photo_file) return null
    // Numeric ID photos live in student-photos bucket
    const { data } = supabase.storage.from('student-photos').getPublicUrl(student.photo_file)
    return data?.publicUrl || null
  }

  function getStorageUrl(photo_file) {
    if (!photo_file) return null
    // Numeric ID photos live in student-photos bucket
    const { data } = supabase.storage.from('student-photos').getPublicUrl(photo_file)
    return data?.publicUrl || null
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

  function openEdit(s) {
    setEditStudent(s)
    setEditFirst(s.first_name || '')
    setEditLast(s.last_name || '')
    setEditDisplay(s.full_name || '')
    setEditId('')
    setPhotoUrl(getPhotoUrl(s))
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
      // Get public URL from student-photos bucket
      const { data } = supabase.storage.from('student-photos').getPublicUrl(path)
      setPhotoUrl(data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null)
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

  async function processImportFile(file) {
    if (!file) return
    setImportParseError(''); setImportResults(null); setImportPreview([])
    try {
      const { students, detectedPeriod, detectedTeacher, detectedRoom } = await parseAeriesXlsx(file)
      setImportPreview(students)
      setDetectedMeta({ period: detectedPeriod, teacher: detectedTeacher, room: detectedRoom })
      if (!importPeriod && periods.length > 0) setImportPeriod(periods[0].value)
    } catch {
      setImportParseError('Could not read this file. Make sure it is an Aeries Class Roster .xlsx export.')
    }
  }

  function handleImportFile(e) { processImportFile(e.target.files[0]) }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processImportFile(file)
  }

  async function handleImport() {
    if (!importPreview.length || !importPeriod) return
    setImportLoading(true)
    let added = 0, existing = 0
    const errors = []
    for (const student of importPreview) {
      // Upsert student record
      const { error: sErr } = await supabase.from('students').upsert({
        id: student.id,
        first_name: student.first,
        last_name: student.last,
        full_name: student.full_name,
        grade: student.grade || null,
        period: importPeriod,
      }, { onConflict: 'id' })
      if (sErr) { errors.push(`${student.full_name}: ${sErr.message}`); continue }
      // Add to student_periods if not already linked to this room
      const { data: spExists } = await supabase.from('student_periods')
        .select('id').eq('student_id', student.id).eq('room', room).maybeSingle()
      if (!spExists) {
        await supabase.from('student_periods').insert({ student_id: student.id, period: importPeriod, room })
        added++
      } else {
        existing++
      }
    }
    setImportResults({ added, existing, errors, total: importPreview.length })
    setImportLoading(false)
    if (errors.length === 0) {
      setImportPreview([]); setDetectedMeta(null)
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

  return (
    <div className="min-h-screen bg-gray-50">

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
            <h1 className="text-lg font-bold text-white">Student Management</h1>
            <p className="text-green-200 text-xs">Room {room} · {teacherName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/photos" className="text-sm text-green-200 hover:text-white">📷 Photo Upload</a>
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {/* View Switcher */}
        <div className="flex gap-2 mb-6">
          {[{ id: 'manage', label: 'Manage Students' }, { id: 'import', label: '📥 Import from Aeries' }].map(v => (
            <button key={v.id} onClick={() => { setActiveView(v.id); setImportResults(null); setImportPreview([]); setImportParseError(''); if (importFileRef.current) importFileRef.current.value = '' }}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
              style={activeView === v.id
                ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
                : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
              {v.label}
            </button>
          ))}
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

            {/* Help section */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setShowImportHelp(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <span>❓ How to export a class roster from Aeries</span>
                <span className="text-gray-400 text-xs">{showImportHelp ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {showImportHelp && (
                <div className="px-4 pb-4 border-t border-gray-100 text-xs text-gray-600 space-y-2 pt-3">
                  <p className="font-semibold text-gray-700">Steps in Aeries:</p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>Go to <strong>Reports → Print Class Rosters</strong></li>
                    <li>Select <strong>one class/period</strong> from your course list</li>
                    <li>Click <strong>Export to Excel</strong> (saves as .xlsx)</li>
                    <li>Come back here and drop or upload that file</li>
                    <li>Select which period to assign students to, then click Import</li>
                    <li>Repeat for each of your other periods</li>
                  </ol>
                  <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                    If you have 6 periods, repeat this 6 times — one file per period. Never select "All Classes" in Aeries before exporting.
                  </p>
                </div>
              )}
            </div>

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

            {importPreview.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">{importPreview.length} students found</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Assign to:</label>
                    <select value={importPeriod || ''} onChange={e => setImportPeriod(e.target.value)}
                      className="text-xs border rounded-lg px-2 py-1.5 text-gray-700 bg-white"
                      style={{ borderColor: RHS_GREEN }}>
                      {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['#', 'Student ID', 'Name', 'Grade'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium border-b border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((s, i) => (
                        <tr key={s.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono">{s.id}</td>
                          <td className="px-3 py-2 text-gray-800 font-medium">{s.full_name}</td>
                          <td className="px-3 py-2 text-gray-500">{s.grade || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-400">Students already in the system will be updated, not duplicated.</p>
                  <button onClick={handleImport} disabled={importLoading || !importPeriod}
                    className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-40"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {importLoading ? 'Importing...' : `Import ${importPreview.length} Students`}
                  </button>
                </div>
              </div>
            )}

            {importResults && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${importResults.errors.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                {importResults.errors.length === 0 ? (
                  <p className="text-green-700 font-medium">
                    ✅ Done — {importResults.added} student{importResults.added !== 1 ? 's' : ''} added
                    {importResults.existing > 0 ? `, ${importResults.existing} already in your roster` : ''}.
                    Switching to Manage view…
                  </p>
                ) : (
                  <>
                    <p className="text-amber-800 font-medium mb-2">⚠ {importResults.added} imported, {importResults.errors.length} error{importResults.errors.length !== 1 ? 's' : ''}:</p>
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
              const url = getPhotoUrl(s)
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

        </> /* end manage view */}

      </div>
    </div>
  )
}
