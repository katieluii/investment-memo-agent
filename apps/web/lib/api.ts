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
  geography?: string;
  fund_thesis?: string;
  memo_format?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DealCreate {
  company_name: string;
  asset_name?: string;
  indication?: string;
  stage?: string;
  round_type?: string;
  geography?: string;
  fund_thesis?: string;
  memo_format?: string;
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

export function updateDeal(dealId: number, data: DealCreate): Promise<Deal> {
  return apiFetch(`/deals/${dealId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
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

export function runAgents(dealId: number): Promise<{ message: string }> {
  return apiFetch(`/deals/${dealId}/run-agents`, { method: "POST" });
}

export function getAgentOutputs(dealId: number): Promise<AgentOutput[]> {
  return apiFetch(`/deals/${dealId}/agent-outputs`);
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
