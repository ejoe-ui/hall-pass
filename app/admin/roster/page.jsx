'use client'
import { useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'
const RHS_GRAY = '#C4BEB5'

// ── Change this to pull from teacher session when multi-teacher is live ──
const TEACHER_ROOM = '27'

function parseAeriesXLSX(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true })

  const classes = []
  let inStudents = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = row.map(c => String(c || '').trim())
    const nonEmpty = cells.filter(c => c !== '')
    if (nonEmpty.length === 0) continue
    const vals = nonEmpty

    if (vals.some(v => v.includes('Riverdale'))) { inStudents = false; continue }

    const periodVal = vals.find(v => /^[146]$/.test(v))
    const courseVal = vals.find(v => v.includes('ROP'))
    if (periodVal && courseVal && !inStudents) {
      classes.push({ period: periodVal, course: courseVal, students: [] })
      inStudents = false
      continue
    }

    if (vals.some(v => v === 'Student ID')) { inStudents = true; continue }

    if (inStudents && classes.length > 0) {
      const idVal = vals.find(v => /^\d{6}$/.test(v))
      const nameVal = vals.find(v => v.includes(',') && v.length > 3 && !/^\d/.test(v))
      if (idVal && nameVal) {
        classes[classes.length - 1].students.push({
          id: idVal,
          full_name: nameVal.includes(',') ? `${nameVal.split(',')[1].trim()} ${nameVal.split(',')[0].trim()}` : nameVal,
          first_name: nameVal.split(',')[1]?.trim().split(' ')[0] || nameVal,
          last_name: nameVal.split(',')[0]?.trim() || nameVal,
          grade: (() => { const nameIdx = vals.indexOf(nameVal); return vals.slice(nameIdx + 1).find(v => v === '11' || v === '12' || v === '10' || v === '09') || '' })(),
          period: classes[classes.length - 1].period,
        })
      }
    }
  }

  return classes.filter(c => c.students.length > 0)
}

export default function RosterImport() {
  const [stage, setStage] = useState('upload')
  const [classes, setClasses] = useState([])
  const [expanded, setExpanded] = useState({})
  const [importResult, setImportResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const parsed = parseAeriesXLSX(workbook)
        if (parsed.length === 0) {
          setErrorMsg('No student data found. Make sure this is an Aeries Attendance Class Roster exported as XLSX.')
          setStage('error')
          return
        }
        setClasses(parsed)
        setStage('preview')
      } catch (err) {
        setErrorMsg('Could not read file: ' + err.message)
        setStage('error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function toggleExpand(period) {
    setExpanded(prev => ({ ...prev, [period]: !prev[period] }))
  }

  async function handleImport() {
    setStage('importing')
    const allStudents = classes.flatMap(c => c.students)
    let imported = 0
    let errors = 0
    const batchSize = 50

    // ── Step 1: Upsert student records (one row per student, no period column) ──
    // onConflict on 'id' only — prevents duplicate student rows for multi-period students
    const studentRows = allStudents.map(s => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      full_name: s.full_name,
      period: s.period, // kept for legacy compatibility, reflects primary period
    }))

    for (let i = 0; i < studentRows.length; i += batchSize) {
      const batch = studentRows.slice(i, i + batchSize)
      const { error } = await supabase
        .from('students')
        .upsert(batch, { onConflict: 'id' })
      if (error) {
        console.error('Students upsert error:', JSON.stringify(error))
        errors += batch.length
      } else {
        imported += batch.length
      }
    }

    // ── Step 2: Upsert student_periods rows ──
    // Each student gets a row per period+room combo — safe to re-run, won't duplicate
    const periodRows = allStudents.map(s => ({
      student_id: s.id,
      period: s.period,
      room: TEACHER_ROOM,
    }))

    for (let i = 0; i < periodRows.length; i += batchSize) {
      const batch = periodRows.slice(i, i + batchSize)
      const { error } = await supabase
        .from('student_periods')
        .upsert(batch, { onConflict: 'student_id,period,room' })
      if (error) {
        console.error('student_periods upsert error:', JSON.stringify(error))
        // Don't count as errors since students already inserted — just log
      }
    }

    setImportResult({
      total: allStudents.length,
      imported,
      errors,
      periods: classes.map(c => ({ period: c.period, course: c.course, count: c.students.length })),
    })
    setStage('success')
  }

  function reset() {
    setStage('upload')
    setClasses([])
    setExpanded({})
    setImportResult(null)
    setErrorMsg('')
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalStudents = classes.reduce((sum, c) => sum + c.students.length, 0)

  if (stage === 'upload') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: RHS_GREEN }}>Roster Import</h1>
            <p className="text-xs text-gray-400">RHS PassAble · Room 27</p>
          </div>
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
          <p className="text-gray-400 text-sm mb-4">or click to browse</p>
          <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#f0f7f3', color: RHS_GREEN }}>
            XLSX files only
          </span>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </div>
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <p className="font-medium mb-1">How to export from Aeries:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Go to Attendance → Class Roster</li>
            <li>Select your classes</li>
            <li>Export → Download as XLSX</li>
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
            <p className="text-xs text-gray-400">{fileName}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{totalStudents}</p>
            <p className="text-xs text-gray-500">total students across {classes.length} class{classes.length !== 1 ? 'es' : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{classes.length} period{classes.length !== 1 ? 's' : ''} found</p>
            <p className="text-xs text-gray-400">Existing records will be updated</p>
          </div>
        </div>
        <div className="space-y-3 mb-6">
          {classes.map(cls => (
            <div key={cls.period} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(cls.period)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                    {cls.period}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{cls.course}</p>
                    <p className="text-xs text-gray-400">Period {cls.period}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: RHS_GREEN }}>{cls.students.length} students</span>
                  <span className="text-gray-400 text-xs">{expanded[cls.period] ? '▲' : '▼'}</span>
                </div>
              </button>
              {expanded[cls.period] && (
                <div className="border-t border-gray-100 max-h-48 overflow-y-auto">
                  {cls.students.map((s, i) => (
                    <div key={s.id + s.period} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
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
          <button onClick={reset} className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50" style={{ borderColor: RHS_GRAY }}>
            Cancel
          </button>
          <button onClick={handleImport} className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90" style={{ backgroundColor: RHS_GREEN }}>
            Import {totalStudents} Students →
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
        <p className="text-sm text-gray-400 mt-1">Adding {totalStudents} students to Supabase</p>
      </div>
    </div>
  )

  if (stage === 'success') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4" style={{ backgroundColor: '#f0f7f3' }}>✅</div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Import Complete</h1>
          <p className="text-gray-500 text-sm">Your roster has been loaded into RHS PassAble</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <span className="text-gray-600 text-sm">Total students imported</span>
            <span className="text-2xl font-bold" style={{ color: RHS_GREEN }}>{importResult.total}</span>
          </div>
          <div className="space-y-2">
            {importResult.periods.map(p => (
              <div key={p.period} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded text-xs font-bold text-white flex items-center justify-center" style={{ backgroundColor: RHS_GREEN }}>{p.period}</span>
                  <span className="text-sm text-gray-600">{p.course}</span>
                </div>
                <span className="text-sm font-medium text-gray-800">{p.count} students</span>
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
          <button onClick={reset} className="flex-1 py-3 rounded-xl border-2 text-sm font-medium text-gray-600 hover:bg-gray-50" style={{ borderColor: RHS_GRAY }}>
            Import Another
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
