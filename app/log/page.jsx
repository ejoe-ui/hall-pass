'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'

export default function Log() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (teacher) {
        setCurrentTeacher(teacher)
        await loadPasses(teacher)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function loadPasses(teacher) {
    setLoading(true)

    // Get student IDs for this teacher's room
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('room', teacher.room || '27')

    const studentIds = [...new Set(spRows?.map(r => r.student_id) || [])]

    let passData = []
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('passes')
        .select('*')
        .in('student_id', studentIds)
        .order('time_out', { ascending: false })
      passData = data || []
    }

    const { data: studData } = await supabase
      .from('students')
      .select('id, full_name')

    const { data: teacherData } = await supabase
      .from('teachers')
      .select('id, name, room')

    const studMap = {}
    if (studData) studData.forEach(s => studMap[s.id] = s)
    const teacherMap = {}
    if (teacherData) teacherData.forEach(t => teacherMap[t.id] = t)

    const enriched = passData.map(p => ({
      ...p,
      students: studMap[p.student_id] || null,
      teacher: p.teacher_id ? teacherMap[p.teacher_id] || null : null,
    }))

    setPasses(enriched)
    setLoading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('passes').delete().eq('id', deleteTarget.id)
    setPasses(prev => prev.filter(p => p.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  function fmt(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  function exportCSV() {
    const headers = ['Student', 'Date', 'Reason', 'Time Out', 'Time In', 'Duration (min)', 'Room', 'Teacher', 'Period', 'Type']
    const rows = passes.map(p => [
      p.students?.full_name || p.student_id,
      fmtDate(p.time_out),
      p.reason,
      fmt(p.time_out),
      fmt(p.time_in),
      p.duration_minutes || '',
      p.room,
      p.teacher ? `${p.teacher.name} (Rm ${p.teacher.room})` : p.teacher_id ? 'Teacher' : 'Kiosk',
      p.period,
      p.pass_type === 'late_pass' ? 'Late Pass' : 'Hall Pass'
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hall-passes-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const teacherName = currentTeacher?.name || 'Teacher'
  const teacherRoom = currentTeacher?.room || '27'

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; font-size: 11px; }
          @page { margin: 10mm; size: letter landscape; }
          .print-header { margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { border-bottom: 2px solid #000; padding: 4px 6px; text-align: left; font-weight: 600; }
          td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; }
          .status-returned { color: green; }
          .status-out { color: red; }
        }
        .delete-col {
          position: sticky;
          right: 0;
          background: white;
          width: 40px;
          min-width: 40px;
        }
        tr:hover .delete-col { background: #f9fafb; }
        tr.late-row:hover .delete-col { background: #eff6ff; }
      `}</style>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Delete this pass?</h2>
            <p className="text-gray-500 text-sm mb-1">
              <span className="font-medium text-gray-700">{deleteTarget.students?.full_name}</span> — {deleteTarget.reason}
            </p>
            <p className="text-gray-400 text-xs mb-5">{fmtDate(deleteTarget.time_out)} at {fmt(deleteTarget.time_out)}</p>
            <div className="flex gap-3">
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between no-print" style={{ backgroundColor: RHS_GREEN }}>
          <div className="flex items-center gap-3">
            <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            <div>
              <h1 className="text-lg font-bold text-white">Pass Log</h1>
              <p className="text-green-200 text-xs">Room {teacherRoom} · {teacherName} · {passes.length} passes</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={exportCSV}
              className="px-4 py-2 text-sm border border-green-400 rounded-lg text-green-100 hover:bg-green-700">
              Export CSV
            </button>
            <button onClick={() => window.print()}
              className="px-4 py-2 text-sm border border-green-400 rounded-lg text-green-100 hover:bg-green-700">
              Print
            </button>
            <a href="/teacher" className="px-4 py-2 text-sm bg-white text-green-800 rounded-lg font-medium hover:bg-green-50">
              ← Dashboard
            </a>
          </div>
        </div>

        <div className="p-6 max-w-6xl mx-auto">

          {/* Print header — only shows when printing */}
          <div className="print-header hidden print:block mb-4">
            <h1 className="text-lg font-bold">Room {teacherRoom} · {teacherName} — RHS PassAble Log</h1>
            <p className="text-xs text-gray-500">Printed {new Date().toLocaleDateString()} · {passes.length} total passes</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : passes.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No passes yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Student', 'Date', 'Reason', 'Out', 'In', 'Duration', 'From', 'Status'].map((h, i) => (
                      <th key={i} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                    <th className="delete-col no-print" />
                  </tr>
                </thead>
                <tbody>
                  {passes.map(p => {
                    const isLatePass = p.pass_type === 'late_pass'
                    const fromLabel = p.teacher
                      ? `${p.teacher.name} · Rm ${p.teacher.room}`
                      : p.teacher_id ? 'Teacher' : 'Kiosk'
                    return (
                      <tr key={p.id}
                        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 group ${isLatePass ? 'late-row bg-blue-50 hover:bg-blue-100' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <a href={`/student/${p.student_id}`} className="font-medium text-gray-800 hover:text-green-700 hover:underline underline-offset-2 whitespace-nowrap">
                              {p.students?.full_name || '—'}
                            </a>
                            {isLatePass && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium no-print">Late</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.time_out)}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.reason}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(p.time_out)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(p.time_in)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.duration_minutes ? `${p.duration_minutes}m` : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fromLabel}</td>
                        <td className="px-4 py-3">
                          {isLatePass ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">Late Pass</span>
                          ) : p.time_in ? (
                            <span className="status-returned px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">Returned</span>
                          ) : (
                            <span className="status-out px-2 py-1 bg-red-50 text-red-600 rounded-md text-xs font-medium">Out</span>
                          )}
                        </td>
                        <td className="delete-col no-print px-2 py-3">
                          <button onClick={() => setDeleteTarget(p)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded"
                            title="Delete pass">
                            🗑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
