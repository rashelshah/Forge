export type Mode = 'live' | 'demo'
export type Stage = 'idea' | 'validating' | 'building' | 'launched' | 'paused' | 'killed'
export type ScoreKey = 'demand' | 'competition' | 'defensibility' | 'revenue_potential' | 'founder_fit'

export interface Source { title: string; url?: string | null; type?: 'web' | 'library'; platform?: string }

export interface Opportunity {
  title: string
  problem: string
  frequency: string
  mentions: number
  pain_level: number
  potential_customers: string
  market_size: string
  market_size_reasoning: string
  sources: Source[]
  quotes: string[]
}

export interface Venture {
  id: string
  name: string
  idea: string
  stage: Stage
  opportunity: Opportunity | null
  scores: Partial<Record<ScoreKey, number>>
  overall_score: number | null
  verdict: string | null
  created_at: string
  updated_at: string
}

export interface ScoreDetail { score: number; summary: string; evidence: ({ claim: string } & Source)[] }
export type Validation = Record<ScoreKey, ScoreDetail> & {
  overall: number
  summary: string
  verdict: 'Promising' | 'Needs evidence' | 'Weak'
  key_risks: string[]
  competitors: { name: string; url?: string; description: string }[]
  web_sources: number
  mode: Mode
}

export interface MvpPlan {
  summary: string
  features: { name: string; description: string; priority: 'must' | 'should' | 'could' }[]
  user_stories: { as_a: string; i_want: string; so_that: string; acceptance: string[] }[]
  database_schema: { table: string; columns: { name: string; type: string; note?: string }[] }[]
  apis: { method: string; path: string; description: string }[]
  architecture: { nodes: { id: string; label: string; layer: 'client' | 'api' | 'service' | 'data' | 'external' }[]; edges: { source: string; target: string; label?: string }[] }
  sprint_plan: { sprint: number; goal: string; tasks: string[] }[]
  team: { role: string; count: number; why: string }[]
  stack: string[]
  monthly_cost_estimate: string
  mode: Mode
}

export interface PrototypeContent {
  title: string
  html: string
  summary: string
  history: { instruction: string; summary: string; at: string }[]
  previous_html: string | null
  mode: Mode
}

export interface ExperimentAnalysis { outcome: 'validated' | 'invalidated' | 'inconclusive'; summary: string; insights: string[]; recommended_next: string[]; conversion: number; mode: Mode }

export type ReportKind = 'discovery' | 'validation' | 'mvp' | 'prototype' | 'landing' | 'experiment_analysis'
export interface Report<C = unknown> {
  id: string
  venture_id: string | null
  kind: ReportKind
  title: string
  summary: string | null
  content: C
  mode: Mode
  created_at: string
}

export type AgentKey = 'ceo' | 'investor' | 'product' | 'growth' | 'technical' | 'failure'
export interface BoardMessage { agent: AgentKey; name: string; round: number; content: string; key_point: string; stance: 'support' | 'concern' | 'oppose'; vote: Decision }
export type Decision = 'GO' | 'PIVOT' | 'KILL'
export interface Verdict {
  decision: Decision
  confidence: number
  headline?: string
  reasons?: string[]
  summary: string
  consensus: string[]
  disagreements: string[]
  critical_assumptions: { assumption: string; risk: 'low' | 'medium' | 'high'; test: string }[]
  next_steps: string[]
  votes: Record<Decision, number>
}
export interface BoardSession {
  id: string
  venture_id: string
  question: string
  rounds: number
  transcript: BoardMessage[]
  verdict: Verdict | null
  status: 'running' | 'completed' | 'failed'
  mode: Mode | null
  created_at: string
}

export interface Competitor {
  id: string
  venture_id: string
  name: string
  url: string | null
  description: string | null
  threat_level: 'low' | 'medium' | 'high'
  snapshot: { prices: string[]; headings: string[] } | null
  last_checked_at: string | null
  created_at: string
}

export interface Signal {
  id: string
  venture_id: string | null
  competitor_id: string | null
  type: string
  title: string
  detail: string | null
  recommended_response: string | null
  severity: 'info' | 'low' | 'medium' | 'high'
  source_url: string | null
  created_at: string
}

export interface Experiment {
  id: string
  venture_id: string
  name: string
  hypothesis: string | null
  type: 'prototype' | 'landing_page' | 'survey' | 'interviews' | 'ads' | 'other'
  slug: string
  prototype: { title: string; html: string } | null
  target_conversion: number
  metrics: { visitors: number; signups: number; feedback: number; conversion: number }
  status: 'draft' | 'running' | 'completed'
  result: string | null
  created_at: string
  events?: { id: string; type: 'visit' | 'signup' | 'feedback' | 'survey'; payload: Record<string, string>; created_at: string }[]
}

export interface KnowledgeDoc { id: string; user_id: string | null; title: string; category: string; source: string | null; url: string | null; chunk_count: number; status: string; created_at: string; content?: string }
export interface Chunk { doc_id: string; title: string; text: string; category: string; url?: string | null; score: number }

export interface Memory { id: string; venture_id: string; kind: string; title: string; content: string; created_at: string }
export interface Activity { id: string; venture_id: string | null; actor: string; action: string; detail: string | null; created_at: string }
export interface AgentRun { id: string; venture_id: string | null; agent: string; status: 'running' | 'succeeded' | 'failed'; mode: Mode | null; output_summary: string | null; error: string | null; duration_ms: number | null; created_at: string }
export interface Notification { id: string; venture_id: string | null; type: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }

export interface FounderProfile { skills?: string[]; industries?: string[]; years_experience?: number; weekly_hours?: number; capital?: string; background?: string }
export interface Plan { name: string; price: number; ventures: number | null; agentRuns: number }
export interface Me {
  id: string
  email: string
  full_name: string
  plan: 'free' | 'pro' | 'studio'
  founder_profile: FounderProfile
  settings: { daily_monitoring?: boolean }
  limits: Plan
  usage: { ventures: number; agentRuns: number }
  plans: Record<string, Plan>
}
export interface Config { db: 'supabase' | 'local'; ai: { mode: Mode | 'offline'; openai?: boolean; tavily?: boolean; firecrawl?: boolean; vector?: 'pgvector' | 'local'; embeddings?: string; model?: string | null; fast_models?: string[] | null; vector_error?: string | null } }
