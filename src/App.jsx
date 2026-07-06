import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Html5QrcodeScanner } from 'html5-qrcode'
import * as XLSX from 'xlsx'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { supabase } from './supabaseClient'
import { Camera, Download, FileUp, Plus, Search, Trash2, Users } from 'lucide-react'
import './style.css'

const STAFF_NAME = 'MCEO Staff'

function playBeep(kind) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    const tones = kind === 'success' ? [880, 1175] : [220, 165]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = kind === 'success' ? 'sine' : 'square'
      osc.frequency.value = freq
      const start = now + i * 0.12
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.12)
    })
    setTimeout(() => ctx.close(), 400)
  } catch (e) { /* audio not available, ignore */ }
}

function makeQrCode(eventId, phone, name) {
  const safeName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const safePhone = String(phone || '').replace(/\D/g, '')
  return `${eventId}-${safePhone || safeName}-${crypto.randomUUID().slice(0, 8)}`
}

function normalizeRow(row) {
  const get = (...keys) => keys.map(k => row[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '') || ''
  return {
    name: String(get('name', 'Name', '姓名', '名字')).trim(),
    phone: String(get('phone', 'Phone', '电话', '手機', '手机')).trim(),
    email: String(get('email', 'Email')).trim(),
    team: String(get('team', 'Team', '团队')).trim(),
    category: String(get('category', 'Category', '类别')).trim()
  }
}

function App() {
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [attendees, setAttendees] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState(null)
  const [newEvent, setNewEvent] = useState({ event_name: '女总裁百万业绩系统', event_date: '', venue: 'MCEO Office' })
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', email: '' })

  useEffect(() => { loadEvents() }, [])
  useEffect(() => { if (eventId) loadAttendees() }, [eventId])

  async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    if (!error) {
      setEvents(data || [])
      if ((data || []).length && !eventId) setEventId(data[0].id)
    }
  }

  async function loadAttendees() {
    const { data, error } = await supabase.from('attendees').select('*').eq('event_id', eventId).order('created_at', { ascending: true })
    if (!error) setAttendees(data || [])
  }

  async function createEvent() {
    if (!newEvent.event_name.trim()) return alert('Please enter event name')
    const { data, error } = await supabase.from('events').insert(newEvent).select().single()
    if (error) return alert(error.message)
    setEvents([data, ...events])
    setEventId(data.id)
    setNotice({ type: 'success', title: 'Event created', body: data.event_name })
  }

  async function deleteEvent() {
    if (!eventId) return
    const current = events.find(e => e.id === eventId)
    const label = current ? current.event_name : 'this event'
    const sure = window.confirm(`Delete "${label}"?\n\nThis will permanently remove the event AND all its attendee/check-in records. This cannot be undone.`)
    if (!sure) return
    const { error } = await supabase.from('events').delete().eq('id', eventId)
    if (error) return alert(error.message)
    const remaining = events.filter(e => e.id !== eventId)
    setEvents(remaining)
    setEventId(remaining.length ? remaining[0].id : '')
    setAttendees([])
    setNotice({ type: 'success', title: 'Event Deleted', body: label })
  }

  const stats = useMemo(() => {
    const total = attendees.length
    const checked = attendees.filter(a => a.status === 'checked_in').length
    const walkins = attendees.filter(a => a.is_walk_in).length
    return { total, checked, remaining: total - checked, walkins, rate: total ? Math.round((checked / total) * 100) : 0 }
  }, [attendees])

  const filtered = attendees.filter(a => {
    const q = search.toLowerCase()
    return [a.name, a.phone, a.email, a.team, a.category].some(v => String(v || '').toLowerCase().includes(q))
  })

  async function checkInByQr(qrCode) {
    const { data, error } = await supabase.from('attendees').select('*').eq('qr_code', qrCode).maybeSingle()
    if (error || !data) { playBeep('error'); return setNotice({ type: 'error', title: 'QR Code Not Found', body: qrCode }) }
    if (data.status === 'checked_in') { playBeep('error'); return setNotice({ type: 'warning', title: 'Already Checked In', body: `${data.name} • ${new Date(data.check_in_time).toLocaleTimeString()}` }) }
    await manualCheckIn(data)
    playBeep('success')
  }

  async function manualCheckIn(attendee) {
    const { data, error } = await supabase.from('attendees').update({ status: 'checked_in', check_in_time: new Date().toISOString(), checked_by: STAFF_NAME }).eq('id', attendee.id).select().single()
    if (error) return alert(error.message)
    setAttendees(prev => prev.map(a => a.id === data.id ? data : a))
    setNotice({ type: 'success', title: 'CHECK-IN SUCCESS', body: `${data.name}${data.team ? ' • ' + data.team : ''}` })
  }

  async function addWalkIn() {
    if (!walkIn.name.trim()) return alert('Full name required')
    const row = { ...walkIn, team: '', category: 'Walk-in', event_id: eventId, qr_code: makeQrCode(eventId, walkIn.phone, walkIn.name), is_walk_in: true, status: 'checked_in', check_in_time: new Date().toISOString(), checked_by: STAFF_NAME }
    const { data, error } = await supabase.from('attendees').insert(row).select().single()
    if (error) return alert(error.message)
    setAttendees([...attendees, data])
    setWalkIn({ name: '', phone: '', email: '' })
    setNotice({ type: 'success', title: 'Walk-in Added', body: data.name })
  }

  async function importFile(file) {
    if (!eventId) return alert('Create/select event first')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    const payload = rows.map(normalizeRow).filter(r => r.name).map(r => ({ ...r, event_id: eventId, qr_code: makeQrCode(eventId, r.phone, r.name) }))
    if (!payload.length) return alert('No valid rows found. Need at least name column.')
    const { error } = await supabase.from('attendees').insert(payload)
    if (error) return alert(error.message)
    await loadAttendees()
    setNotice({ type: 'success', title: 'Import Complete', body: `${payload.length} attendees added` })
  }

  function exportReport() {
    const data = attendees.map(a => ({ Name: a.name, Phone: a.phone, Email: a.email, Team: a.team, Category: a.category, Status: a.status, 'Check-in Time': a.check_in_time ? new Date(a.check_in_time).toLocaleString() : '', 'Checked By': a.checked_by || '', 'Walk-in': a.is_walk_in ? 'Yes' : 'No', QR: a.qr_code }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, 'MCEO-Attendance-Report.xlsx')
  }

  async function downloadQrList() {
    if (!attendees.length) return alert('No attendees to export yet')

    // Text-only spreadsheet (safe — no giant image data crammed into cells)
    const rows = attendees.map(a => ({ Name: a.name, Phone: a.phone, Team: a.team, QR_Code: a.qr_code }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'QR Codes')
    XLSX.writeFile(wb, 'MCEO-QR-Codes.xlsx')

    // Real, individual, printable/scannable QR image files bundled into a zip
    const zip = new JSZip()
    for (const a of attendees) {
      const dataUrl = await QRCode.toDataURL(a.qr_code, { width: 500, margin: 2 })
      const base64 = dataUrl.split(',')[1]
      const safeName = String(a.name || 'attendee').trim().replace(/[^a-zA-Z0-9-_]+/g, '_')
      zip.file(`${safeName}-${a.qr_code.slice(-8)}.png`, base64, { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'MCEO-QR-Images.zip'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return <div className="app">
    <header>
      <div className="brand-row"><img src="/logo.png" alt="MCEO" className="logo" /><h1>Event Check-In</h1></div>
      <div className="event-select-row">
        <select value={eventId} onChange={e => setEventId(e.target.value)}>{events.map(e => <option key={e.id} value={e.id}>{e.event_name}</option>)}</select>
        {eventId && <button className="danger" onClick={deleteEvent} title="Delete this event"><Trash2 size={16}/></button>}
      </div>
    </header>

    {notice && <div className={`notice ${notice.type}`} onClick={() => setNotice(null)}><b>{notice.title}</b><span>{notice.body}</span></div>}

    <nav>
      <button onClick={() => setActiveTab('dashboard')}>Dashboard</button>
      <button onClick={() => setActiveTab('scan')}>Scan QR</button>
      <button onClick={() => setActiveTab('attendees')}>Attendees</button>
      <button onClick={() => setActiveTab('import')}>Import</button>
    </nav>

    {activeTab === 'dashboard' && <section>
      <div className="create-card"><input placeholder="Event name" value={newEvent.event_name} onChange={e=>setNewEvent({...newEvent,event_name:e.target.value})}/><input type="date" value={newEvent.event_date||''} onChange={e=>setNewEvent({...newEvent,event_date:e.target.value})}/><input placeholder="Venue" value={newEvent.venue||''} onChange={e=>setNewEvent({...newEvent,venue:e.target.value})}/><button onClick={createEvent}><Plus size={16}/> Create Event</button></div>
      <div className="cards"><Stat icon={<Users/>} label="Registered" value={stats.total}/><Stat label="Checked In" value={stats.checked}/><Stat label="Remaining" value={stats.remaining}/><Stat label="Walk-ins" value={stats.walkins}/><Stat label="Attendance" value={`${stats.rate}%`}/></div>
      <div className="actions"><button onClick={() => setActiveTab('scan')}><Camera size={18}/> Scan QR</button><button onClick={exportReport}><Download size={18}/> Export Report</button><button onClick={downloadQrList}><Download size={18}/> Export QR List</button></div>
    </section>}

    {activeTab === 'scan' && <Scanner onScan={checkInByQr} />}

    {activeTab === 'attendees' && <section><div className="search"><Search size={18}/><input placeholder="Search name / phone / team" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="walkin"><h3>Add Walk-in</h3><input placeholder="Full Name" value={walkIn.name} onChange={e=>setWalkIn({...walkIn,name:e.target.value})}/><input placeholder="Phone Number" value={walkIn.phone} onChange={e=>setWalkIn({...walkIn,phone:e.target.value})}/><input placeholder="Email Address" value={walkIn.email} onChange={e=>setWalkIn({...walkIn,email:e.target.value})}/><button onClick={addWalkIn}>Add + Check-in</button></div><div className="list">{filtered.map(a => <div className="row" key={a.id}><div><b>{a.name}</b><small>{a.phone} {a.team ? `• ${a.team}` : ''}</small></div><span className={a.status}>{a.status === 'checked_in' ? 'Checked In' : 'Pending'}</span>{a.status !== 'checked_in' && <button onClick={()=>manualCheckIn(a)}>Check In</button>}</div>)}</div></section>}

    {activeTab === 'import' && <section className="import"><FileUp size={42}/><h2>Import Excel / CSV</h2><p>Columns: name, phone, email, team, category</p><input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}/></section>}
  </div>
}

function Stat({ label, value, icon }) { return <div className="stat">{icon}<span>{label}</span><b>{value}</b></div> }

function Scanner({ onScan }) {
  const lastScan = useRef({ code: null, time: 0 })

  useEffect(() => {
    const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
      const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.9)
      return { width: size, height: size }
    }
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: qrboxFunction, aspectRatio: 1 }, false)
    scanner.render(decoded => {
      const now = Date.now()
      const isSameCodeStillInView = decoded === lastScan.current.code && (now - lastScan.current.time) < 3000
      if (isSameCodeStillInView) return
      lastScan.current = { code: decoded, time: now }
      onScan(decoded)
    }, () => {})
    return () => { scanner.clear().catch(() => {}) }
  }, [])
  return <section><h2>Scan Participant QR</h2><div id="reader"></div></section>
}

createRoot(document.getElementById('root')).render(<App />)
