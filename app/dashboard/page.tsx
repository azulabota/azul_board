'use client'
import { useState, useEffect } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [draggedTask, setDraggedTask] = useState<number | null>(null)

  // Form states
  const [newTask, setNewTask] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', due_date: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')

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
    const [tasksRes, milestonesRes, filesRes, teamRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').order('due_date', { ascending: true }),
      supabase.from('files').select('*').order('created_at', { ascending: false }),
      supabase.from('team').select('*').order('created_at', { ascending: false })
    ])

    if (tasksRes.data) {
      // Add status field if it doesn't exist
      const tasksWithStatus = tasksRes.data.map((t: any) => ({
        ...t,
        status: t.status || (t.completed ? 'done' : 'todo')
      }))
      setTasks(tasksWithStatus)
    }
    if (milestonesRes.data) setMilestones(milestonesRes.data)
    if (filesRes.data) setFiles(filesRes.data)
    if (teamRes.data) setTeam(teamRes.data)
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

  const handleDragStart = (taskId: number) => {
    setDraggedTask(taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (status: string) => {
    if (draggedTask === null) return
    
    const task = tasks.find(t => t.id === draggedTask)
    if (!task) return

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

    const { data, error } = await supabase
      .from('milestones')
      .insert([{ 
        title: newMilestone.title, 
        description: newMilestone.description,
        due_date: newMilestone.due_date,
        completed: false,
        progress: 0
      }])
      .select()

    if (!error && data) {
      setMilestones([...milestones, data[0]])
      setNewMilestone({ title: '', description: '', due_date: '' })
    }
  }

  const updateMilestoneProgress = async (id: number, progress: number) => {
    const completed = progress >= 100
    await supabase.from('milestones').update({ progress, completed }).eq('id', id)
    setMilestones(milestones.map(m => m.id === id ? { ...m, progress, completed } : m))
  }

  const inviteTeamMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    const { data, error } = await supabase
      .from('team')
      .insert([{ email: inviteEmail, role: inviteRole }])
      .select()

    if (!error && data) {
      setTeam([...team, data[0]])
      setInviteEmail('')
      alert(`Invite sent to ${inviteEmail}`)
    }
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status)

  const completedTasks = tasks.filter(t => t.status === 'done').length
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length
  const totalTasks = tasks.length

  if (loading) return <div style={{ background: '#000', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

  return (
    <div style={{ background: '#000', color: '#e5e5e5', minHeight: '100vh' }}>
      <header style={{ background: '#111', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Sapien Eleven</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#888' }}>{user?.email}</span>
          <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Logout</button>
        </div>
      </header>

      <div style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#6366f1' }}>{totalTasks}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>Total</div>
          </div>
          <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#6366f1' }}>{getTasksByStatus('todo').length}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>To Do</div>
          </div>
          <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#f59e0b' }}>{inProgressTasks}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>In Progress</div>
          </div>
          <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#10b981' }}>{completedTasks}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>Done</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
          <button onClick={() => setActiveTab('board')} style={{ padding: '8px 16px', background: activeTab === 'board' ? '#333' : 'transparent', color: activeTab === 'board' ? '#fff' : '#888', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' }}>Board</button>
          <button onClick={() => setActiveTab('milestones')} style={{ padding: '8px 16px', background: activeTab === 'milestones' ? '#333' : 'transparent', color: activeTab === 'milestones' ? '#fff' : '#888', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' }}>Milestones</button>
          <button onClick={() => setActiveTab('files')} style={{ padding: '8px 16px', background: activeTab === 'files' ? '#333' : 'transparent', color: activeTab === 'files' ? '#fff' : '#888', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' }}>Files</button>
          <button onClick={() => setActiveTab('team')} style={{ padding: '8px 16px', background: activeTab === 'team' ? '#333' : 'transparent', color: activeTab === 'team' ? '#fff' : '#888', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '14px' }}>Team</button>
        </div>

        {activeTab === 'board' && (
          <div>
            <form onSubmit={addTask} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Add a task..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                style={{ flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              />
              <select 
                value={taskPriority} 
                onChange={(e) => setTaskPriority(e.target.value as any)}
                style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="text"
                placeholder="Assignee"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', width: '120px' }}
              />
              <button type="submit" style={{ padding: '12px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Add</button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {COLUMNS.map(column => (
                <div 
                  key={column.id}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(column.id)}
                  style={{ background: '#0a0a0a', borderRadius: '12px', padding: '1rem', minHeight: '400px', border: '1px solid #222' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #222' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: column.color }} />
                    <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{column.title}</span>
                    <span style={{ marginLeft: 'auto', background: '#222', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: '#888' }}>{getTasksByStatus(column.id).length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {getTasksByStatus(column.id).map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', cursor: 'grab', transition: 'transform 0.15s, box-shadow 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: PRIORITY_COLORS[task.priority] }} />
                          <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>{task.priority}</span>
                          <button 
                            onClick={() => deleteTask(task.id)}
                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ fontWeight: '500', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{task.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>{task.assignee}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div>
            <form onSubmit={addMilestone} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Milestone title..."
                value={newMilestone.title}
                onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                style={{ flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              />
              <input
                type="text"
                placeholder="Description"
                value={newMilestone.description}
                onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                style={{ flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              />
              <input
                type="date"
                value={newMilestone.due_date}
                onChange={(e) => setNewMilestone({ ...newMilestone, due_date: e.target.value })}
                style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              />
              <button type="submit" style={{ padding: '12px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Add</button>
            </form>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {milestones.map(milestone => (
                <div key={milestone.id} style={{ background: '#111', padding: '1.5rem', borderRadius: '12px', border: milestone.completed ? '1px solid #10b981' : '1px solid #333' }}>
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>{milestone.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: '#888', marginBottom: '1rem' }}>{milestone.description}</p>
                  <div style={{ background: '#222', height: '8px', borderRadius: '4px', marginBottom: '0.5rem', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: milestone.completed ? '#10b981' : '#6366f1', width: `${milestone.progress}%`, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666' }}>
                    <span>{milestone.progress}%</span>
                    <span>{milestone.due_date}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={milestone.progress}
                    onChange={(e) => updateMilestoneProgress(milestone.id, parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '1rem' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {files.map(file => (
                <div key={file.id} style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                  <p style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>{file.name}</p>
                  <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>View</a>
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '0.5rem' }}>by {file.uploaded_by}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div>
            <form onSubmit={inviteTeamMember} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: 1, padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              />
              <select 
                value={inviteRole} 
                onChange={(e) => setInviteRole(e.target.value)}
                style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px' }}
              >
                <option value="developer">Developer</option>
                <option value="designer">Designer</option>
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Invite</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {team.map(member => (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '12px', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
                  <span style={{ flex: 1 }}>{member.email}</span>
                  <span style={{ background: '#222', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
