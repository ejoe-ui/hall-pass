/*
  PassAble — RHS Hall Pass System
  FILE:    app/roster/page.jsx
  ROUTE:   /roster
  PURPOSE: Teacher-scoped student roster management. Add, edit, remove, and move
           students between periods. Period membership sourced from student_periods
           table (not students.period). Supports manual photo upload.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, student_periods)
  STORAGE: lifetouch-raw bucket for all student photos
  UPDATED: 2026-06-23 — added file header; fixed photo bucket (student-photos →
           lifetouch-raw) in getPhotoUrl, getStorageUrl, and handlePhotoUpload;
           removed dead /student/[id] link (no confirmed route)
*/
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

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
    // Uses lifetouch-raw bucket (not student-photos)
    const { data } = supabase.storage.from('lifetouch-raw').getPublicUrl(student.photo_file)
    return data?.publicUrl || null
  }

  function getStorageUrl(photo_file) {
    if (!photo_file) return null
    // Uses lifetouch-raw bucket (not student-photos)
    const { data } = supabase.storage.from('lifetouch-raw').getPublicUrl(photo_file)
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
    // Upload to lifetouch-raw bucket (not student-photos)
    const { error: uploadError } = await supabase.storage
      .from('lifetouch-raw')
      .upload(path, file, { upsert: true, contentType: 'image/jpeg' })
    if (!uploadError) {
      await supabase.from('students').update({ photo_file: path }).eq('id', editStudent.id)
      // Get public URL from lifetouch-raw bucket (not student-photos)
      const { data } = supabase.storage.from('lifetouch-raw').getPublicUrl(path)
      setPhotoUrl(data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null)
      setEditStudent(prev => ({ ...prev, photo_file: path }))
    }
    setPhotoUploading(false)
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
                  {/* Photo: prefer photo_url, fall back to lifetouch-raw storage, then initials */}
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
      </div>
    </div>
  )
}
