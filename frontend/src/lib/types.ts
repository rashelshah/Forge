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

export type Level = 'low' | 'medium' | 'high'
export interface MvpComponent { id: string; name: string; description: string; complexity: Level; effort_days: number; depends_on: string[]; feature: string }
export interface MvpStrategy {
  recommendation: { headline: string; biggest_challenge: string; prioritize: string[]; delay: string[]; reason: string }
  build_vs_buy: { component: string; decision: 'build' | 'buy'; provider: string; reason: string; time_saved: string }[]
  components: MvpComponent[]
  complexity: { frontend: Level; backend: Level; infrastructure: Level; overall: Level; bootstrap_cost: string; agency_cost: string; team_cost: string }
  risks: { title: string; severity: Level; explanation: string; mitigation: string }[]
  metrics: { feature: string; metric: string }[]
  avoid: { name: string; reason: string }[]
  investor: { technical_complexity: Level; scalability: Level; defensibility: Level; monetization: Level; execution_risk: Level; note: string }
}

export interface MvpPlan {
  summary: string
  strategy?: MvpStrategy
  features: { name: string; description: string; priority: 'must' | 'should' | 'could'; reason?: string; user_impact?: Level; effort?: Level }[]
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
  html: string | null
  summary: string
  build?: { status: 'building' | 'error'; stage?: 'spec' | 'code' | 'check'; app_name?: string; screens?: string[]; started_at?: string; error?: string; agent?: string; iteration?: number; studio_project_id?: string } | null
  studio_project_id?: string
  studio_score?: number
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
  category?: string | null
  strategic_threat?: number | null
  profile?: CompetitorProfile | null
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
  occurred_on?: string | null
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
  admin?: boolean
  founder_profile: FounderProfile
  settings: { daily_monitoring?: boolean }
  limits: Plan
  usage: { ventures: number; agentRuns: number }
  plans: Record<string, Plan>
}
export interface Config { db: 'supabase' | 'local'; ai: { mode: Mode | 'offline'; openai?: boolean; tavily?: boolean; firecrawl?: boolean; vector?: 'pgvector' | 'local'; embeddings?: string; model?: string | null; fast_models?: string[] | null; vector_error?: string | null } }

export interface DesignReference {
  id: string
  name: string
  url: string
  industry: string | null
  subcategory: string | null
  target_audience: string | null
  style: string | null
  analysis?: string | null
  metadata_json: Record<string, unknown>
  homepage_screenshot: string | null
  dashboard_screenshot: string | null
  mobile_screenshot: string | null
  status: 'queued' | 'analyzing' | 'done' | 'failed'
  error: string | null
  created_at: string
  updated_at: string
  score?: number
  match?: { kind: string; text: string }
}

export interface StudioProject {
  id: string
  name: string
  idea: string
  audience: string | null
  industry: string | null
  requirements: string | null
  max_iterations: number
  status: 'queued' | 'running' | 'done' | 'failed'
  stage: string | null
  iteration: number
  best_iteration: number | null
  scores: Record<string, number>
  error: string | null
  created_at: string
  updated_at: string
}
export interface StudioEvent { id: string; agent: string; status: 'running' | 'done' | 'failed'; summary: string | null; detail: string | null; iteration: number; created_at: string }
export interface StudioArtifact { id: string; kind: string; iteration: number; content: any; created_at: string }
export interface StudioVersion { iteration: number; created_at: string; summary: string | null; bytes: number | null }
export interface StudioDetail { project: StudioProject; events: StudioEvent[]; artifacts: StudioArtifact[]; versions: StudioVersion[] }

export interface CompetitorProfile {
  category: string; summary: string; why_it_matters: string; strategic_threat: number; threat_reason: string
  strengths: string[]; weaknesses: string[]; features: string[]; metrics: { name: string; value: string }[]
  recent_activity: { kind: string; title: string; detail: string; date: string | null; source_url: string; response: string }[]
  potential_impact: string; suggested_response: string; positioning_trend: string
}
export interface IntelAction {
  title: string; kind: string; reason: string; impact: string; confidence: number
  evidence: { competitor: string; fact: string; source_url: string; basis: 'website' | 'news' | 'history' | 'analysis' }[]
}
export interface RadarItem { feature: string; count: number; percent: number; us: boolean }
export interface IntelReport {
  brief: { period: string; counts: { label: string; count: number; competitors: string[] }[]; market_trend: string; recommendation: string; baseline?: string[] }
  insight: { insight: string; recommendation: string }
  actions: IntelAction[]
  matrix: { competitors: string[]; rows: { feature: string; us: boolean; competitors: string[] }[] }
  radar: Record<'emerging' | 'growing' | 'saturated' | 'white_space', RadarItem[]>
  positioning: { axes: { x_left: string; x_right: string; y_low: string; y_high: string }; points: { name: string; us: boolean; x: number; y: number; reason: string }[] }
  skipped?: { name: string; reason: string }[]
  generated_at?: string
  build?: { status: 'running' | 'error'; started_at?: string; error?: string } | null
  history?: { at: string; market_trend: string; recommendation: string }[]
}
export interface MemoryMetric { name: string; first: { value: string; at: string }; last: { value: string; at: string }; changed: boolean; points: number }
export interface IntelData { report: Report<IntelReport> | null; competitors: Competitor[]; signals: Signal[]; market: Signal[]; memory: Record<string, MemoryMetric[]> }

export interface FounderBrief { status: string; opportunity: string; risk: string; recommendation: string; confidence: number }
export interface RecommendedAction { title: string; description: string; priority: 'High' | 'Medium' | 'Low'; source: string }
export type ReadinessKey = 'validation' | 'research' | 'competitors' | 'boardroom' | 'prototype' | 'experiments'
export interface ReadinessDetail { progress: number; status: 'complete' | 'in_progress' | 'not_started'; current: string; missing: string[]; tab: string }
export type LaunchReadiness = Record<ReadinessKey, number> & { overallReadinessScore: number; details: Record<ReadinessKey, ReadinessDetail> }
export interface VentureCommand {
  brief: FounderBrief
  actions: RecommendedAction[]
  readiness: LaunchReadiness
  source: 'ai' | 'rules'
  generatedAt: string | null
  stale: boolean
  generating: boolean
  error: string | null
}

export interface GtmAsset { key: string; label: string; group: string; filename: string; url: string; bytes: number; preview: boolean }
export interface GtmRun { id: string; venture_id: string; status: 'queued' | 'running' | 'done' | 'failed'; stage: string | null; launch_score: number | null; error: string | null; updated_at: string }
export interface GtmEvent { id: string; agent: string; status: 'running' | 'done' | 'failed'; summary: string | null; detail: string | null; created_at: string }
export interface GtmData {
  run: GtmRun | null
  events: GtmEvent[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  artifacts: Record<string, any>
  prerequisites: { validation: boolean; prototype: boolean; mvp: boolean; ready: boolean }
}
