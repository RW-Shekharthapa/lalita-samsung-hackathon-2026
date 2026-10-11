import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

// Dev preview reaches the API through the Ultron proxy; the deployed app serves it at /api.
const API = import.meta.env.DEV ? '/proxy/8080/api/folders' : '/api/folders'

async function request(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data === null) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

function Node({ folder, childrenOf, onAdd, onRename, onDelete, depth }) {
  const [open, setOpen] = useState(true)
  const kids = childrenOf[folder.id] || []
  return (
    <li>
      <div className="row" style={{ paddingLeft: depth * 20 }}>
        <button className="toggle" onClick={() => setOpen(!open)} disabled={!kids.length}>
          {kids.length ? (open ? '▾' : '▸') : '•'}
        </button>
        <span className="name">📁 {folder.name}</span>
        <span className="actions">
          <button onClick={() => onAdd(folder)}>+ Sub</button>
          <button onClick={() => onRename(folder)}>Rename</button>
          <button className="danger" onClick={() => onDelete(folder, kids.length)}>Delete</button>
        </span>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Node key={k.id} folder={k} childrenOf={childrenOf} depth={depth + 1}
              onAdd={onAdd} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function App() {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await request(API)
      setFolders(Array.isArray(list) ? list : [])
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const childrenOf = useMemo(() => {
    const map = {}
    for (const f of folders) (map[f.parentId || 'root'] ||= []).push(f)
    return map
  }, [folders])

  const run = async (fn) => {
    try { await fn(); await load() } catch (e) { setError(e.message) }
  }

  const create = (n, parentId) =>
    run(() => request(API, { method: 'POST', body: JSON.stringify({ name: n, parentId }) }))

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    await create(name, null)
    setName('')
  }

  const onAdd = (parent) => {
    const n = prompt(`New folder inside "${parent.name}":`)
    if (n !== null) create(n, parent.id)
  }
  const onRename = (f) => {
    const n = prompt('Rename folder:', f.name)
    if (n !== null && n.trim() !== f.name)
      run(() => request(`${API}/${f.id}`, { method: 'PATCH', body: JSON.stringify({ name: n }) }))
  }
  const onDelete = (f, kids) => {
    const msg = kids ? `Delete "${f.name}" and all its subfolders?` : `Delete "${f.name}"?`
    if (confirm(msg)) run(() => request(`${API}/${f.id}`, { method: 'DELETE' }))
  }

  const roots = childrenOf.root || []

  return (
    <main className="app">
      <h1>Folder Manager</h1>
      <form onSubmit={submit} className="add">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder name" />
        <button type="submit">Create</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading…</p> : roots.length === 0 ? (
        <p className="empty">No folders yet. Create your first one above.</p>
      ) : (
        <ul className="tree">
          {roots.map((f) => (
            <Node key={f.id} folder={f} childrenOf={childrenOf} depth={0}
              onAdd={onAdd} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </main>
  )
}
