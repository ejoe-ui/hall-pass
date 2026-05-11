'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'
const PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function StudentsAdmin() {
  const [activePeriod, setActivePeriod] = useState('1')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [addPeriod, setAddPeriod] = useState('1')
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editDisplay, setEditDisplay] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadStudents() }, [activePeriod])

  async function loadStudents() {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name, period, nfc_uid')
      .eq('period', activePeriod)
      .order('first_name')
    if (data) setStudents(data)
    setLoading(false)
  }

  async function addStudent() {
    if (!firstName.trim() || !lastName.trim()) return
    setAdding(true)
    const full_name = `${firstName.trim()} ${lastName.trim()}`
    const id = `NEW${Date.now()}`
    const { error } = await supabase.from('students').insert({
      id, first_name: firstName.trim(), last_name: lastName.trim(),
      full_name, period: addPeriod
    })
    if (!error) {
      setFirstName(''); setLastName('')
      if (addPeriod === activePeriod) loadStudents()
    }
    setAdding(false)
  }

  async function removeStudent(id) {
    await supabase.from('students').delete().eq('id', id)
    setConfirmDelete(null)
    loadStudents()
  }

  async function movePeriod(id, newPeriod) {
    await supabase.from('students').update({ period: newPeriod }).eq('id', id)
    loadStudents()
  }

  function openEdit(s) {
    setEditStudent(s)
    setEditFirst(s.first_name || '')
    setEditLast(s.last_name || '')
    setEditDisplay(s.full_name || '')
  }

  async function saveEdit() {
    if (!editStudent) return
    setSaving(true)
    const full_name = editDisplay.trim() || `${editFirst.trim()} ${editLast.trim()}`
    await supabase.from('students').update({
      first_name: editFirst.trim(),
      last_name: editLast.trim(),
      full_name,
    }).eq('id', editStudent.id).eq('period', editStudent.period)
    setSaving(false)
    setEditStudent(null)
    loadStudents()
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Edit Modal */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Edit Student</h2>
                <p className="text-xs text-gray-400">ID: {editStudent.id} · Period {editStudent.period}</p>
              </div>
              <button onClick={() => setEditStudent(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
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
                <p className="text-xs text-gray-400 mt-1">Leave as-is or type a preferred name like "Alex" instead of "Alejandro Martinez"</p>
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

      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Student Management</h1>
            <p className="text-green-200 text-xs">Room 27 · Mr. Joe</p>
          </div>
        </div>
        <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
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
            <select value={addPeriod} onChange={e => setAddPeriod(e.target.value)}
              className="p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
              style={{ borderColor: RHS_GREEN }}>
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={addStudent} disabled={adding || !firstName.trim() || !lastName.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-30"
              style={{ backgroundColor: RHS_GREEN }}>
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        {/* Student List */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex gap-2">
              {PERIODS.map(p => (
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
            students.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                  style={{ backgroundColor: RHS_GREEN }}>
                  {s.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                </div>
                <div className="flex-1">
                  <a href={`/student/${s.id}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: RHS_GREEN }}>
                    {s.full_name}
                  </a>
                  {s.nfc_uid && (
                    <p className="text-xs text-gray-400 mt-0.5">📲 NFC enrolled</p>
                  )}
                </div>
                <select
                  value={s.period}
                  onChange={e => movePeriod(s.id, e.target.value)}
                  className="text-xs border rounded-lg p-1 text-gray-600 bg-white"
                  style={{ borderColor: '#e5e7eb' }}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
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
            ))
          )}
        </div>
      </div>
    </div>
  )
}
