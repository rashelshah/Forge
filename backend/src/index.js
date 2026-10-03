import fs from 'node:fs'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import { DB_MODE, db } from './db.js'
import { ai, auth } from './core.js'
import copilot from './routes/copilot.js'
import design from './routes/design.js'
import gtm from './routes/gtm.js'
import command from './routes/command.js'
import intel from './routes/intel.js'
import market from './routes/market.js'
import memory from './routes/memory.js'
import studio from './routes/studio.js'
import publicRoutes from './routes/public.js'
import ventures from './routes/ventures.js'
import workspace, { monitorUser } from './routes/workspace.js'

const app = express()
const PORT = Number(process.env.API_PORT) || 4000

// Gzip JSON (research reports and prototypes are large); never buffer a server-sent event stream.
app.use(compression({ filter: (req, res) => !String(res.getHeader('content-type') ?? '').includes('text/event-stream') && compression.filter(req, res) }))
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (req, res) => res.json({ ok: true, db: DB_MODE }))
// Pinged by the site on load and by uptime monitors: keeps the AI service awake too, so the first agent run isn't a cold start.
app.get('/api/ping', (req, res) => {
  ai('/health', undefined, { timeout: 5000 }).catch(() => {})
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() })
})
app.use(publicRoutes)
app.use('/api', auth, ventures, workspace, design, studio, intel, market, memory, command, gtm, copilot)
app.use((req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, req, res, next) => {
  if (!err.status) console.error(err)
  if (res.headersSent) return res.end()
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' })
})

// Forge library rows (the AI service indexes the same seed file into pgvector).
const seed = JSON.parse(fs.readFileSync(new URL('../../shared/knowledge-seed.json', import.meta.url), 'utf8'))
for (const d of seed) {
  if (!(await db.get('knowledge_documents', d.id))) {
    await db.insert('knowledge_documents', {
      id: d.id, user_id: null, title: d.title, category: d.category, source: d.source, url: d.url,
      content: d.content, chunk_count: Math.ceil(d.content.length / 900), status: 'indexed',
    })
  }
}

// Continuous monitoring: daily sweep of competitors and markets for every user who has it enabled.
const DAY = 24 * 60 * 60 * 1000
setInterval(async () => {
  for (const u of await db.list('users', {}, { limit: 10000 })) {
    if (u.settings?.daily_monitoring === false) continue
    await monitorUser(u).catch((e) => console.error('monitoring failed for', u.id, e.message))
  }
}, DAY)

app.listen(PORT, () => console.log(`Forge API on :${PORT} (db: ${DB_MODE})`))
