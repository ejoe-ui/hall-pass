'use client'
import { useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'
const RHS_GRAY = '#C4BEB5'

const ALL_PERIODS = [
  { label: 'Period 1', value: '1' },
  { label: 'Period 2', value: '2' },
  { label: 'Period 3', value: '3' },
  { label: 'Period 4', value: '4' },
  { label: 'Period 5', value: '5' },
  { label: 'Period 6', value: '6' },
  { label: 'Period 7', value: '7' },
]

// ── Simplified parser — one period at a time ──────────────────────────────
// Looks for "Student ID" header row — works for any course name, any teacher.
function parseAeriesXLSX(workbook, period) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true })

  const students = []
  let inStudents = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = row.map(c => String(c || '').trim())
    const nonEmpty = cells.filter(c => c !== '')
    if (nonEmpty.length === 0) continue

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

  return students
}

function RosterImportInner() {
  const searchParams = useSearchParams()
  const teacherRoom = searchParams.get('room') || '27'
  const teacherId = searchParams.get('teacher_id') || null

  const [stage, setStage] = useState('upload')
  const [selectedPeriod, setSelectedPeriod] = useState('1')
  const [students, setStudents] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  const periodLabel = ALL_PERIODS.find(p => p.value === selectedPeriod)?.label

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const parsed = parseAeriesXLSX(workbook, selectedPeriod)
        if (parsed.length === 0) {
          setErrorMsg('No student data found. Make sure this is an Aeries Class Roster exported as XLSX and that it contains a "Student ID" column.')
          setStage('error')
          return
        }
        setStudents(parsed)
        setStage('preview')
      } catch (err) {
        setErrorMsg('Could not read file: ' + err.message)
        setStage('error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setStage('importing')
    let imported = 0
    let errors = 0
    const batchSize = 50

    // Step 1: Upsert students
    const studentRows = students.map(s => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      full_name: s.full_name,
      period: s.period,
    }))

    for (let i = 0; i < studentRows.length; i += batchSize) {
      const batch = studentRows.slice(i, i + batchSize)
      const { error } = await supabase.from('students').upsert(batch, { onConflict: 'id' })
      if (error) { console.error('Students upsert error:', JSON.stringify(error)); errors += batch.length }
      else imported += batch.length
    }

    // Step 2: Upsert student_periods — scoped to this teacher's room
    const periodRows = students.map(s => ({
      student_id: s.id,
      period: selectedPeriod,
      room: teacherRoom,
    }))

    for (let i = 0; i < periodRows.length; i += batchSize) {
      const batch = periodRows.slice(i, i + batchSize)
      const { error } = await supabase.from('student_periods').upsert(batch, { onConflict: 'student_id,period,room' })
      if (error) console.error('student_periods upsert error:', JSON.stringify(error))
    }

    setImportResult({ total: students.length, imported, errors, period: selectedPeriod })
    setStage('success')
  }

  function reset() {
    setStage('upload')
    setStudents([])
    setExpanded(false)
    setImportResult(null)
    setErrorMsg('')
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

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

        {/* Period selector */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Which period is this roster for?</p>
          <div className="grid grid-cols-4 gap-2">
            {ALL_PERIODS.map(p => (
              <button key={p.value} onClick={() => setSelectedPeriod(p.value)}
                className="py-2.5 text-sm font-medium rounded-xl border-2 transition-colors"
                style={selectedPeriod === p.value
                  ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
                  : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
                P{p.value}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Import one period at a time. Repeat for each class.</p>
        </div>

        <div
          className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer hover:bg-green-50 transition-colors"
          style={{ borderColor: RHS_GRAY }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFile({ target: { files: [file] } }) }}
        >
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-700 font-medium mb-1">Drop your Aeries roster here</p>
          <p className="text-gray-400 text-sm mb-1">or click to browse</p>
          <p className="text-xs mb-4" style={{ color: RHS_GREEN }}>
            Importing: <strong>{periodLabel}</strong> · Room {teacherRoom}
          </p>
          <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#f0f7f3', color: RHS_GREEN }}>
            XLSX files only
          </span>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <p className="font-medium mb-1">How to export from Aeries:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Go to Attendance → Class Roster</li>
            <li>Select one class at a time</li>
            <li>Export → Download as XLSX</li>
            <li>Come back here and repeat for each period</li>
          </ol>
        </div>
        <a href="/teacher" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-6">← Back to Dashboard</a>
      </div>
    </div>
  )

  if (stage === 'preview') return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Review Before Importing</h1>
            <p className="text-xs text-gray-400">{fileName} · {periodLabel} · Room {teacherRoom}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{students.length}</p>
            <p className="text-xs text-gray-500">students found for {periodLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Existing records will be updated</p>
            <p className="text-xs text-gray-400">New students will be added</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(e => !e)}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                {selectedPeriod}
              </span>
              <span className="text-sm font-medium text-gray-800">{periodLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: RHS_GREEN }}>{students.length} students</span>
              <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
            </div>
          </button>
          {expanded && (
            <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
              {students.map((s, i) => (
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

        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50" style={{ borderColor: RHS_GRAY }}>
            Cancel
          </button>
          <button onClick={handleImport} className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90" style={{ backgroundColor: RHS_GREEN }}>
            Import {students.length} Students →
          </button>
        </div>
      </div>
    </div>
  )

  if (stage === 'importing') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-gray-200 rounded-full mx-auto mb-6 animate-spin" style={{ borderTopColor: RHS_GREEN }} />
        <p className="text-lg font-semibold text-gray-800">Importing roster...</p>
        <p className="text-sm text-gray-400 mt-1">Adding {students.length} students for {periodLabel} · Room {teacherRoom}</p>
      </div>
    </div>
  )

  if (stage === 'success') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4" style={{ backgroundColor: '#f0f7f3' }}>✅</div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Import Complete</h1>
          <p className="text-gray-500 text-sm">{periodLabel} · Room {teacherRoom} loaded into RHS PassAble</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <span className="text-gray-600 text-sm">Students imported</span>
            <span className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{importResult.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded text-xs font-bold text-white flex items-center justify-center" style={{ backgroundColor: RHS_GREEN }}>
              {importResult.period}
            </span>
            <span className="text-sm text-gray-600">{periodLabel} · Room {teacherRoom}</span>
            <span className="ml-auto text-sm font-medium text-gray-800">{importResult.total} students</span>
          </div>
          {importResult.errors > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              ⚠ {importResult.errors} records had errors and may not have imported correctly.
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50" style={{ borderColor: RHS_GRAY }}>
            Import Another Period
          </button>
          <a href="/teacher" className="flex-1 py-3 rounded-xl text-sm font-bold text-white text-center hover:opacity-90" style={{ backgroundColor: RHS_GREEN }}>
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Could not read file</h1>
        <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
        <button onClick={reset} className="px-6 py-3 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>Try Again</button>
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
