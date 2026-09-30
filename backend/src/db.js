// Data access. Supabase Postgres when configured, otherwise a local JSON file so the studio runs with zero setup.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
export const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null
export const DB_MODE = supabase ? 'supabase' : 'local'

// match: { col: value } — null means IS NULL, an array means IN, { gte } means >=
const check = ({ data, error }) => {
  if (error) throw error
  return data
}
const where = (q, match) => {
  for (const [k, v] of Object.entries(match)) {
    q = v === null ? q.is(k, null) : Array.isArray(v) ? q.in(k, v) : v?.gte !== undefined ? q.gte(k, v.gte) : q.eq(k, v)
  }
  return q
}

const remote = {
  list: async (t, match = {}, { limit = 200, order = 'created_at', ascending = false, columns = '*' } = {}) =>
    check(await where(supabase.from(t).select(columns), match).order(order, { ascending }).limit(limit)),
  get: async (t, id) => check(await supabase.from(t).select('*').eq('id', id).maybeSingle()),
  insert: async (t, row) => check(await supabase.from(t).insert(row).select().single()),
  update: async (t, id, patch) => check(await supabase.from(t).update(patch).eq('id', id).select().single()),
  remove: async (t, match) => check(await where(supabase.from(t).delete(), match)),
  count: async (t, match = {}) => {
    const { count, error } = await where(supabase.from(t).select('id', { count: 'exact', head: true }), match)
    if (error) throw error
    return count
  },
}

// ponytail: single-process JSON file store for local dev; use Supabase for anything multi-user or deployed.
const file = new URL('../.data/db.json', import.meta.url)
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
let timer
const save = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    fs.mkdirSync(new URL('.', file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data))
  }, 150)
}
const rows = (t) => (data[t] ??= [])
const clone = (x) => (x == null ? null : structuredClone(x))
const matches = (r, m) => Object.entries(m).every(([k, v]) =>
  v === null ? r[k] == null : Array.isArray(v) ? v.includes(r[k]) : v?.gte !== undefined ? r[k] >= v.gte : r[k] === v)

const local = {
  list: async (t, match = {}, { limit = 200, order = 'created_at', ascending = false } = {}) =>
    rows(t).filter((r) => matches(r, match))
      .sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0) * (ascending ? 1 : -1))
      .slice(0, limit).map(clone),
  get: async (t, id) => clone(rows(t).find((r) => r.id === id)),
  insert: async (t, row) => {
    const r = { id: randomUUID(), created_at: new Date().toISOString(), ...row }
    rows(t).push(r)
    save()
    return clone(r)
  },
  update: async (t, id, patch) => {
    const r = rows(t).find((x) => x.id === id)
    if (!r) return null
    Object.assign(r, patch)
    save()
    return clone(r)
  },
  remove: async (t, match) => {
    data[t] = rows(t).filter((r) => !matches(r, match))
    save()
  },
  count: async (t, match = {}) => rows(t).filter((r) => matches(r, match)).length,
}

export const db = supabase ? remote : local
