const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Deal {
  id: number;
  company_name: string;
  asset_name?: string;
  indication?: string;
  stage?: string;
  round_type?: string;
  therapeutic_area?: string;
  geography?: string;
  fund_thesis?: string;
  memo_format?: string;
  status: string;
  investment_amount?: number;
  moic?: number;
  irr?: number;
  moic_submitted_at?: string;
  peak_revenue_m?: number;
  market_sizing_submitted_at?: string;
  exit_base_moic?: number;
  exit_base_irr?: number;
  exit_submitted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DealCreate {
  company_name: string;
  asset_name?: string;
  indication?: string;
  stage?: string;
  round_type?: string;
  therapeutic_area?: string;
  geography?: string;
  fund_thesis?: string;
  memo_format?: string;
  status?: string;
  investment_amount?: number;
}

export interface Document {
  id: number;
  deal_id: number;
  filename: string;
  file_path: string;
  status: string;
  created_at: string;
}

export interface AgentOutput {
  id: number;
  deal_id: number;
  agent_name: string;
  output_json: string;
  status: string;
  created_at: string;
}

export interface Memo {
  id: number;
  deal_id: number;
  markdown: string;
  created_at: string;
}

export interface Comment {
  id: number;
  deal_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

// ── Deals ────────────────────────────────────────────────────────────────────

export function getDeals(): Promise<Deal[]> {
  return apiFetch("/deals");
}

export function getDeal(dealId: number): Promise<Deal> {
  return apiFetch(`/deals/${dealId}`);
}

export function createDeal(data: DealCreate): Promise<Deal> {
  return apiFetch("/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateDeal(dealId: number, data: Partial<DealCreate>): Promise<Deal> {
  return apiFetch(`/deals/${dealId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Analytics submissions ─────────────────────────────────────────────────────

export function submitCapTable(dealId: number, moic: number, irr: number): Promise<Deal> {
  return apiFetch(`/deals/${dealId}/submit-cap-table`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moic, irr }),
  });
}

export function submitMarketSizing(dealId: number, peak_revenue_m: number): Promise<Deal> {
  return apiFetch(`/deals/${dealId}/submit-market-sizing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ peak_revenue_m }),
  });
}

export function submitExit(dealId: number, base_moic: number, base_irr: number): Promise<Deal> {
  return apiFetch(`/deals/${dealId}/submit-exit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_moic, base_irr }),
  });
}

// ── Documents ────────────────────────────────────────────────────────────────

export function getDocuments(dealId: number): Promise<Document[]> {
  return apiFetch(`/deals/${dealId}/documents`);
}

export function uploadDocument(dealId: number, file: File): Promise<Document> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/deals/${dealId}/documents`, { method: "POST", body: form });
}

export function indexDocuments(dealId: number): Promise<{ message: string }> {
  return apiFetch(`/deals/${dealId}/index-documents`, { method: "POST" });
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface AgentRun {
  id: number;
  deal_id: number;
  status: "running" | "completed" | "failed";
  error?: string;
  started_at: string;
  completed_at?: string;
}

export function runAgents(dealId: number): Promise<AgentRun> {
  return apiFetch(`/deals/${dealId}/run-agents`, { method: "POST" });
}

export function getAgentRunStatus(dealId: number): Promise<AgentRun> {
  return apiFetch(`/deals/${dealId}/agent-run-status`);
}

export function getAgentOutputs(dealId: number): Promise<AgentOutput[]> {
  return apiFetch(`/deals/${dealId}/agent-outputs`);
}

// ── Founder Insights ─────────────────────────────────────────────────────────

export interface FounderInsights {
  id: number;
  deal_id: number;
  meeting_notes?: string;
  key_impressions?: string;
  ratings_json?: string;
  created_at: string;
  updated_at: string;
}

export interface FounderInsightsCreate {
  meeting_notes?: string;
  key_impressions?: string;
  ratings_json?: string;
}

export function getFounderInsights(dealId: number): Promise<FounderInsights> {
  return apiFetch(`/deals/${dealId}/founder-insights`);
}

export function saveFounderInsights(dealId: number, data: FounderInsightsCreate): Promise<FounderInsights> {
  return apiFetch(`/deals/${dealId}/founder-insights`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export interface AgentFeedback {
  id: number;
  deal_id: number;
  agent_name: string;
  feedback_text: string;
  created_at: string;
}

export function getFeedback(dealId: number): Promise<AgentFeedback[]> {
  return apiFetch(`/deals/${dealId}/feedback`);
}

export function saveFeedback(dealId: number, agent_name: string, feedback_text: string): Promise<AgentFeedback> {
  return apiFetch(`/deals/${dealId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_name, feedback_text }),
  });
}

// ── Memo ─────────────────────────────────────────────────────────────────────

export function generateMemo(dealId: number): Promise<Memo> {
  return apiFetch(`/deals/${dealId}/generate-memo`, { method: "POST" });
}

export function getMemo(dealId: number): Promise<Memo> {
  return apiFetch(`/deals/${dealId}/memo`);
}

export function getMemoExportUrl(dealId: number): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return `${base}/deals/${dealId}/memo/export`;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export function getComments(dealId: number): Promise<Comment[]> {
  return apiFetch(`/deals/${dealId}/comments`);
}

export function addComment(dealId: number, author_name: string, body: string): Promise<Comment> {
  return apiFetch(`/deals/${dealId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author_name, body }),
  });
}
