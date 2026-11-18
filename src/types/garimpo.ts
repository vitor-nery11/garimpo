export type SiteDiagnostic = 'sem_site' | 'so_instagram' | 'possui_site';

export type FunnelStage =
  | 'na_fila'
  | 'abordado'
  | 'em_conversa_ia'
  | 'assumir_conversa'
  | 'proposta_fechado'
  | 'sem_interesse';

export type MessageSender = 'lead' | 'ai' | 'user';

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string; // ISO or HH:mm display string
  timeLabel: string;
}

export interface Lead {
  id: string;
  companyName: string;
  niche: string;
  city: string;
  neighborhood: string;
  phone: string; // digits only with country code e.g. 5511999990001
  websiteUrl?: string;
  instagramHandle?: string;
  diagnostic: SiteDiagnostic;
  stage: FunnelStage;
  aiActive: boolean;
  lastMessageMinutesAgo: number;
  handoffSummary?: string;
  messages: ChatMessage[];
  rating?: number;
  reviewsCount?: number;
}

export interface ProspectingCandidate {
  id: string;
  companyName: string;
  niche: string;
  city: string;
  neighborhood: string;
  phone: string;
  websiteUrl?: string;
  instagramHandle?: string;
  diagnostic: SiteDiagnostic;
  rating: number;
  reviewsCount: number;
  hasWhatsapp?: boolean;
  alreadyQueued?: boolean;
}

export interface MessageTemplate {
  id: string;
  label: string;
  content: string;
}

export interface BrainConfig {
  personaPrompt: string;
  problemSolved: string;
  commonObjections: string;
  handoffTriggers: string;
  templates: MessageTemplate[];
  allowedStartTime: string;
  allowedEndTime: string;
  maxDailyMessages: number;
  minIntervalSec: number;
  maxIntervalSec: number;
}

export interface ConnectionConfig {
  whatsappConnected: boolean;
  whatsappPhone: string;
  whatsappDeviceName: string;
  whatsappQrBase64?: string | null;
  lastSyncAt: string;
  alertPhone: string;
  searchProvider: 'playwright' | 'google_places' | 'serper';
  searchApiKey: string;
  aiProvider: 'openai' | 'gemini';
  aiApiKey: string;
}

export type BackendMode = 'api' | 'demo';

export interface DailyStats {
  leadsExtractedToday: number;
  messagesSentToday: number;
  repliesReceivedToday: number;
}

export type AppTab =
  | 'dashboard'
  | 'prospeccao'
  | 'kanban'
  | 'chat'
  | 'cerebro'
  | 'conexoes';

export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'warning';
}
