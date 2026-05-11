'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Log() {
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadPasses() }, [])

  async function loadPasses() {
const { data: passData } = await supabase
  .from('passes')
  .select('*')
  .order('time_out', { ascending: false })
const { data: studData } = await supabase
  .from('students')
  .select('id, full_name')
const studMap = {}
if (studData) studData.forEach(s => studMap[s.id] = s)
const data = passData?.map(p => ({ ...p, students: studMap[p.student_id] || null }))
    if (data) setPasses(data)
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
    const headers = ['Student', 'Date', 'Reason', 'Time Out', 'Time In', 'Duration (min)', 'Room', 'Period', 'Type']
    const rows = passes.map(p => [
      p.students?.full_name || p.student_id,
      fmtDate(p.time_out),
      p.reason,
      fmt(p.time_out),
      fmt(p.time_in),
      p.duration_minutes || '',
      p.room,
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

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; font-size: 11px; }
          @page { margin: 10mm; size: letter; }
          .print-header { margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { border-bottom: 2px solid #000; padding: 4px 6px; text-align: left; font-weight: 600; }
          td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; }
          .status-returned { color: green; }
          .status-out { color: red; }
        }
      `}</style>

      {/* Delete confirmation modal */}
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

      <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Pass Log</h1>
            <p className="text-gray-500 text-sm">{passes.length} total passes</p>
          </div>
          <div className="flex gap-3">
            <button onClick={exportCSV}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
              Export CSV
            </button>
            <button onClick={() => window.print()}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
              Print
            </button>
            <a href="/teacher" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium">
              ← Dashboard
            </a>
          </div>
        </div>

        <div className="print-header hidden print:block mb-4">
          <h1 className="text-lg font-bold">Room 27 · Mr. Joe — RHS PassAble Log</h1>
          <p className="text-xs text-gray-500">Printed {new Date().toLocaleDateString()} · {passes.length} total passes</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : passes.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No passes yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Student', 'Date', 'Reason', 'Out', 'In', 'Duration', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passes.map(p => {
                  const isLatePass = p.pass_type === 'late_pass'
                  return (
                    <tr key={p.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 group ${isLatePass ? 'bg-blue-50 hover:bg-blue-100' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a href={`/student/${p.student_id}`} className="font-medium text-gray-800 hover:text-green-700 hover:underline underline-offset-2">{p.students?.full_name || '—'}</a>
                          {isLatePass && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium no-print">Late Pass</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(p.time_out)}</td>
                      <td className="px-4 py-3 text-gray-600">{p.reason}</td>
                      <td className="px-4 py-3 text-gray-500">{fmt(p.time_out)}</td>
                      <td className="px-4 py-3 text-gray-500">{fmt(p.time_in)}</td>
                      <td className="px-4 py-3 text-gray-500">{p.duration_minutes ? `${p.duration_minutes}m` : '—'}</td>
                      <td className="px-4 py-3">
                        {isLatePass ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">Late Pass</span>
                        ) : p.time_in ? (
                          <span className="status-returned px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">Returned</span>
                        ) : (
                          <span className="status-out px-2 py-1 bg-red-50 text-red-600 rounded-md text-xs font-medium">Out</span>
                        )}
                      </td>
                      <td className="px-4 py-3 no-print">
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
    </>
  )
}
