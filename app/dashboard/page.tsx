'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

interface Milestone { id: number; title: string; description: string }
interface Task { id: number; milestone_id: number; title: string; status: string; priority: string; assignee: string; description: string; created_by: string }
interface File { id: number; milestone_id: number; name: string; url: string; link: string }
interface Revision { id: number; milestone_id: number; title: string; code_snippet: string; file_name: string; github_url: string; description: string; priority: string; status: string; assignee: string; created_by: string }

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<'dashboard' | 'files' | 'revisions'>('dashboard')
  
  const [tasks, setTasks] = useState<Task[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  
  const [newMilestone, setNewMilestone] = useState('')
  const [editingMilestone, setEditingMilestone] = useState<number | null>(null)
  const [editMilestoneTitle, setEditMilestoneTitle] = useState('')
  
  // Task form per column
  const [newTask, setNewTask] = useState({ todo: '', in_progress: '', needs_review: '', done: '' })
  const [newTaskDesc, setNewTaskDesc] = useState({ todo: '', in_progress: '', needs_review: '', done: '' })
  const [newTaskAssignee, setNewTaskAssignee] = useState({ todo: '', in_progress: '', needs_review: '', done: '' })
  const [newTaskPriority, setNewTaskPriority] = useState({ todo: 'medium', in_progress: 'medium', needs_review: 'medium', done: 'medium' })
  
  // Expanded task
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<number | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskDesc, setEditTaskDesc] = useState('')
  
  const [newFileName, setNewFileName] = useState('')
  const [newFileUrl, setNewFileUrl] = useState('')
  const [newRevision, setNewRevision] = useState({ title: '', description: '', github_url: '', file_name: '', priority: 'medium', assignee: '' })
  const [draggedTask, setDraggedTask] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const PRIORITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

  useEffect(() => { checkUser() }, [])
  
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/') }
    else { setUser(user); fetchData() }
  }

  const fetchData = async () => {
    setLoading(true)
    const [msRes, tasksRes, filesRes, revsRes] = await Promise.all([
      supabase.from('milestones').select('*').order('created_at', { ascending: true }),
      supabase.from('tasks').select('*'),
      supabase.from('files').select('*'),
      supabase.from('revisions').select('*').order('created_at', { ascending: false })
    ])
    if (msRes.data) setMilestones(msRes.data)
    if (tasksRes.data) setTasks(tasksRes.data)
    if (filesRes.data) setFiles(filesRes.data)
    if (revsRes.data) setRevisions(revsRes.data)
    if (msRes.data?.length && !selectedMilestone) setSelectedMilestone(msRes.data[0].id)
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/') }

  // Milestones
  const addMilestone = async () => {
    if (!newMilestone.trim()) return
    const { data } = await supabase.from('milestones').insert([{ title: newMilestone }]).select()
    if (data) { setMilestones([...milestones, data[0]]); setSelectedMilestone(data[0].id); setNewMilestone('') }
  }
  
  const updateMilestone = async (id: number) => {
    if (!editMilestoneTitle.trim()) return
    await supabase.from('milestones').update({ title: editMilestoneTitle }).eq('id', id)
    setMilestones(milestones.map(m => m.id === id ? { ...m, title: editMilestoneTitle } : m))
    setEditingMilestone(null)
  }

  const deleteMilestone = async (id: number) => {
    if (!confirm('Delete milestone and all its data?')) return
    await supabase.from('milestones').delete().eq('id', id)
    setMilestones(milestones.filter(m => m.id !== id))
    if (selectedMilestone === id) setSelectedMilestone(milestones[0]?.id || null)
  }

  // Tasks
  const addTask = async (status: string) => {
    const title = newTask[status as keyof typeof newTask]
    if (!title.trim() || !selectedMilestone) return
    
    const { data } = await supabase.from('tasks').insert([{ 
      milestone_id: selectedMilestone, 
      title, 
      status, 
      description: newTaskDesc[status as keyof typeof newTaskDesc],
      priority: newTaskPriority[status as keyof typeof newTaskPriority],
      assignee: newTaskAssignee[status as keyof typeof newTaskAssignee] || 'Unassigned',
      created_by: user?.email
    }]).select()
    
    if (data) setTasks([...tasks, data[0]])
    setNewTask({ ...newTask, [status]: '' })
    setNewTaskDesc({ ...newTaskDesc, [status]: '' })
  }

  const handleDragStart = (taskId: number) => setDraggedTask(taskId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  
  const handleTaskDrop = async (status: string) => {
    if (!draggedTask || !selectedMilestone) return
    await supabase.from('tasks').update({ status }).eq('id', draggedTask)
    setTasks(tasks.map(t => t.id === draggedTask ? { ...t, status } : t))
    setDraggedTask(null)
  }

  const deleteTask = async (id: number) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const canEditTask = (task: Task) => task.created_by === user?.email

  const saveTaskEdit = async (id: number) => {
    await supabase.from('tasks').update({ title: editTaskTitle, description: editTaskDesc }).eq('id', id)
    setTasks(tasks.map(t => t.id === id ? { ...t, title: editTaskTitle, description: editTaskDesc } : t))
    setEditingTask(null)
  }

  // Files
  const addFile = async () => {
    if (!newFileName.trim() || !selectedMilestone) return
    const { data } = await supabase.from('files').insert([{ milestone_id: selectedMilestone, name: newFileName, url: newFileUrl }]).select()
    if (data) setFiles([...files, data[0]])
    setNewFileName(''); setNewFileUrl('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedMilestone) return
    const filePath = `${user?.id}/${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('project-files').upload(filePath, file)
    if (error) { alert('Error uploading'); return }
    const { data: { publicUrl } } = supabase.storage.from('project-files').getPublicUrl(filePath)
    const { data } = await supabase.from('files').insert([{ milestone_id: selectedMilestone, name: file.name, url: publicUrl }]).select()
    if (data) setFiles([...files, data[0]])
  }

  // Revisions
  const fetchGitHubCode = async (url: string) => {
    let rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
    if (!rawUrl.includes('raw.githubusercontent.com')) return null
    try { const res = await fetch(rawUrl); return res.ok ? await res.text() : null } catch { return null }
  }

  const addRevision = async () => {
    if (!newRevision.title.trim() || !selectedMilestone) return
    let codeSnippet = ''
    if (newRevision.github_url) codeSnippet = await fetchGitHubCode(newRevision.github_url) || ''
    
    const { data } = await supabase.from('revisions').insert([{
      milestone_id: selectedMilestone,
      title: newRevision.title,
      description: newRevision.description,
      code_snippet: codeSnippet,
      file_name: newRevision.file_name,
      github_url: newRevision.github_url,
      priority: newRevision.priority,
      status: 'todo',
      assignee: newRevision.assignee || 'Unassigned',
      created_by: user?.email
    }]).select()
    
    if (data) {
      setRevisions([data[0], ...revisions])
      await supabase.from('tasks').insert([{
        milestone_id: selectedMilestone,
        title: `Rev: ${data[0].title}`,
        status: 'todo',
        priority: newRevision.priority,
        assignee: newRevision.assignee || 'Unassigned',
        created_by: user?.email
      }])
      setTasks([...tasks, { id: Date.now(), milestone_id: selectedMilestone, title: `Rev: ${newRevision.title}`, status: 'todo', priority: newRevision.priority, assignee: newRevision.assignee || 'Unassigned', description: '', created_by: user?.email }])
    }
    setNewRevision({ title: '', description: '', github_url: '', file_name: '', priority: 'medium', assignee: '' })
  }

  const updateRevisionStatus = async (id: number, status: string) => {
    await supabase.from('revisions').update({ status }).eq('id', id)
    setRevisions(revisions.map(r => r.id === id ? { ...r, status } : r))
  }

  const deleteRevision = async (id: number) => {
    await supabase.from('revisions').delete().eq('id', id)
    setRevisions(revisions.filter(r => r.id !== id))
  }

  const milestoneTasks = tasks.filter(t => t.milestone_id === selectedMilestone)
  const milestoneFiles = files.filter(f => f.milestone_id === selectedMilestone)
  const milestoneRevisions = revisions.filter(r => r.milestone_id === selectedMilestone)

  const getTasksByStatus = (status: string) => milestoneTasks.filter(t => t.status === status)

  const renderTaskForm = (status: string, label: string) => (
    <div style={{marginBottom:'1rem', padding:'0.75rem', background:'#1a1a1a', borderRadius:'8px'}}>
      <input 
        type="text" 
        placeholder={`Add ${label}...`} 
        value={newTask[status as keyof typeof newTask]} 
        onChange={e => setNewTask({ ...newTask, [status]: e.target.value })} 
        onKeyDown={e => e.key === 'Enter' && addTask(status)}
        style={{width:'100%', padding:'8px', background:'#111', border:'1px solid #333', borderRadius:'4px', color:'#fff', fontSize:'13px', marginBottom:'0.5rem'}}
      />
      <textarea 
        placeholder="Description (optional)"
        value={newTaskDesc[status as keyof typeof newTaskDesc]}
        onChange={e => setNewTaskDesc({ ...newTaskDesc, [status]: e.target.value })}
        style={{width:'100%', padding:'8px', background:'#111', border:'1px solid #333', borderRadius:'4px', color:'#fff', fontSize:'12px', marginBottom:'0.5rem', minHeight:'40px'}}
      />
      <div style={{display:'flex', gap:'0.5rem'}}>
        <select 
          value={newTaskPriority[status as keyof typeof newTaskPriority]}
          onChange={e => setNewTaskPriority({ ...newTaskPriority, [status]: e.target.value })}
          style={{padding:'6px', background:'#111', border:'1px solid #333', borderRadius:'4px', color:'#fff', fontSize:'12px'}}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input 
          type="text" 
          placeholder="Assign to..." 
          value={newTaskAssignee[status as keyof typeof newTaskAssignee]}
          onChange={e => setNewTaskAssignee({ ...newTaskAssignee, [status]: e.target.value })}
          style={{flex:1, padding:'6px', background:'#111', border:'1px solid #333', borderRadius:'4px', color:'#fff', fontSize:'12px'}}
        />
        <button onClick={() => addTask(status)} style={{padding:'6px 12px', background:'#6366f1', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Add</button>
      </div>
    </div>
  )

  const renderTaskCard = (task: Task) => {
    const isExpanded = expandedTask === task.id
    const isEditing = editingTask === task.id
    const isCreator = canEditTask(task)
    
    return (
      <div 
        key={task.id} 
        draggable 
        onDragStart={() => handleDragStart(task.id)}
        onClick={() => !isEditing && setExpandedTask(isExpanded ? null : task.id)}
        style={{
          background: '#111', 
          padding: isExpanded ? '1rem' : '0.75rem', 
          borderRadius: '6px', 
          border: '1px solid #333', 
          cursor: 'grab', 
          marginBottom: '0.5rem',
          transition: 'all 0.2s'
        }}
      >
        {isEditing ? (
          <div onClick={e => e.stopPropagation()}>
            <input 
              value={editTaskTitle} 
              onChange={e => setEditTaskTitle(e.target.value)}
              style={{width:'100%', padding:'6px', background:'#000', border:'1px solid #444', borderRadius:'4px', color:'#fff', fontSize:'13px', marginBottom:'0.5rem'}}
            />
            <textarea 
              value={editTaskDesc}
              onChange={e => setEditTaskDesc(e.target.value)}
              style={{width:'100%', padding:'6px', background:'#000', border:'1px solid #444', borderRadius:'4px', color:'#fff', fontSize:'12px', marginBottom:'0.5rem', minHeight:'60px'}}
            />
            <div style={{display:'flex', gap:'0.5rem'}}>
              <button onClick={() => saveTaskEdit(task.id)} style={{padding:'4px 8px', background:'#10b981', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Save</button>
              <button onClick={() => setEditingTask(null)} style={{padding:'4px 8px', background:'#666', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom: isExpanded ? '0.5rem' : '0.25rem'}}>
              <span style={{width:'6px',height:'6px',borderRadius:'50%',background:PRIORITY_COLORS[task.priority]}} />
              <span style={{fontSize:'0.7rem',color:'#666',textTransform:'uppercase', flex:1}}>{task.priority}</span>
              {isCreator && <button onClick={(e) => { e.stopPropagation(); setEditingTask(task.id); setEditTaskTitle(task.title); setEditTaskDesc(task.description || '') }} style={{background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:'12px'}}>✏️</button>}
              <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }} style={{background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:'12px'}}>✕</button>
            </div>
            <div style={{fontWeight:'500',fontSize:'0.875rem', marginBottom: isExpanded ? '0.5rem' : '0'}}>{task.title}</div>
            {isExpanded && task.description && (
              <div style={{fontSize:'0.8rem',color:'#888',marginTop:'0.5rem',padding:'0.5rem',background:'#0a0a0a',borderRadius:'4px'}}>{task.description}</div>
            )}
            {isExpanded && (
              <div style={{fontSize:'0.75rem',color:'#666',marginTop:'0.5rem'}}>
                👤 {task.created_by} → {task.assignee}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const s: Record<string, React.CSSProperties> = {
    container: { background: '#000', color: '#e5e5e5', minHeight: '100vh', display: 'flex' },
    sidebar: { width: '280px', background: '#111', borderRight: '1px solid #333', padding: '1rem', display: 'flex', flexDirection: 'column' },
    main: { flex: 1, padding: '1.5rem', overflow: 'auto' },
    logo: { fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' },
    logoutBtn: { padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: 'auto' },
    sectionTitle: { fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', marginTop: '1rem' },
    milestoneItem: { padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    milestoneItemActive: { background: '#222' },
    milestoneInput: { padding: '8px', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff', width: '100%', marginBottom: '0.5rem' },
    addBtn: { padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', width: '100%' },
    viewTabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' },
    viewTab: { padding: '8px 16px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', borderRadius: '6px' },
    viewTabActive: { background: '#333', color: '#fff' },
    board: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' },
    column: { background: '#0a0a0a', borderRadius: '12px', padding: '1rem', minHeight: '300px', border: '1px solid #222', display: 'flex', flexDirection: 'column' },
    columnHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #222', justifyContent: 'space-between' },
    columnDot: { width: '8px', height: '8px', borderRadius: '50%' },
    columnTitle: { fontWeight: '600', fontSize: '0.875rem' },
    columnCount: { background: '#222', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: '#888' },
    addTaskBtn: { width: '24px', height: '24px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    filesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
    fileCard: { background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' },
    revContainer: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' },
    revPanel: { background: '#111', borderRadius: '12px', padding: '1rem', border: '1px solid #333', maxHeight: '600px', overflow: 'auto' },
    revCard: { background: '#0a0a0a', padding: '1rem', borderRadius: '8px', border: '1px solid', borderLeftWidth: '4px', marginBottom: '0.75rem' },
    emptyText: { color: '#666', textAlign: 'center', padding: '2rem', fontSize: '0.875rem' },
    panelTitle: { fontWeight: '600', marginBottom: '1rem' },
    input: { flex: 1, padding: '10px', background: '#111', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '14px', minWidth: '120px' }
  }

  if (loading) return <div style={{background:'#000',color:'#fff',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>Loading...</div>

  return (
    <div style={s.container}>
      <div style={s.sidebar}>
        <h1 style={s.logo}>Sapien Eleven</h1>
        
        <div style={s.sectionTitle}>Milestones</div>
        {milestones.map(m => (
          <div key={m.id} style={{...s.milestoneItem, ...(selectedMilestone === m.id ? s.milestoneItemActive : {})}} onClick={() => setSelectedMilestone(m.id)}>
            {editingMilestone === m.id ? (
              <input autoFocus value={editMilestoneTitle} onChange={e => setEditMilestoneTitle(e.target.value)} onBlur={() => updateMilestone(m.id)} onKeyDown={e => e.key === 'Enter' && updateMilestone(m.id)} onClick={e => e.stopPropagation()} style={s.milestoneInput} />
            ) : (
              <span onDoubleClick={() => { setEditingMilestone(m.id); setEditMilestoneTitle(m.title) }}>{m.title}</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); deleteMilestone(m.id) }} style={{background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:'12px',marginLeft:'auto'}}>✕</button>
          </div>
        ))}
        
        <input type="text" placeholder="New milestone..." value={newMilestone} onChange={e => setNewMilestone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMilestone()} style={s.milestoneInput} />
        <button onClick={addMilestone} style={s.addBtn}>+ Add Milestone</button>
        
        <button onClick={handleLogout} style={s.logoutBtn}>Logout</button>
      </div>

      <div style={s.main}>
        <h2 style={{marginBottom:'1.5rem'}}>{milestones.find(m => m.id === selectedMilestone)?.title || 'Select a milestone'}</h2>
        
        <div style={s.viewTabs}>
          <button onClick={() => setActiveView('dashboard')} style={activeView === 'dashboard' ? {...s.viewTab, ...s.viewTabActive} : s.viewTab}>Dashboard</button>
          <button onClick={() => setActiveView('files')} style={activeView === 'files' ? {...s.viewTab, ...s.viewTabActive} : s.viewTab}>Files</button>
          <button onClick={() => setActiveView('revisions')} style={activeView === 'revisions' ? {...s.viewTab, ...s.viewTabActive} : s.viewTab}>Revisions</button>
        </div>

        {activeView === 'dashboard' && (
          <div style={s.board}>
            {[
              { id: 'todo', title: 'To Do', color: '#6366f1' },
              { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
              { id: 'needs_review', title: 'Needs Reviewed', color: '#8b5cf6' },
              { id: 'done', title: 'Completed', color: '#10b981' }
            ].map(col => (
              <div key={col.id} onDragOver={handleDragOver} onDrop={() => handleTaskDrop(col.id)} style={s.column}>
                <div style={s.columnHeader}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                    <div style={{...s.columnDot, background: col.color}} />
                    <span style={s.columnTitle}>{col.title}</span>
                    <span style={s.columnCount}>{getTasksByStatus(col.id).length}</span>
                  </div>
                  <button onClick={() => document.getElementById(`add-${col.id}`)?.scrollIntoView({behavior:'smooth'})} style={s.addTaskBtn}>+</button>
                </div>
                <div id={`add-${col.id}`}>{renderTaskForm(col.id, col.title)}</div>
                <div style={{flex:1, overflow:'auto'}}>
                  {getTasksByStatus(col.id).map(task => renderTaskCard(task))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeView === 'files' && (
          <div>
            <div style={{display:'flex', gap:'0.5rem', marginBottom:'1.5rem', flexWrap:'wrap'}}>
              <input type="text" placeholder="File name" value={newFileName} onChange={e => setNewFileName(e.target.value)} style={s.input} />
              <input type="text" placeholder="URL (optional)" value={newFileUrl} onChange={e => setNewFileUrl(e.target.value)} style={s.input} />
              <button onClick={addFile} style={s.addBtn}>Add</button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{display:'none'}} />
            <button onClick={() => fileInputRef.current?.click()} style={{...s.addBtn, width:'auto', marginBottom:'1.5rem'}}>📎 Upload File</button>
            
            <div style={s.filesGrid}>
              {milestoneFiles.map(f => (
                <div key={f.id} style={s.fileCard}>
                  <p style={{fontWeight:'500',marginBottom:'0.5rem'}}>{f.name}</p>
                  {f.url && <a href={f.url} target="_blank" rel="noopener" style={{color:'#6366f1',fontSize:'0.875rem'}}>View / Download</a>}
                </div>
              ))}
              {milestoneFiles.length === 0 && <p style={s.emptyText}>No files yet</p>}
            </div>
          </div>
        )}

        {activeView === 'revisions' && (
          <div style={s.revContainer}>
            <div style={s.revPanel}>
              <div style={s.panelTitle}>➕ Add Revision</div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                <input type="text" placeholder="Title" value={newRevision.title} onChange={e => setNewRevision({...newRevision, title: e.target.value})} style={s.input} />
                <input type="text" placeholder="GitHub URL" value={newRevision.github_url} onChange={e => setNewRevision({...newRevision, github_url: e.target.value})} style={s.input} />
                <input type="text" placeholder="File name" value={newRevision.file_name} onChange={e => setNewRevision({...newRevision, file_name: e.target.value})} style={s.input} />
                <textarea placeholder="Description" value={newRevision.description} onChange={e => setNewRevision({...newRevision, description: e.target.value})} style={{...s.input, minHeight:'60px'}} />
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <select value={newRevision.priority} onChange={e => setNewRevision({...newRevision, priority: e.target.value})} style={s.input}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                  <input type="text" placeholder="Assign to..." value={newRevision.assignee} onChange={e => setNewRevision({...newRevision, assignee: e.target.value})} style={s.input} />
                </div>
                <button onClick={addRevision} style={s.addBtn}>Add & Send to To Do</button>
              </div>
            </div>

            <div style={s.revPanel}>
              <div style={s.panelTitle}>💻 Code</div>
              {milestoneRevisions.map(r => (
                <div key={r.id} style={{...s.revCard, borderLeftColor: r.priority === 'high' ? '#ef4444' : r.priority === 'medium' ? '#f59e0b' : '#10b981'}}>
                  <div style={{fontWeight:'600',marginBottom:'0.25rem'}}>{r.title}</div>
                  <div style={{fontSize:'0.75rem',color:'#666',marginBottom:'0.5rem'}}>{r.file_name}</div>
                  {r.code_snippet && <pre style={{background:'#000',padding:'0.5rem',borderRadius:'4px',fontSize:'10px',overflow:'auto',maxHeight:'150px'}}>{r.code_snippet.slice(0,300)}</pre>}
                </div>
              ))}
            </div>

            <div style={s.revPanel}>
              <div style={s.panelTitle}>👁️ View</div>
              <p style={s.emptyText}>Coming soon...</p>
            </div>

            <div style={s.revPanel}>
              <div style={s.panelTitle}>📝 Notes</div>
              {milestoneRevisions.map(r => (
                <div key={r.id} style={{...s.revCard, borderLeftColor: r.status === 'done' ? '#10b981' : r.priority === 'high' ? '#ef4444' : '#6366f1'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.5rem'}}>
                    <span style={{padding:'2px 6px',borderRadius:'4px',fontSize:'10px',background:r.status==='done'?'#10b981':r.status==='in_progress'?'#f59e0b':'#6366f1',color:'#fff'}}>{r.status}</span>
                    <span style={{padding:'2px 6px',borderRadius:'4px',fontSize:'10px',background:PRIORITY_COLORS[r.priority],color:'#fff'}}>{r.priority}</span>
                    <button onClick={() => deleteRevision(r.id)} style={{background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:'12px',marginLeft:'auto'}}>✕</button>
                  </div>
                  <div style={{fontWeight:'600',marginBottom:'0.25rem'}}>{r.title}</div>
                  {r.description && <div style={{fontSize:'0.875rem',color:'#888',marginBottom:'0.5rem'}}>{r.description}</div>}
                  <div style={{fontSize:'0.75rem',color:'#666'}}>👤 {r.created_by} → {r.assignee}</div>
                  <select value={r.status} onChange={e => updateRevisionStatus(r.id, e.target.value)} style={{marginTop:'0.5rem',padding:'4px',background:'#222',color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px'}}>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
