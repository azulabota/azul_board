'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

interface Task {
  id: number
  title: string
  completed: boolean
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

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('tasks')
  const [tasks, setTasks] = useState<Task[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

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

    if (tasksRes.data) setTasks(tasksRes.data)
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
        completed: false, 
        priority: taskPriority,
        assignee: taskAssignee || 'Unassigned'
      }])
      .select()

    if (!error && data) {
      setTasks([data[0], ...tasks])
      setNewTask('')
    }
  }

  const toggleTask = async (id: number, completed: boolean) => {
    await supabase.from('tasks').update({ completed }).eq('id', id)
    setTasks(tasks.map(t => t.id === id ? { ...t, completed } : t))
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

    // In production, you'd send an invite email
    // For now, we just add to the team table
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

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (!fileInput.files?.length) return

    const file = fileInput.files[0]
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `${user?.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(filePath, file)

    if (uploadError) {
      alert('Error uploading file')
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('project-files')
      .getPublicUrl(filePath)

    const { data, error } = await supabase
      .from('files')
      .insert([{ 
        name: file.name, 
        url: publicUrl, 
        uploaded_by: user?.email 
      }])
      .select()

    if (!error && data) {
      setFiles([data[0], ...files])
    }
    fileInput.value = ''
  }

  const completedTasks = tasks.filter(t => t.completed).length
  const totalTasks = tasks.length

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Sapien Eleven - Project Dashboard</h1>
        <div className="user-info">
          <span>{user?.email}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="stats-grid">
          <div className="stat-card">
            <h3>{totalTasks}</h3>
            <p>Total Tasks</p>
          </div>
          <div className="stat-card">
            <h3>{completedTasks}</h3>
            <p>Completed</p>
          </div>
          <div className="stat-card">
            <h3>{totalTasks - completedTasks}</h3>
            <p>Remaining</p>
          </div>
          <div className="stat-card">
            <h3>{milestones.filter(m => m.completed).length}/{milestones.length}</h3>
            <p>Milestones</p>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Tasks</button>
          <button className={`tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>Milestones</button>
          <button className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>Files</button>
          <button className={`tab ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>Team</button>
        </div>

        {activeTab === 'tasks' && (
          <div className="section">
            <h2>Tasks</h2>
            <form className="task-form" onSubmit={addTask}>
              <input
                type="text"
                placeholder="New task..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as any)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="text"
                placeholder="Assignee"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
              />
              <button type="submit">Add Task</button>
            </form>
            <div className="task-list">
              {tasks.map(task => (
                <div key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={task.completed}
                    onChange={(e) => toggleTask(task.id, e.target.checked)}
                  />
                  <span className="task-title">{task.title}</span>
                  <span className={`task-priority ${task.priority}`}>{task.priority}</span>
                  <span className="task-assignee">{task.assignee}</span>
                  <button className="task-delete" onClick={() => deleteTask(task.id)}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div className="section">
            <h2>Milestones</h2>
            <form className="task-form" onSubmit={addMilestone}>
              <input
                type="text"
                placeholder="Milestone title..."
                value={newMilestone.title}
                onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
              />
              <input
                type="text"
                placeholder="Description"
                value={newMilestone.description}
                onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
              />
              <input
                type="date"
                value={newMilestone.due_date}
                onChange={(e) => setNewMilestone({ ...newMilestone, due_date: e.target.value })}
              />
              <button type="submit">Add Milestone</button>
            </form>
            <div className="milestone-list">
              {milestones.map(milestone => (
                <div key={milestone.id} className={`milestone-card ${milestone.completed ? 'completed' : ''}`}>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description}</p>
                  <div className="milestone-progress">
                    <div 
                      className={`milestone-progress-bar ${milestone.completed ? 'completed' : ''}`}
                      style={{ width: `${milestone.progress}%` }}
                    />
                  </div>
                  <div className="milestone-meta">
                    <span>Progress: {milestone.progress}%</span>
                    <span>Due: {milestone.due_date}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={milestone.progress}
                    onChange={(e) => updateMilestoneProgress(milestone.id, parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '10px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="section">
            <h2>Files</h2>
            <form className="upload-form" onSubmit={handleFileUpload}>
              <input type="file" id="file-upload" />
              <button type="submit">Upload</button>
            </form>
            <div className="files-grid">
              {files.map(file => (
                <div key={file.id} className="file-card">
                  <p>{file.name}</p>
                  <a href={file.url} target="_blank" rel="noopener noreferrer">View</a>
                  <p style={{ fontSize: '12px', color: '#666' }}>by {file.uploaded_by}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="section">
            <h2>Team</h2>
            <form className="invite-form" onSubmit={inviteTeamMember}>
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="developer">Developer</option>
                <option value="designer">Designer</option>
                <option value="manager">Project Manager</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit">Invite</button>
            </form>
            <div className="task-list">
              {team.map(member => (
                <div key={member.id} className="task-item">
                  <span className="task-title">{member.email}</span>
                  <span className={`task-priority ${member.role === 'manager' ? 'high' : 'low'}`}>{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
