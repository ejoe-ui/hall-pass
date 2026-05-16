'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'

export default function AdminPanel() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState('teachers')

  // ── Teachers ──────────────────────────────────────────────────────────────
  const [teachers, setTeachers] = useState([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState({})
  const [importPreview, setImportPreview] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherError, setTeacherError] = useState('')
  const fileRef = useRef(null)

  const emptyForm = { name: '', email: '', room: '', department: '', pin: '', is_admin: false, is_active: true, periods: ['1','4','6'], period_labels: {} }
  const [form, setForm] = useState(emptyForm)

  // ── Students ──────────────────────────────────────────────────────────────
  const [students, setStudents] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  // ── Pass log ──────────────────────────────────────────────────────────────
  const [passes, setPasses] = useState([])
  const [logFilter, setLogFilter] = useState('today')

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
  }, [isAdmin])

  async function checkAdmin() {
    const { data } = await supabase.from('teachers').select('is_admin').eq('email', session.user.email).single()
    if (data?.is_admin) setIsAdmin(true)
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  // ── Teacher functions ─────────────────────────────────────────────────────
  async function loadTeachers() {
    setTeachersLoading(true)
    const { data } = await supabase.from('teachers').select('*').order('name')
    setTeachers(data || [])
    setTeachersLoading(false)
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
      setTeacherMsg(`${form.name} added. Use ✉️ Invite to send a sign-in link.`)
    }
    setSaving(false); setShowForm(false); setEditingTeacher(null); setForm(emptyForm)
    loadTeachers()
    setTimeout(() => setTeacherMsg(''), 4000)
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

  async function handleSendInvite(teacher) {
    setInviting(prev => ({ ...prev, [teacher.id]: 'sending' }))
    const { error } = await supabase.auth.signInWithOtp({
      email: teacher.email,
      options: { emailRedirectTo: 'https://hall-pass-lime.vercel.app/teacher' }
    })
    setInviting(prev => ({ ...prev, [teacher.id]: error ? 'error' : 'sent' }))
    setTimeout(() => setInviting(prev => ({ ...prev, [teacher.id]: null })), 4000)
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
      setTeacherMsg(`✅ Imported ${toInsert.length} teacher${toInsert.length !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} skipped (already exist)` : ''}. Use ✉️ Invite to send sign-in links.`)
      setShowImport(false); setImportPreview([]); setImportErrors([])
      if (fileRef.current) fileRef.current.value = ''
      loadTeachers()
    }
    setImporting(false)
  }

  // ── Student functions ─────────────────────────────────────────────────────
  async function loadStudents() {
    const { data } = await supabase.from('students').select('*').order('last_name')
    if (data) { setStudents(data); return data }
    return []
  }

  // ── Pass log functions ────────────────────────────────────────────────────
  async function loadPasses(filter) {
    const f = filter || logFilter
    let query = supabase.from('passes').select('*').order('time_out', { ascending: false })
    if (f === 'today') {
      const today = new Date(); today.setHours(0,0,0,0)
      query = query.gte('time_out', today.toISOString())
    }
    const { data: passData } = await query.limit(100)
    if (!passData) return
    const studentIds = [...new Set(passData.map(p => p.student_id))]
    const { data: studs } = await supabase.from('students').select('id, full_name').in('id', studentIds)
    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s.full_name)
    setPasses(passData.map(p => ({ ...p, students: { full_name: studMap[p.student_id] || 'Unknown' } })))
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
      const { data: studs } = await supabase.from('students').select('id, full_name')
      const studMap = {}
      if (studs) studs.forEach(s => studMap[s.id] = s.full_name)
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredStudents = students.filter(s => s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()))
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
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Admin Panel</h1>
      <p className="text-gray-500 text-sm mb-8">Sign in with your school Google account</p>
      <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/admin` } })}
        className="px-6 py-3 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: RHS_GREEN }}>
        Sign in with Google
      </button>
      <a href="/teacher" className="mt-8 text-sm text-gray-400 hover:text-gray-600">← Home</a>
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

  const TABS = [
    { id: 'teachers', label: 'Teachers' },
    { id: 'conflicts', label: 'Conflict Groups' },
    { id: 'dnlo', label: 'Do Not Let Out' },
    { id: 'students', label: 'Students' },
    { id: 'log', label: 'Pass Log' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Admin Panel</h1>
            <p className="text-green-200 text-xs">{session?.user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

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
                  + Add Teacher
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
                  {editingTeacher ? `Edit — ${editingTeacher.name}` : 'Add New Teacher'}
                </h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: 'Full Name *', key: 'name', placeholder: 'Jane Smith' },
                    { label: 'Email *', key: 'email', placeholder: 'jsmith@rjusd.org' },
                    { label: 'Room', key: 'room', placeholder: '27' },
                    { label: 'Department', key: 'department', placeholder: 'CTE' },
                    { label: 'PIN (optional)', key: 'pin', placeholder: '4-digit PIN' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800" />
                    </div>
                  ))}
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
                          <label className="block text-xs font-medium text-gray-600 mb-2">Kiosk Display Labels <span className="font-normal text-gray-400">(optional)</span></label>
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
                    {saving ? 'Saving...' : editingTeacher ? 'Save Changes' : 'Add Teacher'}
                  </button>
                </div>
              </div>
            )}

            {/* Teacher List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Teachers ({teachers.length})</p>
              </div>
              {teachersLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
              ) : teachers.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No teachers yet</div>
              ) : teachers.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0" style={{ opacity: t.is_active ? 1 : 0.5 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: t.is_admin ? '#FEF3C7' : '#f0fdf4' }}>
                    {t.is_admin ? '⭐' : '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                      {t.name}
                      {t.is_admin && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">ADMIN</span>}
                      {!t.is_active && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full font-bold">INACTIVE</span>}
                      {!t.auth_id && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">NO AUTH</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{t.email}{t.room ? ` · Room ${t.room}` : ''}{t.department ? ` · ${t.department}` : ''}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => handleSendInvite(t)} disabled={!!inviting[t.id]}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: inviting[t.id] === 'sent' ? '#f0fdf4' : inviting[t.id] === 'error' ? '#FEE2E2' : '#EFF6FF', color: inviting[t.id] === 'sent' ? '#166534' : inviting[t.id] === 'error' ? '#DC2626' : '#1D4ED8' }}>
                      {inviting[t.id] === 'sending' ? 'Sending...' : inviting[t.id] === 'sent' ? '✓ Sent' : inviting[t.id] === 'error' ? 'Failed' : '✉️ Invite'}
                    </button>
                    <button onClick={() => handleEdit(t)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(t)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: t.is_active ? '#FEE2E2' : '#f0fdf4', color: t.is_active ? '#DC2626' : '#166534' }}>
                      {t.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 px-4 py-3 bg-green-50 rounded-xl text-xs text-green-700">
              💡 After adding a teacher, click <strong>✉️ Invite</strong> to send them a magic sign-in link. Their account links automatically on first sign-in.
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
                              {s.full_name} <span className="text-xs text-gray-400">· Period {s.period}</span>
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
                        {s.full_name} <span className="text-xs text-gray-400">· Period {s.period}</span>
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
            <div className="mb-4">
              <input placeholder="Search students..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                className="w-full p-3 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students ({filteredStudents.length})</p>
                <div className="flex gap-3">
                  <a href="/admin/students" className="text-xs text-gray-400 hover:text-gray-600">Full Manager →</a>
                  <a href="/qr" className="text-xs text-gray-400 hover:text-gray-600">Print QR Badges →</a>
                </div>
              </div>
              {filteredStudents.slice(0, 50).map(s => (
                <div key={s.id + s.period} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>
                    {s.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                  </div>
                  <div className="flex-1">
                    <a href={`/student/${s.id}`} className="text-sm hover:underline" style={{ color: RHS_GREEN }}>{s.full_name}</a>
                    <div className="text-xs text-gray-400">Period {s.period}</div>
                  </div>
                </div>
              ))}
              {filteredStudents.length > 50 && (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">Showing 50 of {filteredStudents.length} — use Full Manager to see all</div>
              )}
            </div>
          </>
        )}

        {/* ── PASS LOG ── */}
        {activeTab === 'log' && (
          <>
            <div className="flex gap-2 mb-4">
              {['today', 'all'].map(f => (
                <button key={f} onClick={() => { setLogFilter(f); loadPasses(f) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${logFilter === f ? 'text-white border-transparent' : 'text-gray-500 bg-white border-gray-200'}`}
                  style={logFilter === f ? { backgroundColor: RHS_GREEN } : {}}>
                  {f === 'today' ? 'Today' : 'All Time'}
                </button>
              ))}
              <a href="/log" className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center">Full Log & Export →</a>
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Pass Log ({passes.length})</p>
              </div>
              {passes.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No passes found</div>
              ) : passes.map(p => {
                const duration = p.duration_minutes != null ? `${p.duration_minutes}m` : p.time_in ? '—' : 'Out'
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <div className="text-sm text-gray-800">{p.students?.full_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-400">
                        {p.reason} · Period {p.period} · {new Date(p.time_out).toLocaleDateString()} {new Date(p.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.time_in ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{duration}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
