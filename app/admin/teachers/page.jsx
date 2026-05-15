'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'

const RHS_GREEN = '#006938'

export default function TeacherAdmin() {
  const [session, setSession] = useState(null)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [inviting, setInviting] = useState({})
  const [importPreview, setImportPreview] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  const emptyForm = { name: '', email: '', room: '', department: '', pin: '', is_admin: false, is_active: true, periods: ['1','4','6'], period_labels: {} }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) { loadCurrentTeacher(); loadTeachers() }
  }, [session])

  async function loadCurrentTeacher() {
    const { data } = await supabase.from('teachers').select('*').eq('auth_id', session.user.id).single()
    setCurrentTeacher(data)
  }

  async function loadTeachers() {
    setLoading(true)
    const { data } = await supabase.from('teachers').select('*').order('name', { ascending: true })
    setTeachers(data || [])
    setLoading(false)
  }

  async function handleSave() {
    setError(null); setSuccess(null)
    if (!form.name || !form.email) { setError('Name and email are required.'); return }
    setSaving(true)
    if (editingTeacher) {
      const { error } = await supabase.from('teachers')
        .update({ name: form.name, email: form.email, room: form.room, department: form.department, pin: form.pin, is_admin: form.is_admin, is_active: form.is_active, periods: form.periods, period_labels: form.period_labels })
        .eq('id', editingTeacher.id)
      if (error) { setError(error.message); setSaving(false); return }
      setSuccess(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('teachers')
        .insert({ name: form.name, email: form.email, room: form.room, department: form.department, pin: form.pin, is_admin: form.is_admin, is_active: form.is_active, periods: form.periods, period_labels: form.period_labels })
      if (error) { setError(error.message); setSaving(false); return }
      setSuccess(`${form.name} added. Use Send Invite to send them a sign-in link.`)
    }
    setSaving(false); setShowForm(false); setEditingTeacher(null); setForm(emptyForm)
    loadTeachers()
  }

  function handleEdit(teacher) {
    setEditingTeacher(teacher)
    setForm({ name: teacher.name, email: teacher.email, room: teacher.room || '', department: teacher.department || '', pin: teacher.pin || '', is_admin: teacher.is_admin, is_active: teacher.is_active, periods: teacher.periods || ['1','4','6'], period_labels: teacher.period_labels || {} })
    setShowForm(true); setError(null); setSuccess(null)
  }

  function handleCancel() {
    setShowForm(false); setEditingTeacher(null); setForm(emptyForm); setError(null)
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
    if (error) {
      setInviting(prev => ({ ...prev, [teacher.id]: 'error' }))
    } else {
      setInviting(prev => ({ ...prev, [teacher.id]: 'sent' }))
    }
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
    setImporting(true); setError(null)
    const existingEmails = teachers.map(t => t.email.toLowerCase())
    const toInsert = importPreview.filter(r => !existingEmails.includes(r.email.toLowerCase()))
    const skipped = importPreview.length - toInsert.length
    if (toInsert.length === 0) {
      setError('All emails already exist — nothing to import.')
      setImporting(false); return
    }
    const rows = toInsert.map(({ _row, ...r }) => r)
    const { error } = await supabase.from('teachers').insert(rows)
    if (error) {
      setError(`Import failed: ${error.message}`)
    } else {
      setSuccess(`✅ Imported ${toInsert.length} teacher${toInsert.length !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} skipped (already exist)` : ''}. Use ✉️ Invite to send sign-in links.`)
      setShowImport(false); setImportPreview([]); setImportErrors([])
      if (fileRef.current) fileRef.current.value = ''
      loadTeachers()
    }
    setImporting(false)
  }

  function handleCancelImport() {
    setShowImport(false); setImportPreview([]); setImportErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 16 }}>
      <h1 style={{ color: RHS_GREEN, fontWeight: 700, fontSize: 24 }}>Teacher Admin</h1>
      <p style={{ color: '#6b7280' }}>Sign in to manage teachers</p>
      <a href="/teacher" style={{ color: RHS_GREEN, textDecoration: 'none', fontSize: 14 }}>← Go to Teacher Login</a>
    </div>
  )

  if (!loading && currentTeacher && !currentTeacher.is_admin) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🚫</div>
      <h1 style={{ color: '#1f2937', fontWeight: 700, fontSize: 20 }}>Admin Access Only</h1>
      <a href="/teacher" style={{ color: RHS_GREEN, textDecoration: 'none', fontSize: 14 }}>← Back to Dashboard</a>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: RHS_GREEN, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/RHSCOWBOYlogo.png" alt="RHS" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 style={{ color: 'white', fontWeight: 700, fontSize: 18, margin: 0 }}>Teacher Management</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>RHS PassAble · Admin</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/admin" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>← Admin</a>
          <a href="/teacher" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>Dashboard</a>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>

        {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>⚠️ {error}</div>}
        {success && <div style={{ background: '#f0fdf4', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>{success}</div>}

        {!showForm && !showImport && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 16 }}>
            <button onClick={() => { setShowImport(true); setError(null); setSuccess(null) }}
              style={{ background: 'white', color: RHS_GREEN, border: `1px solid ${RHS_GREEN}`, borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              📥 Import from Excel
            </button>
            <button onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
              style={{ background: RHS_GREEN, color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + Add Teacher
            </button>
          </div>
        )}

        {/* Excel Import */}
        {showImport && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb', marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>📥 Import from Excel</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
              Upload a .xlsx file with columns: <strong>name, email, room, department, pin, admin</strong><br />
              Only name and email are required. Duplicate emails are skipped.
            </p>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#166534' }}>
              💡 Column headers are flexible — "Full Name", "name", "fullname" all work.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ marginBottom: 16, fontSize: 13 }} />

            {importErrors.length > 0 && (
              <div style={{ background: '#FEF3C7', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#92400E' }}>⚠ Some rows will be skipped:</p>
                {importErrors.map((e, i) => <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#92400E' }}>{e}</p>)}
              </div>
            )}

            {importPreview.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>
                  Preview — {importPreview.length} teacher{importPreview.length !== 1 ? 's' : ''} ready to import:
                </p>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Name', 'Email', 'Room', 'Dept', 'Admin'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 8).map((r, i) => (
                        <tr key={i} style={{ borderBottom: i < Math.min(importPreview.length, 8) - 1 ? '1px solid #f3f4f6' : 'none' }}>
                          <td style={{ padding: '8px 12px', color: '#1f2937' }}>{r.name}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.email}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.room || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.department || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.is_admin ? '✅' : '—'}</td>
                        </tr>
                      ))}
                      {importPreview.length > 8 && (
                        <tr><td colSpan={5} style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 11 }}>...and {importPreview.length - 8} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelImport}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
                Cancel
              </button>
              <button onClick={handleImportConfirm} disabled={importPreview.length === 0 || importing}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: RHS_GREEN, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: importPreview.length === 0 || importing ? 0.5 : 1 }}>
                {importing ? 'Importing...' : `Import ${importPreview.length} Teacher${importPreview.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Add / Edit Form */}
        {showForm && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb', marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>
              {editingTeacher ? `Edit — ${editingTeacher.name}` : 'Add New Teacher'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                { label: 'Full Name *', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email *', key: 'email', placeholder: 'jsmith@rjusd.org' },
                { label: 'Room', key: 'room', placeholder: '27' },
                { label: 'Department', key: 'department', placeholder: 'CTE' },
                { label: 'PIN (optional)', key: 'pin', placeholder: '4-digit PIN' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_admin} onChange={e => setForm(prev => ({ ...prev, is_admin: e.target.checked }))} />
                  Admin access
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))} />
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
                            setForm(prev => ({
                              ...prev,
                              periods: e.target.checked
                                ? [...periods, p].sort()
                                : periods.filter(x => x !== p)
                            }))
                          }} />
                        <span className="text-xs text-gray-600">P{p}</span>
                      </label>
                    ))}
                  </div>
                  {/* Custom display labels for each selected period */}
                  {(form.periods || []).length > 0 && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-2">
                        Kiosk Display Labels <span className="font-normal text-gray-400">(optional — e.g. "Periods 1 & 2")</span>
                      </label>
                      <div className="space-y-1.5">
                        {(form.periods || []).sort().map(p => (
                          <div key={p} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-6">P{p}</span>
                            <input
                              type="text"
                              placeholder={`Period ${p}`}
                              value={(form.period_labels || {})[p] || ''}
                              onChange={e => setForm(prev => ({
                                ...prev,
                                period_labels: { ...(prev.period_labels || {}), [p]: e.target.value }
                              }))}
                              className="flex-1 p-1.5 text-xs border rounded-lg bg-white text-gray-800 border-gray-200"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 hidden">
                  Active
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleCancel}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: RHS_GREEN, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editingTeacher ? 'Save Changes' : 'Add Teacher'}
              </button>
            </div>
          </div>
        )}

        {/* Teacher List */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
              Teachers <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>({teachers.length})</span>
            </h2>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
          ) : teachers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No teachers yet</div>
          ) : teachers.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: i < teachers.length - 1 ? '1px solid #f3f4f6' : 'none', opacity: t.is_active ? 1 : 0.5 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: t.is_admin ? '#FEF3C7' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {t.is_admin ? '⭐' : '👤'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {t.name}
                  {t.is_admin && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#FEF3C7', color: '#D97706' }}>ADMIN</span>}
                  {!t.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f3f4f6', color: '#9ca3af' }}>INACTIVE</span>}
                  {!t.auth_id && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#FEE2E2', color: '#DC2626' }}>NO AUTH</span>}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.email}{t.room ? ` · Room ${t.room}` : ''}{t.department ? ` · ${t.department}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => handleSendInvite(t)} disabled={!!inviting[t.id]}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500,
                    cursor: inviting[t.id] ? 'default' : 'pointer',
                    background: inviting[t.id] === 'sent' ? '#f0fdf4' : inviting[t.id] === 'error' ? '#FEE2E2' : '#EFF6FF',
                    color: inviting[t.id] === 'sent' ? '#166534' : inviting[t.id] === 'error' ? '#DC2626' : '#1D4ED8',
                  }}>
                  {inviting[t.id] === 'sending' ? 'Sending...' : inviting[t.id] === 'sent' ? '✓ Sent' : inviting[t.id] === 'error' ? 'Failed' : '✉️ Invite'}
                </button>
                <button onClick={() => handleEdit(t)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                  Edit
                </button>
                <button onClick={() => handleToggleActive(t)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: t.is_active ? '#FEE2E2' : '#f0fdf4', fontSize: 12, cursor: 'pointer', color: t.is_active ? '#DC2626' : '#166534', fontWeight: 500 }}>
                  {t.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, fontSize: 12, color: '#166534' }}>
          💡 After adding a teacher, click <strong>✉️ Invite</strong> to send them a magic sign-in link. Their account links automatically on first sign-in.
        </div>
      </div>
    </div>
  )
}
