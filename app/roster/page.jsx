/*
  PassAble — RHS Hall Pass System
  FILE:    app/roster/page.jsx
  ROUTE:   /roster?room=27
  PURPOSE: Roster import tool — teachers upload Aeries XLSX class rosters,
           which are parsed and upserted into the students and student_periods
           tables. Supports multi-period import (one file per period, selected
           simultaneously). Period and term are auto-detected from Aeries headers.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students, student_periods)
  AUTH:    No auth check — accessed via direct link from Relay Station with ?room= param.
  UPDATED: 2026-06-22 — added draggable searchable help panel
*/
'use client'
import { useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'
const RHS_GRAY = '#C4BEB5'

// ── Parser — auto-detects period and term from Aeries header ──────────────
function parseAeriesXLSX(workbook, fileName) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true })

  let period = null
  let term = null
  let courseTitle = ''
  const students = []
  let inStudents = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = row.map(c => String(c || '').trim())
    const nonEmpty = cells.filter(c => c !== '')
    if (nonEmpty.length === 0) continue

    // Period header row — first non-empty cell is 1-7, second is course title
    if (!period && /^[1-7]$/.test(nonEmpty[0])) {
      period = nonEmpty[0]
      courseTitle = nonEmpty[1] || ''
      const termVal = nonEmpty.find(v => v === 'F' || v === 'S')
      term = termVal === 'F' ? 'Fall' : termVal === 'S' ? 'Spring' : ''
      continue
    }

    if (nonEmpty.some(v => v === 'Student ID')) { inStudents = true; continue }
    if (!inStudents) continue

    const idVal = nonEmpty.find(v => /^\d{6}$/.test(v))
    const nameVal = nonEmpty.find(v => v.includes(',') && v.length > 3 && !/^\d/.test(v))

    if (idVal && nameVal) {
      const parts = nameVal.split(',')
      const lastName = parts[0]?.trim() || ''
      const firstFull = parts[1]?.trim() || ''
      const firstName = firstFull.split(' ')[0] || firstFull
      const full_name = `${firstFull} ${lastName}`.trim()
      const nameIdx = nonEmpty.indexOf(nameVal)
      const grade = nonEmpty.slice(nameIdx + 1).find(v => ['09','10','11','12'].includes(v)) || ''
      students.push({ id: idVal, full_name, first_name: firstName, last_name: lastName, grade, period })
    }
  }

  return { period, term, courseTitle, students, fileName }
}

function RosterImportInner() {
  const searchParams = useSearchParams()
  const teacherRoom = searchParams.get('room') || '27'

  const [stage, setStage] = useState('upload')
  const [parsedFiles, setParsedFiles] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef()

  // Help panel
  const [showHelp, setShowHelp] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [helpPos, setHelpPos] = useState({ x: null, y: null })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef({ x: 0, y: 0 })

  const startHelpDrag = useCallback((e) => {
    const panel = helpPanelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    helpDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const onMove = (ev) => setHelpPos({ x: ev.clientX - helpDragOffset.current.x, y: ev.clientY - helpDragOffset.current.y })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const helpItems = [
    { q: 'What is this page for?', keys: 'overview what roster import', a: 'This is where you import your class rosters from Aeries into PassAble. Once imported, your students appear on your Relay Station so you can issue passes to them. You only need to do this at the start of the year or when your roster changes.' },
    { q: 'What file format do I need?', keys: 'file format xlsx aeries export', a: 'XLSX files exported from Aeries. Go to Attendance → Class Roster in Aeries, then export each class period as a separate XLSX file. PassAble reads the period number and student list automatically from the Aeries format.' },
    { q: 'Can I import multiple periods at once?', keys: 'multiple periods at once files', a: 'Yes — select all your roster files at once when browsing (or drop them all together). PassAble will parse each file, detect the period number automatically, and import them all in one go.' },
    { q: 'Will this overwrite my existing students?', keys: 'overwrite existing delete replace upsert', a: 'It\'s an upsert — existing students are updated, new ones are added. Students already in the system won\'t be deleted. If a student was removed from your Aeries roster, they won\'t be removed from PassAble automatically; contact your admin to remove them via Manage Students.' },
    { q: 'What does the Room number do?', keys: 'room number what does it do', a: 'It ties each imported student to your room so PassAble knows which teacher they belong to. This comes from the link your admin gave you — it should already be set correctly. If you share a room with another teacher, each of you imports your own roster with your own room number.' },
    { q: 'My file says "No student data found" — why?', keys: 'error no student data not working', a: 'Usually means the export format is off. Make sure you\'re exporting from Attendance → Class Roster (not Gradebook or another section), and that the file is a proper XLSX (not CSV or XLS). Re-export from Aeries and try again.' },
    { q: 'What if I imported the wrong period?', keys: 'wrong period mistake undo fix', a: 'Contact your admin — they can remove or edit students from the Manage Students page and you can re-import the correct file. Importing again with the right file will update existing records but won\'t remove any extras that shouldn\'t be there.' },
  ]

  function renderHelpPanel() {
    if (!showHelp) return null
    const q = helpSearch.toLowerCase().trim()
    const filtered = q ? helpItems.filter(i => i.q.toLowerCase().includes(q) || i.keys.includes(q)) : helpItems
    return (
      <div ref={helpPanelRef} style={{ position: 'fixed', top: helpPos.y !== null ? helpPos.y : 80, left: helpPos.x !== null ? helpPos.x : 'auto', right: helpPos.x !== null ? 'auto' : 24, width: 360, maxHeight: '80vh', background: 'white', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `2px solid ${RHS_GREEN}` }}>
        <div onMouseDown={startHelpDrag} style={{ background: RHS_GREEN, padding: '12px 16px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Roster Import Help</span>
          <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <input value={helpSearch} onChange={e => setHelpSearch(e.target.value)} placeholder="Search help…" style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
          {filtered.length === 0 && <div style={{ padding: '16px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No results for "{helpSearch}"</div>}
          {filtered.map((item, i) => (
            <details key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <summary style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1f2937', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {item.q}<span style={{ color: '#9ca3af', fontSize: 16, marginLeft: 8 }}>›</span>
              </summary>
              <div style={{ padding: '0 16px 12px', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    )
  }

  function processFiles(files) {
    const results = []
    const errors = []
    let pending = files.length

    Array.from(files).forEach(file => {
      if (!file.name.endsWith('.xlsx')) {
        errors.push(`${file.name} is not an XLSX file`)
        pending--
        if (pending === 0) finalize(results, errors)
        return
      }
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const parsed = parseAeriesXLSX(workbook, file.name)
          if (!parsed.period || parsed.students.length === 0) {
            errors.push(`${file.name}: No student data found`)
          } else {
            results.push(parsed)
          }
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`)
        }
        pending--
        if (pending === 0) finalize(results, errors)
      }
      reader.readAsArrayBuffer(file)
    })
  }

  function finalize(results, errors) {
    if (results.length === 0) {
      setErrorMsg(errors.join('\n') || 'No valid roster files found.')
      setStage('error')
      return
    }
    results.sort((a, b) => parseInt(a.period) - parseInt(b.period))
    setParsedFiles(results)
    if (errors.length > 0) setErrorMsg(errors.join('\n'))
    setStage('preview')
  }

  function handleFileInput(e) {
    if (e.target.files?.length) processFiles(e.target.files)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files)
  }

  async function handleImportAll() {
    setStage('importing')
    let totalImported = 0
    let totalErrors = 0
    const batchSize = 50

    for (const file of parsedFiles) {
      const studentRows = file.students.map(s => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        full_name: s.full_name,
        grade: s.grade,
        period: s.period,
      }))

      for (let i = 0; i < studentRows.length; i += batchSize) {
        const batch = studentRows.slice(i, i + batchSize)
        const { error } = await supabase
          .from('students')
          .upsert(batch, { onConflict: 'id,period' })
        if (error) {
          console.error('Students upsert error:', JSON.stringify(error))
          totalErrors += batch.length
        } else {
          totalImported += batch.length
        }
      }

      // Also upsert student_periods for room-scoped lookups
      const periodRows = file.students.map(s => ({
        student_id: s.id,
        period: s.period,
        room: teacherRoom,
      }))

      for (let i = 0; i < periodRows.length; i += batchSize) {
        const batch = periodRows.slice(i, i + batchSize)
        const { error } = await supabase
          .from('student_periods')
          .upsert(batch, { onConflict: 'student_id,period,room' })
        if (error) console.error('student_periods upsert error:', JSON.stringify(error))
      }
    }

    const totalStudents = parsedFiles.reduce((sum, f) => sum + f.students.length, 0)
    setImportResult({ total: totalStudents, imported: totalImported, errors: totalErrors, files: parsedFiles })
    setStage('success')
  }

  function reset() {
    setStage('upload')
    setParsedFiles([])
    setImportResult(null)
    setErrorMsg('')
    setExpandedIdx(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalStudents = parsedFiles.reduce((sum, f) => sum + f.students.length, 0)

  // ── UPLOAD ──
  if (stage === 'upload') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-10 h-10 object-contain" />
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Roster Import</h1>
            <p className="text-xs text-gray-400">RHS PassAble · Room {teacherRoom}</p>
          </div>
          <button
            onClick={() => { setShowHelp(v => !v); setHelpSearch(''); setHelpPos({ x: null, y: null }) }}
            style={{ background: showHelp ? RHS_GREEN : '#e5e7eb', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 15, fontWeight: 700, color: showHelp ? 'white' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >?</button>
        </div>

        <div
          className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors"
          style={{ borderColor: isDragging ? RHS_GREEN : RHS_GRAY, backgroundColor: isDragging ? '#f0f7f3' : 'white' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-700 font-medium mb-1">Drop your Aeries rosters here</p>
          <p className="text-gray-400 text-sm mb-3">or click to browse</p>
          <p className="text-xs text-gray-400 mb-4">Select multiple files at once — one per class period</p>
          <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#f0f7f3', color: RHS_GREEN }}>
            XLSX files only · Period auto-detected
          </span>
          <input ref={fileRef} type="file" accept=".xlsx" multiple className="hidden" onChange={handleFileInput} />
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <p className="font-medium mb-1">How to export from Aeries:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Go to Attendance → Class Roster</li>
            <li>Export each class as a separate XLSX</li>
            <li>Select all files here at once — period is read automatically</li>
          </ol>
        </div>
        <a href="/teacher" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-6">← Back to Dashboard</a>
      </div>
      {renderHelpPanel()}
    </div>
  )

  // ── PREVIEW ──
  if (stage === 'preview') return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Review Before Importing</h1>
            <p className="text-xs text-gray-400">{parsedFiles.length} roster{parsedFiles.length !== 1 ? 's' : ''} · Room {teacherRoom}</p>
          </div>
          <button
            onClick={() => { setShowHelp(v => !v); setHelpSearch(''); setHelpPos({ x: null, y: null }) }}
            style={{ background: showHelp ? RHS_GREEN : '#e5e7eb', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 15, fontWeight: 700, color: showHelp ? 'white' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >?</button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{totalStudents}</p>
            <p className="text-xs text-gray-500">total students across {parsedFiles.length} period{parsedFiles.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {parsedFiles.map(f => (
              <span key={f.period + f.term} className="text-xs px-2 py-1 rounded-full font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                P{f.period} {f.term ? `· ${f.term}` : ''}
              </span>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs whitespace-pre-line">
            ⚠ Some files were skipped:<br />{errorMsg}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {parsedFiles.map((f, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>
                    {f.period}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">Period {f.period} · {f.term}</p>
                    <p className="text-xs text-gray-400">{f.courseTitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: RHS_GREEN }}>{f.students.length} students</span>
                  <span className="text-gray-400 text-xs">{expandedIdx === idx ? '▲' : '▼'}</span>
                </div>
              </button>
              {expandedIdx === idx && (
                <div className="border-t border-gray-100 max-h-56 overflow-y-auto">
                  {f.students.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                      <span className="text-xs font-mono text-gray-500 w-16">{s.id}</span>
                      <span className="text-sm text-gray-800 flex-1">{s.full_name}</span>
                      <span className="text-xs text-gray-400">Gr {s.grade}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={reset}
            className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            style={{ borderColor: RHS_GRAY }}>
            Cancel
          </button>
          <button onClick={handleImportAll}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90"
            style={{ backgroundColor: RHS_GREEN }}>
            Import All {totalStudents} Students →
          </button>
        </div>
      </div>
      {renderHelpPanel()}
    </div>
  )

  // ── IMPORTING ──
  if (stage === 'importing') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-gray-200 rounded-full mx-auto mb-6 animate-spin" style={{ borderTopColor: RHS_GREEN }} />
        <p className="text-lg font-semibold text-gray-800">Importing rosters...</p>
        <p className="text-sm text-gray-400 mt-1">{parsedFiles.length} periods · {totalStudents} students · Room {teacherRoom}</p>
      </div>
    </div>
  )

  // ── SUCCESS ──
  if (stage === 'success') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4" style={{ backgroundColor: '#f0f7f3' }}>✅</div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Import Complete</h1>
          <p className="text-gray-500 text-sm">Room {teacherRoom} · {importResult.files.length} periods loaded</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <span className="text-gray-600 text-sm">Total students imported</span>
            <span className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{importResult.imported}</span>
          </div>
          <div className="space-y-2">
            {importResult.files.map(f => (
              <div key={f.period + f.term} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded text-xs font-bold text-white flex items-center justify-center flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>
                  {f.period}
                </span>
                <span className="text-sm text-gray-600">Period {f.period} · {f.term} · {f.courseTitle}</span>
                <span className="ml-auto text-sm font-medium text-gray-800">{f.students.length}</span>
              </div>
            ))}
          </div>
          {importResult.errors > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              ⚠ {importResult.errors} records had errors and may not have imported correctly.
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={reset}
            className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            style={{ borderColor: RHS_GRAY }}>
            Import More
          </button>
          <a href="/teacher"
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white text-center hover:opacity-90"
            style={{ backgroundColor: RHS_GREEN }}>
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  )

  // ── ERROR ──
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Could not read file</h1>
        <p className="text-gray-500 text-sm mb-6 whitespace-pre-line">{errorMsg}</p>
        <button onClick={reset} className="px-6 py-3 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
          Try Again
        </button>
      </div>
    </div>
  )
}

export default function RosterImport() {
  return (
    <Suspense>
      <RosterImportInner />
    </Suspense>
  )
}
