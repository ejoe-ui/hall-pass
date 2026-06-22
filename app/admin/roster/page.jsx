/*
  PassAble — RHS Hall Pass System
  FILE:    app/admin/roster/page.jsx
  ROUTE:   /admin/roster?room=XX
  PURPOSE: Teacher roster import from Aeries XLSX. Detects dropped students
           (on current roster but missing from new import) and offers to
           remove them with teacher confirmation before any deletions occur.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students, student_periods tables)
  UPDATED: 2026-06-21
*/

'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
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

  // Dropped student state
  const [droppedStudents, setDroppedStudents] = useState([])   // [{id, full_name, period}]
  const [removeDropped, setRemoveDropped] = useState(false)    // teacher confirmed removal
  const [checkingDiff, setCheckingDiff] = useState(false)

  const fileRef = useRef()

  // After parsedFiles are set, check DB for dropped students
  useEffect(() => {
    if (parsedFiles.length === 0 || stage !== 'preview') return
    checkDropped()
  }, [parsedFiles, stage])

  async function checkDropped() {
    setCheckingDiff(true)
    setDroppedStudents([])
    setRemoveDropped(false)

    // All student IDs in the incoming files
    const incomingIds = new Set(parsedFiles.flatMap(f => f.students.map(s => s.id)))

    // Current roster in DB for this room
    const { data: currentPeriods } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('room', teacherRoom)

    if (!currentPeriods || currentPeriods.length === 0) {
      setCheckingDiff(false)
      return
    }

    const droppedIds = [...new Set(
      currentPeriods.map(p => p.student_id).filter(sid => !incomingIds.has(sid))
    )]

    if (droppedIds.length === 0) {
      setCheckingDiff(false)
      return
    }

    // Fetch names for dropped students so we can show them
    const { data: droppedData } = await supabase
      .from('students')
      .select('id, full_name, period')
      .in('id', droppedIds)

    setDroppedStudents(droppedData || [])
    setCheckingDiff(false)
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

    // Remove dropped students from this room if teacher confirmed
    let removedCount = 0
    if (removeDropped && droppedStudents.length > 0) {
      const droppedIds = droppedStudents.map(s => s.id)
      const { error } = await supabase
        .from('student_periods')
        .delete()
        .eq('room', teacherRoom)
        .in('student_id', droppedIds)
      if (!error) removedCount = droppedIds.length
    }

    const totalStudentsIncoming = parsedFiles.reduce((sum, f) => sum + f.students.length, 0)
    setImportResult({
      total: totalStudentsIncoming,
      imported: totalImported,
      errors: totalErrors,
      removed: removedCount,
      files: parsedFiles,
    })
    setStage('success')
  }

  function reset() {
    setStage('upload')
    setParsedFiles([])
    setImportResult(null)
    setErrorMsg('')
    setExpandedIdx(null)
    setDroppedStudents([])
    setRemoveDropped(false)
    setCheckingDiff(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalStudents = parsedFiles.reduce((sum, f) => sum + f.students.length, 0)

  // ── UPLOAD ──
  if (stage === 'upload') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Roster Import</h1>
            <p className="text-xs text-gray-400">RHS PassAble · Room {teacherRoom}</p>
          </div>
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
    </div>
  )

  // ── PREVIEW ──
  if (stage === 'preview') return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Review Before Importing</h1>
            <p className="text-xs text-gray-400">{parsedFiles.length} roster{parsedFiles.length !== 1 ? 's' : ''} · Room {teacherRoom}</p>
          </div>
        </div>

        {/* Incoming summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{totalStudents}</p>
            <p className="text-xs text-gray-500">students in your new roster across {parsedFiles.length} period{parsedFiles.length !== 1 ? 's' : ''}</p>
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

        {/* Period breakdown */}
        <div className="space-y-3 mb-4">
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

        {/* Dropped students section */}
        {checkingDiff && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-gray-300 rounded-full animate-spin flex-shrink-0" style={{ borderTopColor: RHS_GREEN }} />
            <p className="text-sm text-gray-500">Checking for roster changes…</p>
          </div>
        )}

        {!checkingDiff && droppedStudents.length > 0 && (
          <div className="mb-4 bg-white rounded-xl border border-amber-300 overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {droppedStudents.length} student{droppedStudents.length !== 1 ? 's' : ''} no longer on your roster
                </p>
                <p className="text-xs text-amber-600">
                  These students are in your current class list but missing from the new import.
                  They may have transferred, dropped, or had a schedule change.
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {droppedStudents.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 flex-shrink-0">
                    {s.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <span className="text-sm text-gray-800 flex-1">{s.full_name}</span>
                  {s.period && <span className="text-xs text-gray-400">P{s.period}</span>}
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Not in new roster</span>
                </div>
              ))}
            </div>

            {/* Confirm removal toggle */}
            <div className="px-4 py-3 border-t border-amber-100 bg-amber-50">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeDropped}
                  onChange={e => setRemoveDropped(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-amber-600 flex-shrink-0"
                />
                <span className="text-xs text-amber-800 leading-relaxed">
                  <strong>Remove these {droppedStudents.length} student{droppedStudents.length !== 1 ? 's' : ''} from my class</strong> — their pass history is kept, they'll just no longer appear on my roster.
                  Leave unchecked to keep them on your roster as-is.
                </span>
              </label>
            </div>
          </div>
        )}

        {!checkingDiff && droppedStudents.length === 0 && parsedFiles.length > 0 && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
            ✓ No roster changes detected — all current students are in your new import.
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={reset}
            className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            style={{ borderColor: RHS_GRAY }}>
            Cancel
          </button>
          <button
            onClick={handleImportAll}
            disabled={checkingDiff}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: RHS_GREEN }}>
            {removeDropped && droppedStudents.length > 0
              ? `Import ${totalStudents} · Remove ${droppedStudents.length} →`
              : `Import All ${totalStudents} Students →`}
          </button>
        </div>
      </div>
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
            <span className="text-gray-600 text-sm">Students imported</span>
            <span className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{importResult.imported}</span>
          </div>
          {importResult.removed > 0 && (
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
              <span className="text-gray-600 text-sm">Dropped students removed</span>
              <span className="text-2xl font-bold text-amber-600">{importResult.removed}</span>
            </div>
          )}
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
