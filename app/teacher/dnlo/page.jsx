/*
  PassAble — RHS Hall Pass System
  FILE:    app/teacher/dnlo/page.jsx
  ROUTE:   /teacher/dnlo
  PURPOSE: Teacher-scoped Do Not Let Out list. Teachers can add/remove their own
           student restrictions. Does not affect admin-level restrictions.
           DNLO entries trigger a warning (not a block) on teacher checkout.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, student_periods, do_not_let_out)
  UPDATED: 2026-06-23 — added file header; scoped students fetch in loadDnlo to
           DNLO IDs only; removed stale students.period display from search results
*/
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

export default function TeacherDNLO() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [students, setStudents] = useState([])
  const [dnloList, setDnloList] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [notAuthed, setNotAuthed] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setNotAuthed(true); setLoading(false); return }
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (teacher) {
        setCurrentTeacher(teacher)
        await loadStudents(teacher)
        await loadDnlo(teacher)
      }
      setLoading(false)
    }
    init()
  }, [])

  async function loadStudents(teacher) {
    const room = teacher?.room || '27'
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('room', room)
    const ids = [...new Set(spRows?.map(r => r.student_id) || [])]
    if (ids.length === 0) { setStudents([]); return }
    // Select only id and full_name — period comes from student_periods, not students table
    const { data } = await supabase
      .from('students')
      .select('id, full_name')
      .in('id', ids)
      .order('first_name')
    if (data) setStudents(data)
  }

  async function loadDnlo(teacher) {
    const t = teacher || currentTeacher
    const { data } = await supabase
      .from('do_not_let_out')
      .select('*')
      .eq('active', true)
      .eq('scope', 'teacher')
      .eq('created_by', t?.id || t?.email || '')
      .order('created_at', { ascending: false })
    if (data) {
      // Scope students fetch to only the IDs in this DNLO list
      const dnloStudentIds = data.map(d => d.student_id).filter(Boolean)
      const studMap = {}
      if (dnloStudentIds.length > 0) {
        const { data: studs } = await supabase
          .from('students')
          .select('id, full_name')
          .in('id', dnloStudentIds)
        if (studs) studs.forEach(s => { studMap[s.id] = s.full_name })
      }
      setDnloList(data.map(d => ({ ...d, full_name: studMap[d.student_id] || d.student_id })))
    }
  }

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const results = students.filter(s =>
      s.full_name?.toLowerCase().includes(search.toLowerCase()) &&
      !dnloList.find(d => d.student_id === s.id)
    ).slice(0, 6)
    setSearchResults(results)
  }, [search, students, dnloList])

  async function addDnlo(studentId, studentName) {
    const { error } = await supabase.from('do_not_let_out').insert({
      student_id: studentId,
      reason: reason.trim() || 'Teacher restriction',
      scope: 'teacher',
      created_by: currentTeacher?.id || currentTeacher?.email || 'teacher',
      active: true,
    })
    if (!error) {
      setMsg(`${studentName} added to your Do Not Let Out list.`)
      setSearch(''); setReason(''); setSearchResults([])
      await loadDnlo()
      setTimeout(() => setMsg(''), 3000)
    }
  }

  async function removeDnlo(id, name) {
    await supabase.from('do_not_let_out').update({ active: false }).eq('id', id)
    setMsg(`${name} removed.`)
    await loadDnlo()
    setTimeout(() => setMsg(''), 3000)
  }

  const teacherName = currentTeacher?.name || 'Teacher'
  const teacherRoom = currentTeacher?.room || '27'

  if (notAuthed) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-gray-500">You need to be signed in to view this page.</p>
      <a href="/teacher" className="text-sm font-medium text-green-700 hover:underline">← Go to Teacher Login</a>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Do Not Let Out</h1>
            <p className="text-green-200 text-xs">Room {teacherRoom} · {teacherName}</p>
          </div>
        </div>
        <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
      </div>

      <div className="p-6 max-w-2xl mx-auto">

        {/* Info banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          Students on this list will trigger a warning when you attempt to check them out from your teacher dashboard. You can still override. This list is separate from admin restrictions — it only applies to your checkout flow, not the kiosk.
        </div>

        {/* Add student */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Add Student</p>
          <div className="flex flex-col gap-2">
            <input
              placeholder="Search your students..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }}
            />
            {searchResults.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {searchResults.map(s => (
                  <button key={s.id}
                    onClick={() => { setSearch(s.full_name); setSearchResults([{ ...s, selected: true }]) }}
                    className="w-full text-left text-sm px-3 py-2 hover:bg-green-50 text-gray-700 border-b border-gray-50 last:border-0">
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
            <input
              placeholder="Reason (e.g. behavior, parent request)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }}
            />
            {searchResults.length === 1 && searchResults[0].selected && (
              <button
                onClick={() => addDnlo(searchResults[0].id, searchResults[0].full_name)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white"
                style={{ backgroundColor: '#dc2626' }}>
                Add to Do Not Let Out
              </button>
            )}
          </div>
          {msg && <p className="text-xs mt-2" style={{ color: RHS_GREEN }}>{msg}</p>}
        </div>

        {/* DNLO List */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>
              Your Restrictions ({dnloList.length})
            </p>
            {dnloList.length > 0 && (
              <span className="text-xs text-amber-600 font-medium">⚠ Triggers warning on checkout</span>
            )}
          </div>
          {dnloList.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No students on your Do Not Let Out list
            </div>
          ) : dnloList.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                ⚠
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{d.full_name}</div>
                <div className="text-xs text-gray-400">{d.reason}</div>
              </div>
              <button
                onClick={() => removeDnlo(d.id, d.full_name)}
                className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
          💡 Admin restrictions (set by your school admin) are separate and cannot be removed from this page. Check the Admin panel to view those.
        </div>
      </div>
    </div>
  )
}
