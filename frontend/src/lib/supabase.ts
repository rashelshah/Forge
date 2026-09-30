import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// No Supabase config = local demo mode: the API treats every request as the demo founder.
export const supabase = url && key ? createClient(url, key) : null
