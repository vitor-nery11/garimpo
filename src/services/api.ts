import type {
  BrainConfig,
  ChatMessage,
  ConnectionConfig,
  FunnelStage,
  Lead,
  MessageSender,
  ProspectingCandidate,
  SiteDiagnostic,
} from '../types/garimpo';

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000/api/v1';

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 10000
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      ...init,
    });

    if (!response.ok) {
      const rawText = await response.text();
      let message = rawText || `Erro HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(rawText) as { detail?: string };
        if (parsed.detail) message = parsed.detail;
      } catch {
        // Keep rawText
      }
      throw new Error(message);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Tempo limite excedido ao aguardar resposta do servidor. Tente novamente.'
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Backend DTOs (snake_case)
// ---------------------------------------------------------------------------

interface ApiMessage {
  id: string;
  sender: MessageSender;
  text: string;
  created_at: string;
}

interface ApiLead {
  id: string;
  company_name: string;
  niche: string;
  city: string;
  neighborhood: string;
  phone: string;
  website_url?: string | null;
  instagram_handle?: string | null;
  diagnostic: SiteDiagnostic;
  stage: FunnelStage;
  ai_active: boolean;
  handoff_summary?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  last_message_at?: string | null;
  created_at: string;
  messages: ApiMessage[];
}

interface ApiCandidate {
  id: string;
  company_name: string;
  niche: string;
  city: string;
  neighborhood: string;
  phone: string;
  website_url?: string | null;
  instagram_handle?: string | null;
  diagnostic: SiteDiagnostic;
  rating?: number | null;
  reviews_count?: number | null;
  has_whatsapp?: boolean;
  already_queued?: boolean;
}

interface ApiBrainConfig {
  persona_prompt: string;
  problem_solved: string;
  common_objections: string;
  handoff_triggers: string;
  templates: Array<{ id: string; label: string; content: string }>;
  allowed_start_time: string;
  allowed_end_time: string;
  max_daily_messages: number;
  min_interval_sec: number;
  max_interval_sec: number;
}

interface ApiConnectionConfig {
  alert_phone: string;
  search_provider: 'playwright' | 'google_places' | 'serper';
  search_api_key: string;
  ai_provider: 'openai' | 'gemini';
  ai_api_key: string;
}

export interface ApiWhatsAppStatus {
  connected: boolean;
  state: string;
  instance_name: string;
  phone?: string | null;
  qr_code_base64?: string | null;
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
  hot_leads: ApiLead[];
  stage_counts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Mappers (snake_case <-> camelCase)
// ---------------------------------------------------------------------------

function formatTimeLabel(isoDate: string): string {
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function computeMinutesAgo(isoDate?: string | null): number {
  if (!isoDate) return 0;
  const dt = new Date(isoDate).getTime();
  if (Number.isNaN(dt)) return 0;
  return Math.max(0, Math.floor((Date.now() - dt) / 60000));
}

export function mapApiMessage(dto: ApiMessage): ChatMessage {
  return {
    id: dto.id,
    sender: dto.sender,
    text: dto.text,
    timestamp: dto.created_at,
    timeLabel: formatTimeLabel(dto.created_at),
  };
}

export function mapApiLead(dto: ApiLead): Lead {
  return {
    id: dto.id,
    companyName: dto.company_name,
    niche: dto.niche,
    city: dto.city,
    neighborhood: dto.neighborhood,
    phone: dto.phone,
    websiteUrl: dto.website_url ?? undefined,
    instagramHandle: dto.instagram_handle ?? undefined,
    diagnostic: dto.diagnostic,
    stage: dto.stage,
    aiActive: dto.ai_active,
    lastMessageMinutesAgo: computeMinutesAgo(dto.last_message_at),
    handoffSummary: dto.handoff_summary ?? undefined,
    rating: dto.rating ?? undefined,
    reviewsCount: dto.reviews_count ?? undefined,
    messages: (dto.messages ?? []).map(mapApiMessage),
  };
}

export function mapApiCandidate(dto: ApiCandidate): ProspectingCandidate {
  return {
    id: dto.id,
    companyName: dto.company_name,
    niche: dto.niche,
    city: dto.city,
    neighborhood: dto.neighborhood,
    phone: dto.phone,
    websiteUrl: dto.website_url ?? undefined,
    instagramHandle: dto.instagram_handle ?? undefined,
    diagnostic: dto.diagnostic,
    rating: dto.rating ?? 4.5,
    reviewsCount: dto.reviews_count ?? 0,
    hasWhatsapp: dto.has_whatsapp ?? true,
    alreadyQueued: dto.already_queued ?? false,
  };
}

export function mapApiBrainToUi(dto: ApiBrainConfig): BrainConfig {
  return {
    personaPrompt: dto.persona_prompt,
    problemSolved: dto.problem_solved,
    commonObjections: dto.common_objections,
    handoffTriggers: dto.handoff_triggers,
    templates: dto.templates,
    allowedStartTime: dto.allowed_start_time,
    allowedEndTime: dto.allowed_end_time,
    maxDailyMessages: dto.max_daily_messages,
    minIntervalSec: dto.min_interval_sec,
    maxIntervalSec: dto.max_interval_sec,
  };
}

export function mapUiBrainToApi(cfg: BrainConfig): ApiBrainConfig {
  return {
    persona_prompt: cfg.personaPrompt,
    problem_solved: cfg.problemSolved,
    common_objections: cfg.commonObjections,
    handoff_triggers: cfg.handoffTriggers,
    templates: cfg.templates,
    allowed_start_time: cfg.allowedStartTime,
    allowed_end_time: cfg.allowedEndTime,
    max_daily_messages: cfg.maxDailyMessages,
    min_interval_sec: cfg.minIntervalSec,
    max_interval_sec: cfg.maxIntervalSec,
  };
}

export function mapApiConnToUi(
  dto: ApiConnectionConfig,
  wa: ApiWhatsAppStatus
): ConnectionConfig {
  return {
    whatsappConnected: wa.connected,
    whatsappPhone: wa.phone || 'Instância pareada via Evolution API',
    whatsappDeviceName: wa.instance_name || 'garimpo_prospeccao',
    whatsappQrBase64: wa.qr_code_base64 ?? null,
    lastSyncAt: wa.connected ? 'Sincronizado agora' : wa.state,
    alertPhone: dto.alert_phone,
    searchProvider: dto.search_provider,
    searchApiKey: dto.search_api_key,
    aiProvider: dto.ai_provider,
    aiApiKey: dto.ai_api_key,
  };
}

export function mapUiConnToApi(cfg: ConnectionConfig): ApiConnectionConfig {
  return {
    alert_phone: cfg.alertPhone,
    search_provider: cfg.searchProvider,
    search_api_key: cfg.searchApiKey,
    ai_provider: cfg.aiProvider,
    ai_api_key: cfg.aiApiKey,
  };
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export const garimpoApi = {
  health: () => request<{ status: string; service: string }>('/health', undefined, 3000),

  getDashboard: () => request<ApiDashboardResponse>('/dashboard'),

  toggleWorker: () =>
    request<{ running: boolean }>('/worker/toggle', { method: 'POST' }),

  searchProspects: async (city: string, niche: string, limit: number) => {
    const res = await request<ApiCandidate[]>(
      '/prospecting/search',
      {
        method: 'POST',
        body: JSON.stringify({ city, niche, limit }),
      },
      120000
    );
    return res.map(mapApiCandidate);
  },

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

  listLeads: async (stage?: FunnelStage) => {
    const path = stage ? `/leads?stage=${encodeURIComponent(stage)}` : '/leads';
    const res = await request<ApiLead[]>(path);
    return res.map(mapApiLead);
  },

  updateLeadStage: async (leadId: string, stage: FunnelStage) => {
    const res = await request<ApiLead>(`/leads/${leadId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    });
    return mapApiLead(res);
  },

  toggleLeadAi: async (leadId: string, aiActive: boolean) => {
    const res = await request<ApiLead>(`/leads/${leadId}/ai`, {
      method: 'PATCH',
      body: JSON.stringify({ ai_active: aiActive }),
    });
    return mapApiLead(res);
  },

  sendManualMessage: async (leadId: string, text: string) => {
    const res = await request<ApiMessage>(`/leads/${leadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return mapApiMessage(res);
  },

  getBrainSettings: async () => {
    const res = await request<ApiBrainConfig>('/settings/brain');
    return mapApiBrainToUi(res);
  },

  updateBrainSettings: async (config: BrainConfig) => {
    const res = await request<ApiBrainConfig>('/settings/brain', {
      method: 'PUT',
      body: JSON.stringify(mapUiBrainToApi(config)),
    });
    return mapApiBrainToUi(res);
  },

  getConnectionSettingsRaw: () => request<ApiConnectionConfig>('/settings/connections'),

  updateConnectionSettings: async (
    config: ConnectionConfig,
    waStatus: ApiWhatsAppStatus
  ) => {
    const res = await request<ApiConnectionConfig>('/settings/connections', {
      method: 'PUT',
      body: JSON.stringify(mapUiConnToApi(config)),
    });
    return mapApiConnToUi(res, waStatus);
  },

  getWhatsAppStatus: () => request<ApiWhatsAppStatus>('/whatsapp/status'),

  connectWhatsApp: () =>
    request<ApiWhatsAppStatus>('/whatsapp/connect', { method: 'POST' }, 15000),

  logoutWhatsApp: () =>
    request<{ logged_out: boolean }>('/whatsapp/logout', { method: 'POST' }),

  sendTestAlert: (phone: string) =>
    request<{ sent: boolean; phone: string }>('/whatsapp/test-alert', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  testBrainChat: (payload: {
    company_name: string;
    niche: string;
    city: string;
    neighborhood?: string;
    diagnostic: SiteDiagnostic;
    persona_prompt: string;
    problem_solved: string;
    common_objections: string;
    handoff_triggers: string;
    messages: Array<{ sender: 'lead' | 'ai'; text: string }>;
  }) =>
    request<{
      action: 'reply' | 'handoff';
      reply_text: string | null;
      handoff_summary: string | null;
      reason: string | null;
      provider_used: string;
      model_used: string;
    }>(
      '/settings/brain/test-chat',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      45000
    ),

  testBrainWhatsApp: (payload: {
    phone?: string;
    company_name: string;
    niche: string;
    city: string;
    neighborhood?: string;
    diagnostic: SiteDiagnostic;
    persona_prompt: string;
    problem_solved: string;
    common_objections: string;
    handoff_triggers: string;
    opening_message?: string;
  }) =>
    request<{
      sent: boolean;
      lead_id: string;
      phone: string;
      opening_message: string;
    }>('/settings/brain/test-whatsapp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteLead: (leadId: string) =>
    request<{ deleted: boolean }>(`/leads/${leadId}`, { method: 'DELETE' }),
};
