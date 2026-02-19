'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

interface Task { id: number; title: string; status: 'todo' | 'in_progress' | 'done'; priority: 'high' | 'medium' | 'low'; assignee: string; created_at: string }
interface Milestone { id: number; title: string; description: string; due_date: string; completed: boolean; progress: number }
interface File { id: number; name: string; url: string; uploaded_by: string; created_at: string }
interface TeamMember { id: number; email: string; role: string; created_at: string }
interface DesignNote { id: number; title: string; description: string; status: 'open' | 'in_progress' | 'resolved'; screen: string; priority: 'high' | 'medium' | 'low'; created_by: string; created_at: string }
interface FigmaEmbed { id: number; name: string; url: string; created_at: string }
interface CodeNote { id: number; title: string; description: string; code_snippet: string; file_name: string; github_url: string; expo_snack_id: string; status: 'open' | 'in_progress' | 'resolved'; priority: 'high' | 'medium' | 'low'; assignee: string; created_by: string; created_at: string }
interface CodeVersion { id: number; code_note_id: number; code_snippet: string; version: number; created_by: string; created_at: string }

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: '#6366f1' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'done', title: 'Done', color: '#10b981' }
]
const PRIORITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('board')
  const [tasks, setTasks] = useState<Task[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [designNotes, setDesignNotes] = useState<DesignNote[]>([])
  const [figmaEmbeds, setFigmaEmbeds] = useState<FigmaEmbed[]>([])
  const [codeNotes, setCodeNotes] = useState<CodeNote[]>([])
  const [codeVersions, setCodeVersions] = useState<CodeVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedTask, setDraggedTask] = useState<number | null>(null)
  const [newTask, setNewTask] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', due_date: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [newNote, setNewNote] = useState({ title: '', description: '', screen: '', priority: 'medium' as const })
  const [newFigmaUrl, setNewFigmaUrl] = useState('')
  const [newCodeNote, setNewCodeNote] = useState({ title: '', description: '', github_url: '', expo_snack_id: '', file_name: '', priority: 'medium' as const, assignee: '' })
  const [editingCode, setEditingCode] = useState<{id: number, code: string} | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { checkUser() }, [])
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/') }
    else { setUser(user); fetchData() }
  }

  const fetchData = async () => {
    setLoading(true)
    const [tasksRes, milestonesRes, filesRes, teamRes, notesRes, figmaRes, codeNotesRes, versionsRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').order('due_date', { ascending: true }),
      supabase.from('files').select('*').order('created_at', { ascending: false }),
      supabase.from('team').select('*').order('created_at', { ascending: false }),
      supabase.from('design_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('figma_embeds').select('*').order('created_at', { ascending: false }),
      supabase.from('code_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('code_versions').select('*').order('created_at', { ascending: false })
    ])
    if (tasksRes.data) setTasks(tasksRes.data)
    if (milestonesRes.data) setMilestones(milestonesRes.data)
    if (filesRes.data) setFiles(filesRes.data)
    if (teamRes.data) setTeam(teamRes.data)
    if (notesRes.data) setDesignNotes(notesRes.data)
    if (figmaRes.data) setFigmaEmbeds(figmaRes.data)
    if (codeNotesRes.data) setCodeNotes(codeNotesRes.data)
    if (versionsRes.data) setCodeVersions(versionsRes.data)
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/') }
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.trim()) return
    const { data } = await supabase.from('tasks').insert([{ title: newTask, status: 'todo', priority: taskPriority, assignee: taskAssignee || 'Unassigned' }]).select()
    if (data) setTasks([data[0], ...tasks])
    setNewTask('')
  }
  const handleDragStart = (taskId: number) => setDraggedTask(taskId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = async (status: string) => {
    if (!draggedTask) return
    await supabase.from('tasks').update({ status }).eq('id', draggedTask)
    setTasks(tasks.map(t => t.id === draggedTask ? { ...t, status: status as any } : t))
    setDraggedTask(null)
  }
  const deleteTask = async (id: number) => { await supabase.from('tasks').delete().eq('id', id); setTasks(tasks.filter(t => t.id !== id)) }
  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data } = await supabase.from('milestones').insert([{ title: newMilestone.title, description: newMilestone.description, due_date: newMilestone.due_date, completed: false, progress: 0 }]).select()
    if (data) setMilestones([...milestones, data[0]])
    setNewMilestone({ title: '', description: '', due_date: '' })
  }
  const updateMilestoneProgress = async (id: number, progress: number) => {
    await supabase.from('milestones').update({ progress, completed: progress >= 100 }).eq('id', id)
    setMilestones(milestones.map(m => m.id === id ? { ...m, progress, completed: progress >= 100 } : m))
  }
  const inviteTeamMember = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data } = await supabase.from('team').insert([{ email: inviteEmail, role: inviteRole }]).select()
    if (data) setTeam([...team, data[0]])
    setInviteEmail('')
  }
  const addDesignNote = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data } = await supabase.from('design_notes').insert([{ title: newNote.title, description: newNote.description, screen: newNote.screen, priority: newNote.priority, status: 'open', created_by: user?.email }]).select()
    if (data) setDesignNotes([data[0], ...designNotes])
    setNewNote({ title: '', description: '', screen: '', priority: 'medium' })
  }
  const updateNoteStatus = async (id: number, status: string) => {
    await supabase.from('design_notes').update({ status }).eq('id', id)
    setDesignNotes(designNotes.map(n => n.id === id ? { ...n, status: status as any } : n))
  }
  const deleteNote = async (id: number) => { await supabase.from('design_notes').delete().eq('id', id); setDesignNotes(designNotes.filter(n => n.id !== id)) }
  const addFigmaEmbed = async (e: React.FormEvent) => {
    e.preventDefault()
    const fileKeyMatch = newFigmaUrl.match(/design\/([a-zA-Z0-9]+)/)
    if (!fileKeyMatch) { alert('Invalid Figma URL'); return }
    const embedUrl = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(newFigmaUrl)}`
    const { data } = await supabase.from('figma_embeds').insert([{ name: 'Figma Design', url: embedUrl }]).select()
    if (data) setFigmaEmbeds([...figmaEmbeds, data[0]])
    setNewFigmaUrl('')
  }

  const fetchGitHubCode = async (url: string) => {
    let rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
    if (!rawUrl.includes('raw.githubusercontent.com')) { alert('Please enter a valid GitHub file URL'); return null }
    try { const res = await fetch(rawUrl); if (!res.ok) throw new Error(); return await res.text() }
    catch { alert('Could not fetch code from that URL'); return null }
  }

  const addCodeNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCodeNote.title.trim()) return
    let codeSnippet = ''
    if (newCodeNote.github_url) codeSnippet = await fetchGitHubCode(newCodeNote.github_url) || '// Could not fetch code'
    const { data } = await supabase.from('code_notes').insert([{ 
      title: newCodeNote.title, description: newCodeNote.description, code_snippet: codeSnippet, file_name: newCodeNote.file_name, github_url: newCodeNote.github_url, expo_snack_id: newCodeNote.expo_snack_id, priority: newCodeNote.priority, status: 'open', assignee: newCodeNote.assignee || 'Unassigned', created_by: user?.email 
    }]).select()
    if (data) {
      setCodeNotes([data[0], ...codeNotes])
      if (codeSnippet) await supabase.from('code_versions').insert([{ code_note_id: data[0].id, code_snippet: codeSnippet, version: 1, created_by: user?.email }])
    }
    setNewCodeNote({ title: '', description: '', github_url: '', expo_snack_id: '', file_name: '', priority: 'medium', assignee: '' })
  }

  const updateCodeNoteStatus = async (id: number, status: string) => {
    await supabase.from('code_notes').update({ status }).eq('id', id)
    setCodeNotes(codeNotes.map(n => n.id === id ? { ...n, status: status as any } : n))
  }
  const saveCodeVersion = async (noteId: number, code: string) => {
    const currentVersions = codeVersions.filter(v => v.code_note_id === noteId)
    const newVersion = currentVersions.length + 1
    await supabase.from('code_versions').insert([{ code_note_id: noteId, code_snippet: code, version: newVersion, created_by: user?.email }])
    setCodeVersions([...codeVersions, { id: Date.now(), code_note_id: noteId, code_snippet: code, version: newVersion, created_by: user?.email, created_at: new Date().toISOString() }])
  }
  const deleteCodeNote = async (id: number) => { 
    await supabase.from('code_versions').delete().eq('code_note_id', id)
    await supabase.from('code_notes').delete().eq('id', id)
    setCodeNotes(codeNotes.filter(n => n.id !== id))
  }
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const filePath = `${user?.id}/${Math.random()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('project-files').upload(filePath, file)
    if (error) { alert('Error uploading'); return }
    const { data: { publicUrl } } = supabase.storage.from('project-files').getPublicUrl(filePath)
    const { data } = await supabase.from('files').insert([{ name: file.name, url: publicUrl, uploaded_by: user?.email }]).select()
    if (data) setFiles([data[0], ...files])
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status)
  const completedTasks = tasks.filter(t => t.status === 'done').length

  const s: Record<string, React.CSSProperties> = {
    container: { background: '#000', color: '#e5e5e5', minHeight: '100vh' },
    header: { background: '#111', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' },
    logo: { fontSize: '1.25rem', fontWeight: '600' },
    userInfo: { display: 'flex', alignItems: 'center', gap: '1rem' },
    logoutBtn: { padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
    content: { padding: '1.5rem 2rem' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' },
    statCard: { background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' },
    statValue: { fontSize: '1.5rem', fontWeight: '600' },
    statLabel: { fontSize: '0.75rem', color: '#888' },
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem', flexWrap: 'wrap' },
    tab: { padding: '8px 16px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' },
    tabActive: { padding: '8px 16px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' },
    taskForm: { display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
    input: { flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', minWidth: '150px' },
    addBtn: { padding: '12px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' },
    board: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' },
    column: { background: '#0a0a0a', borderRadius: '12px', padding: '1rem', minHeight: '400px', border: '1px solid #222' },
    columnHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #222' },
    columnDot: { width: '8px', height: '8px', borderRadius: '50%' },
    columnTitle: { fontWeight: '600', fontSize: '0.875rem' },
    columnCount: { marginLeft: 'auto', background: '#222', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: '#888' },
    taskCard: { background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', cursor: 'grab', marginBottom: '0.5rem' },
    taskHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
    taskPriority: { width: '6px', height: '6px', borderRadius: '50%' },
    taskPriorityLabel: { fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' },
    deleteBtn: { marginLeft: 'auto', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' },
    taskTitle: { fontWeight: '500', marginBottom: '0.25rem' },
    taskAssignee: { fontSize: '0.75rem', color: '#666' },
    loading: { background: '#000', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    
    // Code Review - 3 columns
    codeContainer: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', minHeight: '600px' },
    codePanel: { background: '#111', borderRadius: '12px', padding: '1rem', border: '1px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    codeForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    codeBlock: { background: '#0a0a0a', padding: '0.75rem', borderRadius: '6px', fontSize: '12px', overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre', fontFamily: 'monospace' },
    codeNoteCard: { background: '#0a0a0a', padding: '1rem', borderRadius: '8px', border: '1px solid', borderLeftWidth: '4px', marginBottom: '0.75rem', flexShrink: 0 },
    codeTextarea: { background: '#0a0a0a', padding: '0.75rem', borderRadius: '6px', fontSize: '12px', width: '100%', minHeight: '200px', color: '#fff', fontFamily: 'monospace', border: '1px solid #333' },
    panelTitle: { marginBottom: '1rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' },
    versionBtn: { padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginRight: '0.5rem' },
    saveBtn: { padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginTop: '0.5rem', marginRight: '0.5rem' },
    
    // Design
    designContainer: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
    designPanel: { background: '#111', borderRadius: '12px', padding: '1rem', border: '1px solid #333' },
    sectionTitle: { marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' },
    figmaEmbed: { width: '100%', height: '400px', border: 'none', borderRadius: '8px', overflow: 'hidden' },
    previewGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
    previewItem: { background: '#222', padding: '0.5rem', borderRadius: '8px' },
    previewMedia: { width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' },
    previewName: { fontSize: '0.75rem', marginTop: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    uploadBtn: { padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', width: '100%' },
    noteForm: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' },
    notesList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' },
    noteCard: { background: '#0a0a0a', padding: '1rem', borderRadius: '8px', border: '1px solid' },
    noteHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
    noteBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '10px', textTransform: 'uppercase' },
    noteTitle: { fontWeight: '600', marginBottom: '0.25rem' },
    noteScreen: { fontSize: '0.75rem', color: '#6366f1', marginBottom: '0.25rem' },
    noteDesc: { fontSize: '0.875rem', color: '#888', marginBottom: '0.5rem' },
    noteMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#666', gap: '0.5rem', flexWrap: 'wrap' },
    noteSelect: { background: '#222', color: '#fff', border: 'none', padding: '4px', borderRadius: '4px', fontSize: '12px' },
    noteFile: { marginLeft: 'auto', fontSize: '0.75rem', color: '#666', background: '#222', padding: '2px 8px', borderRadius: '4px' },
    emptyText: { color: '#666', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' },
    milestoneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
    milestoneCard: { background: '#111', padding: '1.5rem', borderRadius: '12px', border: '1px solid' },
    progressBar: { background: '#222', height: '8px', borderRadius: '4px', margin: '1rem 0', overflow: 'hidden' },
    progressFill: { height: '100%', transition: 'width 0.3s' },
    milestoneMeta: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666' },
    filesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
    fileCard: { background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' },
    fileMeta: { fontSize: '12px', color: '#666', marginTop: '0.5rem' },
    teamList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
    teamCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '12px', background: '#111', borderRadius: '8px', border: '1px solid #333' },
    teamRole: { background: '#222', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', color: '#888', textTransform: 'capitalize' }
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.container}>
      <header style={s.header}>
        <h1 style={s.logo}>Sapien Eleven</h1>
        <div style={s.userInfo}><span>{user?.email}</span><button onClick={handleLogout} style={s.logoutBtn}>Logout</button></div>
      </header>
      <div style={s.content}>
        <div style={s.statsGrid}>
          <div style={s.statCard}><div style={s.statValue}>{tasks.length}</div><div style={s.statLabel}>Total</div></div>
          <div style={s.statCard}><div style={{...s.statValue, color: '#6366f1'}}>{getTasksByStatus('todo').length}</div><div style={s.statLabel}>To Do</div></div>
          <div style={s.statCard}><div style={{...s.statValue, color: '#f59e0b'}}>{getTasksByStatus('in_progress').length}</div><div style={s.statLabel}>In Progress</div></div>
          <div style={s.statCard}><div style={{...s.statValue, color: '#10b981'}}>{completedTasks}</div><div style={s.statLabel}>Done</div></div>
        </div>
        <div style={s.tabs}>
          {[{ id: 'board', label: 'Board' },{ id: 'code', label: 'Code Review' },{ id: 'design', label: 'Design' },{ id: 'milestones', label: 'Milestones' },{ id: 'files', label: 'Files' },{ id: 'team', label: 'Team' }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={activeTab === t.id ? s.tabActive : s.tab}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'board' && (
          <div>
            <form onSubmit={addTask} style={s.taskForm}>
              <input type="text" placeholder="Add a task..." value={newTask} onChange={e => setNewTask(e.target.value)} style={s.input} />
              <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as any)} style={s.input}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
              <input type="text" placeholder="Assignee" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={{...s.input, width: 120}} />
              <button type="submit" style={s.addBtn}>Add</button>
            </form>
            <div style={s.board}>
              {COLUMNS.map(col => (
                <div key={col.id} onDragOver={handleDragOver} onDrop={() => handleDrop(col.id)} style={s.column}>
                  <div style={s.columnHeader}><div style={{...s.columnDot, background: col.color}} /><span style={s.columnTitle}>{col.title}</span><span style={s.columnCount}>{getTasksByStatus(col.id).length}</span></div>
                  {getTasksByStatus(col.id).map(task => (
                    <div key={task.id} draggable onDragStart={() => handleDragStart(task.id)} style={s.taskCard}>
                      <div style={s.taskHeader}><span style={{...s.taskPriority, background: PRIORITY_COLORS[task.priority]}} /><span style={s.taskPriorityLabel}>{task.priority}</span><button onClick={() => deleteTask(task.id)} style={s.deleteBtn}>✕</button></div>
                      <div style={s.taskTitle}>{task.title}</div><div style={s.taskAssignee}>{task.assignee}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div style={s.codeContainer}>
            {/* Column 1: Add Code */}
            <div style={s.codePanel}>
              <h3 style={s.panelTitle}>1️⃣ Code</h3>
              <form onSubmit={addCodeNote} style={s.codeForm}>
                <input type="text" placeholder="Title" value={newCodeNote.title} onChange={e => setNewCodeNote({...newCodeNote, title: e.target.value})} style={s.input} />
                <input type="text" placeholder="GitHub File URL" value={newCodeNote.github_url} onChange={e => setNewCodeNote({...newCodeNote, github_url: e.target.value})} style={s.input} />
                <input type="text" placeholder="File name" value={newCodeNote.file_name} onChange={e => setNewCodeNote({...newCodeNote, file_name: e.target.value})} style={s.input} />
                <textarea placeholder="Description..." value={newCodeNote.description} onChange={e => setNewCodeNote({...newCodeNote, description: e.target.value})} style={{...s.input, minHeight: 60, resize:'vertical'}} />
                <div style={{display:'flex', gap:'0.5rem'}}>
                  <select value={newCodeNote.priority} onChange={e => setNewCodeNote({...newCodeNote, priority: e.target.value as any})} style={s.input}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                  <input type="text" placeholder="Assign to..." value={newCodeNote.assignee} onChange={e => setNewCodeNote({...newCodeNote, assignee: e.target.value})} style={s.input} />
                </div>
                <button type="submit" style={s.addBtn}>Fetch Code</button>
              </form>
            </div>

            {/* Column 2: View */}
            <div style={s.codePanel}>
              <h3 style={s.panelTitle}>2️⃣ View</h3>
              <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <p style={s.emptyText}>Coming soon...</p>
              </div>
            </div>

            {/* Column 3: Figma Screenshots */}
            <div style={s.codePanel}>
              <h3 style={s.panelTitle}>3️⃣ Figma / Screenshots</h3>
              <form onSubmit={addFigmaEmbed} style={{...s.taskForm, marginBottom:'1rem'}}>
                <input type="text" placeholder="Figma URL..." value={newFigmaUrl} onChange={e => setNewFigmaUrl(e.target.value)} style={s.input} />
                <button type="submit" style={s.addBtn}>Add</button>
              </form>
              {figmaEmbeds.map(e => <div key={e.id} style={s.figmaEmbed}><iframe src={e.url} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen /></div>)}
              <div style={{marginTop:'1rem'}}>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{display:'none'}} accept="image/*" />
                <button onClick={() => fileInputRef.current?.click()} style={s.uploadBtn}>Upload Screenshot</button>
              </div>
              <div style={s.previewGrid}>
                {files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i)).map(f => (<div key={f.id} style={s.previewItem}><img src={f.url} alt={f.name} style={s.previewMedia} /><p style={s.previewName}>{f.name}</p></div>))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'design' && (
          <div style={s.designContainer}>
            <div style={s.designPanel}>
              <h3 style={s.sectionTitle}>Figma</h3>
              <form onSubmit={addFigmaEmbed} style={s.taskForm}><input type="text" placeholder="Figma URL..." value={newFigmaUrl} onChange={e => setNewFigmaUrl(e.target.value)} style={s.input} /><button type="submit" style={s.addBtn}>Add</button></form>
              {figmaEmbeds.map(e => <div key={e.id} style={s.figmaEmbed}><iframe src={e.url} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen /></div>)}
            </div>
            <div style={s.designPanel}>
              <h3 style={s.sectionTitle}>Notes</h3>
              <form onSubmit={addDesignNote} style={s.noteForm}>
                <input type="text" placeholder="Issue title..." value={newNote.title} onChange={e => setNewNote({...newNote, title: e.target.value})} style={s.input} />
                <input type="text" placeholder="Screen" value={newNote.screen} onChange={e => setNewNote({...newNote, screen: e.target.value})} style={s.input} />
                <textarea placeholder="Description..." value={newNote.description} onChange={e => setNewNote({...newNote, description: e.target.value})} style={{...s.input, minHeight: 60}} />
                <select value={newNote.priority} onChange={e => setNewNote({...newNote, priority: e.target.value as any})} style={s.input}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                <button type="submit" style={s.addBtn}>Add Note</button>
              </form>
              <div style={s.notesList}>{designNotes.map(n => (<div key={n.id} style={{...s.noteCard, borderColor: n.status === 'resolved' ? '#10b981' : n.priority === 'high' ? '#