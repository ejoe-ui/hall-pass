'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'

export default function AdminPanel() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState('teachers')

  // Teachers
  const [teachers, setTeachers] = useState([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRoom, setNewRoom] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [teacherMsg, setTeacherMsg] = useState('')

  // Students
  const [students, setStudents] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  // Pass log
  const [passes, setPasses] = useState([])
  const [logFilter, setLogFilter] = useState('today')

  // Conflict groups
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState({}) // groupId -> [student]
  const [newGroupName, setNewGroupName] = useState('')
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [addingMember, setAddingMember] = useState(null) // groupId
  const [memberSearch, setMemberSearch] = useState('')
  const [groupMsg, setGroupMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) checkAdmin() }, [session])
  useEffect(() => {
    if (!isAdmin) return
    loadTeachers()
    loadStudents().then(data => loadGroups(data))
    loadPasses()
  }, [isAdmin])

  async function checkAdmin() {
    const { data } = await supabase.from('teachers').select('is_admin').eq('email', session.user.email).single()
    if (data?.is_admin) setIsAdmin(true)
  }

  async function loadTeachers() {
    const { data } = await supabase.from('teachers').select('*').order('name')
    if (data) setTeachers(data)
  }

  async function loadStudents() {
    const { data } = await supabase.from('students').select('*').order('last_name')
    if (data) {
      setStudents(data)
      return data
    }
    return []
  }

  async function loadPasses() {
    let query = supabase.from('passes').select('*, students(full_name)').order('time_out', { ascending: false })
    if (logFilter === 'today') {
      const today = new Date(); today.setHours(0,0,0,0)
      query = query.gte('time_out', today.toISOString())
    }
    const { data } = await query.limit(100)
    if (data) setPasses(data)
  }

  async function loadGroups(studentsList) {
    const list = studentsList || students
    const { data: grps } = await supabase.from('conflict_groups').select('*').order('name')
    if (!grps) return
    setGroups(grps)
    const membersMap = {}
    for (const g of grps) {
      const { data: members } = await supabase
        .from('conflict_group_members')
        .select('id, student_id')
        .eq('group_id', g.id)
      if (members) {
        membersMap[g.id] = members.map(m => ({
          ...m,
          students: { full_name: list.find(s => s.id === m.student_id)?.full_name || m.student_id }
        }))
      } else {
        membersMap[g.id] = []
      }
    }
    setGroupMembers(membersMap)
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
    setMemberSearch('')
    loadGroups()
  }

  async function removeMember(memberId, groupId) {
    await supabase.from('conflict_group_members').delete().eq('id', memberId)
    loadGroups()
  }

  async function addTeacher() {
    if (!newName || !newEmail || !newRoom) return
    setSavingTeacher(true)
    const { error } = await supabase.from('teachers').insert({ name: newName, email: newEmail, room: newRoom, is_admin: newIsAdmin })
    if (error) { setTeacherMsg('Error adding teacher.') }
    else { setTeacherMsg(`${newName} added.`); setNewName(''); setNewEmail(''); setNewRoom(''); setNewIsAdmin(false); loadTeachers() }
    setSavingTeacher(false)
    setTimeout(() => setTeacherMsg(''), 3000)
  }

  async function removeTeacher(id, name) {
    if (!confirm(`Remove ${name}?`)) return
    await supabase.from('teachers').delete().eq('id', id)
    loadTeachers()
  }

  async function toggleAdmin(id, current) {
    await supabase.from('teachers').update({ is_admin: !current }).eq('id', id)
    loadTeachers()
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  const filteredStudents = students.filter(s => s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()))
  const memberSearchResults = students.filter(s => s.full_name?.toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 8)

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4" />
      <h1 className="text-xl font-bold mb-2" style={{ color: RHS_GREEN }}>RHS PassAble · Admin</h1>
      <p className="text-gray-400 text-sm mb-6">Sign in to your teacher account first</p>
      <a href="/teacher" className="px-6 py-3 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: RHS_GREEN }}>Go to Teacher Login</a>
    </div>
  )

  if (!isAdmin) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4" />
      <h1 className="text-xl font-bold mb-2 text-red-500">Access Denied</h1>
      <p className="text-gray-400 text-sm mb-6">You don't have admin privileges.</p>
      <a href="/teacher" className="text-sm text-gray-400 hover:text-gray-600">← Back to Dashboard</a>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">RHS PassAble · Admin</h1>
            <p className="text-green-200 text-xs">RHS PassAble · {session.user.email}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

      <div className="flex border-b border-gray-200 bg-white px-6 overflow-x-auto">
        {[
          { id: 'teachers', label: 'Teachers' },
          { id: 'conflicts', label: 'Conflict Groups' },
          { id: 'students', label: 'Students' },
          { id: 'log', label: 'Pass Log' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            style={activeTab === tab.id ? { borderColor: RHS_GREEN, color: RHS_GREEN } : {}}>
            {tab.label}
            {tab.id === 'conflicts' && groups.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{groups.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-4xl mx-auto">

        {/* TEACHERS */}
        {activeTab === 'teachers' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Add Teacher</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input placeholder="Full name (e.g. Mr. Smith)" value={newName} onChange={e => setNewName(e.target.value)}
                  className="p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <input placeholder="email@rjusd.org" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <input placeholder="Room number" value={newRoom} onChange={e => setNewRoom(e.target.value)}
                  className="p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <label className="flex items-center gap-2 text-sm text-gray-600 p-2">
                  <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} className="w-4 h-4 rounded" />
                  Grant admin access
                </label>
              </div>
              {teacherMsg && <p className="text-xs text-green-600 mb-2">{teacherMsg}</p>}
              <button onClick={addTeacher} disabled={savingTeacher || !newName || !newEmail || !newRoom}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: RHS_GREEN }}>
                {savingTeacher ? 'Adding...' : 'Add Teacher'}
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>All Teachers ({teachers.length})</p>
              </div>
              {teachers.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No teachers added yet</div>
              ) : teachers.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {t.name?.split(' ').pop()?.[0] || '?'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                      {t.name}
                      {t.is_admin && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Admin</span>}
                    </div>
                    <div className="text-xs text-gray-400">{t.email} · Room {t.room}</div>
                  </div>
                  <button onClick={() => toggleAdmin(t.id, t.is_admin)} className="text-xs px-2.5 py-1 border rounded-lg text-gray-500 hover:bg-gray-50">
                    {t.is_admin ? 'Remove Admin' : 'Make Admin'}
                  </button>
                  <button onClick={() => removeTeacher(t.id, t.name)} className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-400 hover:bg-red-50">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CONFLICT GROUPS */}
        {activeTab === 'conflicts' && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              Students in the same group cannot be out at the same time. When a conflict is detected, the student is held and you are notified. You can override at any time.
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <p className="text-sm font-medium mb-3" style={{ color: RHS_GREEN }}>Create New Group</p>
              <div className="flex gap-2">
                <input placeholder="Group name (e.g. Period 1 Conflict A)" value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGroup()}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={addGroup} disabled={!newGroupName.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: RHS_GREEN }}>
                  Create
                </button>
              </div>
              {groupMsg && <p className="text-xs text-green-600 mt-2">{groupMsg}</p>}
            </div>

            {groups.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                No conflict groups yet. Create one above and add students to it.
              </div>
            ) : groups.map(group => {
              const members = groupMembers[group.id] || []
              const memberCount = members.length
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
                        className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-400 hover:bg-red-50">
                        Delete
                      </button>
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
                          <button onClick={() => removeMember(m.id, group.id)}
                            className="text-xs text-red-400 hover:text-red-600">Remove</button>
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

        {/* STUDENTS */}
        {activeTab === 'students' && (
          <>
            <div className="mb-4">
              <input placeholder="Search students..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                className="w-full p-3 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students ({filteredStudents.length})</p>
                <a href="/admin/students" className="text-xs text-gray-400 hover:text-gray-600">Full Manager →</a> <a href="/qr" className="text-xs text-gray-400 hover:text-gray-600">Print QR Badges →</a>
              </div>
              {filteredStudents.slice(0, 50).map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {s.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-800">{s.full_name}</div>
                    <div className="text-xs text-gray-400">Period {s.period}</div>
                  </div>
                </div>
              ))}
              {filteredStudents.length > 50 && (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">
                  Showing 50 of {filteredStudents.length} — use Full Manager to see all
                </div>
              )}
            </div>
          </>
        )}

        {/* PASS LOG */}
        {activeTab === 'log' && (
          <>
            <div className="flex gap-2 mb-4">
              {['today', 'all'].map(f => (
                <button key={f} onClick={() => { setLogFilter(f); loadPasses() }}
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
                      <div className="text-sm text-gray-800 flex items-center gap-2">
                        {p.students?.full_name || 'Unknown'}
                        {p.teacher_id && <span className="text-xs text-green-600">sent by {p.teacher_id.split('@')[0]}</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        {p.reason} · Period {p.period} · {new Date(p.time_out).toLocaleDateString()} {new Date(p.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.time_in ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {duration}
                    </span>
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
