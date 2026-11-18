import type {
  BrainConfig,
  ConnectionConfig,
  FunnelStage,
  Lead,
  ProspectingCandidate,
} from '../types/garimpo';

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Erro HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export interface ApiDashboardResponse {
  worker: {
    running: boolean;
    within_business_hours: boolean;
    whatsapp_connected: boolean;
    next_dispatch_seconds: number;
    queue_size: number;
  };
  metrics: {
    leads_extracted_today: number;
    messages_sent_today: number;
    replies_received_today: number;
    response_rate: number;
    hot_leads_count: number;
  };
  hot_leads: unknown[];
  stage_counts: Record<string, number>;
}

export const garimpoApi = {
  health: () => request<{ status: string; service: string }>('/health'),
  getDashboard: () => request<ApiDashboardResponse>('/dashboard'),
  toggleWorker: () =>
    request<{ running: boolean }>('/worker/toggle', { method: 'POST' }),

  searchProspects: (city: string, niche: string, limit: number) =>
    request<ProspectingCandidate[]>('/prospecting/search', {
      method: 'POST',
      body: JSON.stringify({ city, niche, limit }),
    }),

  enqueueProspects: (candidates: ProspectingCandidate[]) =>
    request<{ enqueued_count: number; skipped_duplicates: number; lead_ids: string[] }>(
      '/prospecting/queue',
      {
        method: 'POST',
        body: JSON.stringify({
          candidates: candidates.map((c) => ({
            company_name: c.companyName,
            niche: c.niche,
            city: c.city,
            neighborhood: c.neighborhood,
            phone: c.phone,
            website_url: c.websiteUrl ?? null,
            instagram_handle: c.instagramHandle ?? null,
            diagnostic: c.diagnostic,
            rating: c.rating,
            reviews_count: c.reviewsCount,
          })),
        }),
      }
    ),

  listLeads: (stage?: FunnelStage) =>
    request<Lead[]>(stage ? `/leads?stage=${encodeURIComponent(stage)}` : '/leads'),

  updateLeadStage: (leadId: string, stage: FunnelStage) =>
    request<Lead>(`/leads/${leadId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    }),

  toggleLeadAi: (leadId: string, aiActive: boolean) =>
    request<Lead>(`/leads/${leadId}/ai`, {
      method: 'PATCH',
      body: JSON.stringify({ ai_active: aiActive }),
    }),

  sendManualMessage: (leadId: string, text: string) =>
    request<{ id: string; sender: string; text: string; created_at: string }>(
      `/leads/${leadId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    ),

  getBrainSettings: () => request<BrainConfig>('/settings/brain'),
  updateBrainSettings: (config: BrainConfig) =>
    request<BrainConfig>('/settings/brain', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getConnectionSettings: () => request<ConnectionConfig>('/settings/connections'),
  updateConnectionSettings: (config: ConnectionConfig) =>
    request<ConnectionConfig>('/settings/connections', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getWhatsAppStatus: () =>
    request<{
      connected: boolean;
      state: string;
      instance_name: string;
      phone?: string | null;
      qr_code_base64?: string | null;
    }>('/whatsapp/status'),

  connectWhatsApp: () =>
    request<{
      connected: boolean;
      state: string;
      instance_name: string;
      qr_code_base64?: string | null;
    }>('/whatsapp/connect', { method: 'POST' }),

  logoutWhatsApp: () =>
    request<{ logged_out: boolean }>('/whatsapp/logout', { method: 'POST' }),
};
