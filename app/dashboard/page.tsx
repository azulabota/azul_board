'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

interface Task {
  id: number
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  assignee: string
  created_at: string
}

interface Milestone {
  id: number
  title: string
  description: string
  due_date: string
  completed: boolean
  progress: number
}

interface File {
  id: number
  name: string
  url: string
  uploaded_by: string
  created_at: string
}

interface TeamMember {
  id: number
  email: string
  role: string
  created_at: string
}

interface DesignNote {
  id: number
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  screen: string
  priority: 'high' | 'medium' | 'low'
  created_by: string
  created_at: string
}

interface FigmaEmbed {
  id: number
  name: string
  url: string
  created_at: string
}

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: '#6366f1' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'done', title: 'Done', color: '#10b981' }
]

const PRIORITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981'
}

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
  const [loading, setLoading] = useState(true)
  const [draggedTask, setDraggedTask] = useState<number | null>(null)

  // Form states
  const [newTask, setNewTask] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', due_date: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [newNote, setNewNote] = useState({ title: '', description: '', screen: '', priority: 'medium' as const })
  const [newFigmaUrl, setNewFigmaUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
    } else {
      setUser(user)
      fetchData()
    }
  }

  const fetchData = async () => {
    setLoading(true)
    const [tasksRes, milestonesRes, filesRes, teamRes, notesRes, figmaRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').order('due_date', { ascending: true }),
      supabase.from('files').select('*').order('created_at', { ascending: false }),
      supabase.from('team').select('*').order('created_at', { ascending: false }),
      supabase.from('design_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('figma_embeds').select('*').order('created_at', { ascending: false })
    ])

    if (tasksRes.data) {
      const tasksWithStatus = tasksRes.data.map((t: any) => ({
        ...t,
        status: t.status || (t.completed ? 'done' : 'todo')
      }))
      setTasks(tasksWithStatus)
    }
    if (milestonesRes.data) setMilestones(milestonesRes.data)
    if (filesRes.data) setFiles(filesRes.data)
    if (teamRes.data) setTeam(teamRes.data)
    if (notesRes.data) setDesignNotes(notesRes.data.map((n: any) => ({ ...n, status: n.status || 'open' })))
    if (figmaRes.data) setFigmaEmbeds(figmaRes.data)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.trim()) return

    const { data, error } = await supabase
      .from('tasks')
      .insert([{ 
        title: newTask, 
        status: 'todo',
        priority: taskPriority,
        assignee: taskAssignee || 'Unassigned'
      }])
      .select()

    if (!error && data) {
      setTasks([data[0], ...tasks])
      setNewTask('')
    }
  }

  const handleDragStart = (taskId: number) => setDraggedTask(taskId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = async (status: string) => {
    if (draggedTask === null) return
    await supabase.from('tasks').update({ status }).eq('id', draggedTask)
    setTasks(tasks.map(t => t.id === draggedTask ? { ...t, status: status as any } : t))
    setDraggedTask(null)
  }

  const deleteTask = async (id: number) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMilestone.title.trim()) return
    const { data } = await supabase.from('milestones').insert([{ 
      title: newMilestone.title, description: newMilestone.description,
      due_date: newMilestone.due_date, completed: false, progress: 0
    }]).select()
    if (data) setMilestones([...milestones, data[0]])
    setNewMilestone({ title: '', description: '', due_date: '' })
  }

  const updateMilestoneProgress = async (id: number, progress: number) => {
    await supabase.from('milestones').update({ progress, completed: progress >= 100 }).eq('id', id)
    setMilestones(milestones.map(m => m.id === id ? { ...m, progress, completed: progress >= 100 } : m))
  }

  const inviteTeamMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    const { data } = await supabase.from('team').insert([{ email: inviteEmail, role: inviteRole }]).select()
    if (data) setTeam([...team, data[0]])
    setInviteEmail('')
    alert(`Invite sent to ${inviteEmail}`)
  }

  const addDesignNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNote.title.trim()) return
    const { data } = await supabase.from('design_notes').insert([{
      title: newNote.title,
      description: newNote.description,
      screen: newNote.screen,
      priority: newNote.priority,
      status: 'open',
      created_by: user?.email
    }]).select()
    if (data) setDesignNotes([data[0], ...designNotes])
    setNewNote({ title: '', description: '', screen: '', priority: 'medium' })
  }

  const updateNoteStatus = async (id: number, status: string) => {
    await supabase.from('design_notes').update({ status }).eq('id', id)
    setDesignNotes(designNotes.map(n => n.id === id ? { ...n, status: status as any } : n))
  }

  const deleteNote = async (id: number) => {
    await supabase.from('design_notes').delete().eq('id', id)
    setDesignNotes(designNotes.filter(n => n.id !== id))
  }

  const addFigmaEmbed = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFigmaUrl.trim()) return
    // Extract Figma file key and convert to embed URL
    const fileKeyMatch = newFigmaUrl.match(/design\/([a-zA-Z0-9]+)/)
    if (!fileKeyMatch) {
      alert('Invalid Figma URL')
      return
    }
    const fileKey = fileKeyMatch[1]
    const embedUrl = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(newFigmaUrl)}`
    const { data } = await supabase.from('figma_embeds').insert([{
      name: 'Figma Design',
      url: embedUrl
    }]).select()
    if (data) setFigmaEmbeds([...figmaEmbeds, data[0]])
    setNewFigmaUrl('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `${user?.id}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('project-files').upload(filePath, file)
    if (uploadError) { alert('Error uploading'); return }

    const { data: { publicUrl } } = supabase.storage.from('project-files').getPublicUrl(filePath)
    const { data } = await supabase.from('files').insert([{ name: file.name, url: publicUrl, uploaded_by: user?.email }]).select()
    if (data) setFiles([data[0], ...files])
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status)
  const completedTasks = tasks.filter(t => t.status === 'done').length

  if (loading) return <div style={styles.loading}>Loading...</div>

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.logo}>Sapien Eleven</h1>
        <div style={styles.userInfo}>
          <span>{user?.email}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      <div style={styles.content}>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}><div style={styles.statValue}>{tasks.length}</div><div style={styles.statLabel}>Total</div></div>
          <div style={styles.statCard}><div style={{...styles.statValue, color: '#6366f1'}}>{getTasksByStatus('todo').length}</div><div style={styles.statLabel}>To Do</div></div>
          <div style={styles.statCard}><div style={{...styles.statValue, color: '#f59e0b'}}>{getTasksByStatus('in_progress').length}</div><div style={styles.statLabel}>In Progress</div></div>
          <div style={styles.statCard}><div style={{...styles.statValue, color: '#10b981'}}>{completedTasks}</div><div style={styles.statLabel}>Done</div></div>
        </div>

        <div style={styles.tabs}>
          {['board', 'design', 'milestones', 'files', 'team'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={activeTab === tab ? styles.tabActive : styles.tab}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'board' && (
          <div>
            <form onSubmit={addTask} style={styles.taskForm}>
              <input type="text" placeholder="Add a task..." value={newTask} onChange={e => setNewTask(e.target.value)} style={styles.input} />
              <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as any)} style={styles.input}>{['low','medium','high'].map(p => <option key={p} value={p}>{p}</option>)}</select>
              <input type="text" placeholder="Assignee" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={{...styles.input, width: 120}} />
              <button type="submit" style={styles.addBtn}>Add</button>
            </form>
            <div style={styles.board}>
              {COLUMNS.map(col => (
                <div key={col.id} onDragOver={handleDragOver} onDrop={() => handleDrop(col.id)} style={styles.column}>
                  <div style={styles.columnHeader}>
                    <div style={{...styles.columnDot, background: col.color}} />
                    <span style={styles.columnTitle}>{col.title}</span>
                    <span style={styles.columnCount}>{getTasksByStatus(col.id).length}</span>
                  </div>
                  {getTasksByStatus(col.id).map(task => (
                    <div key={task.id} draggable onDragStart={() => handleDragStart(task.id)} style={styles.taskCard}>
                      <div style={styles.taskHeader}>
                        <span style={{...styles.taskPriority, background: PRIORITY_COLORS[task.priority]}} />
                        <span style={styles.taskPriorityLabel}>{task.priority}</span>
                        <button onClick={() => deleteTask(task.id)} style={styles.deleteBtn}>✕</button>
                      </div>
                      <div style={styles.taskTitle}>{task.title}</div>
                      <div style={styles.taskAssignee}>{task.assignee}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'design' && (
          <div style={styles.designContainer}>
            <div style={styles.designPanel}>
              <h3 style={styles.sectionTitle}>Figma Designs</h3>
              <form onSubmit={addFigmaEmbed} style={styles.taskForm}>
                <input type="text" placeholder="Figma URL..." value={newFigmaUrl} onChange={e => setNewFigmaUrl(e.target.value)} style={styles.input} />
                <button type="submit" style={styles.addBtn}>Add</button>
              </form>
              {figmaEmbeds.map(embed => (
                <div key={embed.id} style={styles.figmaEmbed}>
                  <iframe src={embed.url} style={styles.figmaIframe} allowFullScreen />
                </div>
              ))}
              {figmaEmbeds.length === 0 && <p style={styles.emptyText}>No Figma designs added yet. Add a link above.</p>}
            </div>

            <div style={styles.designPanel}>
              <h3 style={styles.sectionTitle}>App Preview</h3>
              <div style={{ marginBottom: '1rem' }}>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*" />
                <button onClick={() => fileInputRef.current?.click()} style={styles.uploadBtn}>Upload Screenshot/Video</button>
              </div>
              <div style={styles.previewGrid}>
                {files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|mp4|mov)$/i)).map(file => (
                  <div key={file.id} style={styles.previewItem}>
                    {file.name.match(/\.(mp4|mov)$/i) ? (
                      <video src={file.url} controls style={styles.previewMedia} />
                    ) : (
                      <img src={file.url} alt={file.name} style={styles.previewMedia} />
                    )}
                    <p style={styles.previewName}>{file.name}</p>
                  </div>
                ))}
              </div>
              {files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|mp4|mov)$/i)).length === 0 && <p style={styles.emptyText}>No previews uploaded. Add screenshots or videos above.</p>}
            </div>

            <div style={styles.designPanel}>
              <h3 style={styles.sectionTitle}>Design Notes</h3>
              <form onSubmit={addDesignNote} style={styles.noteForm}>
                <input type="text" placeholder="Issue title..." value={newNote.title} onChange={e => setNewNote({...newNote, title: e.target.value})} style={styles.input} />
                <input type="text" placeholder="Screen (e.g. Home, Profile)" value={newNote.screen} onChange={e => setNewNote({...newNote, screen: e.target.value})} style={styles.input} />
                <textarea placeholder="Description..." value={newNote.description} onChange={e => setNewNote({...newNote, description: e.target.value})} style={{...styles.input, minHeight: 60}} />
                <select value={newNote.priority} onChange={e => setNewNote({...newNote, priority: e.target.value as any})} style={styles.input}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
                <button type="submit" style={styles.addBtn}>Add Note</button>
              </form>
              <div style={styles.notesList}>
                {designNotes.map(note => (
                  <div key={note.id} style={{...styles.noteCard, borderColor: note.status === 'resolved' ? '#10b981' : note.priority === 'high' ? '#ef4444' : '#333'}}>
                    <div style={styles.noteHeader}>
                      <span style={{...styles.noteStatus, background: note.status === 'resolved' ? '#10b981' : note.status === 'in_progress' ? '#f59e0b' : '#6366f1'}}>{note.status}</span>
                      <span style={{...styles.notePriority, background: PRIORITY_COLORS[note.priority]}}>{note.priority}</span>
                      <button onClick={() => deleteNote(note.id)} style={styles.deleteBtn}>✕</button>
                    </div>
                    <div style={styles.noteTitle}>{note.title}</div>
                    {note.screen && <div style={styles.noteScreen}>📱 {note.screen}</div>}
                    {note.description && <div style={styles.noteDesc}>{note.description}</div>}
                    <div style={styles.noteMeta}>
                      <span>{note.created_by}</span>
                      <select value={note.status} onChange={e => updateNoteStatus(note.id, e.target.value)} style={styles.noteSelect}>
                        <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div>
            <form onSubmit={addMilestone} style={styles.taskForm}>
              <input type="text" placeholder="Milestone title..." value={newMilestone.title} onChange={e => setNewMilestone({...newMilestone, title: e.target.value})} style={styles.input} />
              <input type="text" placeholder="Description" value={newMilestone.description} onChange={e => setNewMilestone({...newMilestone, description: e.target.value})} style={styles.input} />
              <input type="date" value={newMilestone.due_date} onChange={e => setNewMilestone({...newMilestone, due_date: e.target.value})} style={styles.input} />
              <button type="submit" style={styles.addBtn}>Add</button>
            </form>
            <div style={styles.milestoneGrid}>
              {milestones.map(m => (
                <div key={m.id} style={{...styles.milestoneCard, borderColor: m.completed ? '#10b981' : '#333'}}>
                  <h3>{m.title}</h3><p>{m.description}</p>
                  <div style={styles.progressBar}><div style={{...styles.progressFill, width: `${m.progress}%`, background: m.completed ? '#10b981' : '#6366f1'}} /></div>
                  <div style={styles.milestoneMeta}><span>{m.progress}%</span><span>{m.due_date}</span></div>
                  <input type="range" min="0" max="100" value={m.progress} onChange={e => updateMilestoneProgress(m.id, parseInt(e.target.value))} style={{width:'100%', marginTop:'1rem'}} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div style={styles.filesGrid}>
            {files.map(f => (
              <div key={f.id} style={styles.fileCard}>
                <p>{f.name}</p>
                <a href={f.url} target="_blank" rel="noopener noreferrer">View</a>
                <p style={styles.fileMeta}>by {f.uploaded_by}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'team' && (
          <div>
            <form onSubmit={inviteTeamMember} style={styles.taskForm}>
              <input type="email" placeholder="Email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={styles.input} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={styles.input}>{['developer','designer','manager','viewer'].map(r => <option key={r} value={r}>{r}</option>)}</select>
              <button type="submit" style={{...styles.addBtn, background: '#10b981'}}>Invite</button>
            </form>
            <div style={styles.teamList}>
              {team.map(m => (
                <div key={m.id} style={styles.teamCard}>
                  <span>{m.email}</span>
                  <span style={styles.teamRole}>{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' },
  tab: { padding: '8px 16px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', borderRadius: '6px' },
  tabActive: { padding: '8px 16px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '6px' },
  taskForm: { display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' },
  input: { flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' },
  addBtn: { padding: '12px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
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
  deleteBtn: { marginLeft: 'auto', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' },
  taskTitle: { fontWeight: '500', marginBottom: '0.25rem' },
  taskAssignee: { fontSize: '0.75rem', color: '#666' },
  loading: { background: '#000', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  designContainer: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' },
  designPanel: { background: '#111', borderRadius: '12px', padding: '1rem', border: '1px solid #333' },
  sectionTitle: { marginBottom: '1rem', fontSize: '1rem' },
  figmaEmbed: { width: '100%', height: '400px', border: 'none', borderRadius: '8px', overflow: 'hidden' },
  figmaIframe: { width: '100%', height: '100%', border: 'none' },
  previewGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  previewItem: { background: '#222', padding: '0.5rem', borderRadius: '8px' },
  previewMedia: { width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' },
  previewName: { fontSize: '0.75rem', marginTop: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  uploadBtn: { padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', width: '100%' },
  noteForm: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' },
  notesList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' },
  noteCard: { background: '#0a0a0a', padding: '1rem', borderRadius: '8px', border: '1px solid' },
  noteHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
  noteStatus: { padding: '2px 8px', borderRadius: '4px', fontSize: '10px', textTransform: 'uppercase' },
  notePriority: { padding: '2px 8px', borderRadius: '4px', fontSize: '10px', textTransform: 'uppercase' },
  noteTitle: { fontWeight: '600', marginBottom: '0.25rem' },
  noteScreen: { fontSize: '0.75rem', color: '#6366f1', marginBottom: '0.25rem' },
  noteDesc: { fontSize: '0.875rem', color: '#888', marginBottom: '0.5rem' },
  noteMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#666' },
  noteSelect: { background: '#222', color: '#fff', border: 'none', padding: '4px', borderRadius: '4px', fontSize: '12px' },
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
  teamRole: { background: '#222', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', color: '#888', textTransform: 'capitalize' },
  emptyText: { color: '#666', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }
}
