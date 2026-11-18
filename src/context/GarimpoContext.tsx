import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  INITIAL_BRAIN_CONFIG,
  INITIAL_CONNECTION_CONFIG,
  INITIAL_DAILY_STATS,
  INITIAL_LEADS,
  PROSPECTING_CATALOG,
} from '../data/mockData';
import type {
  AppTab,
  BrainConfig,
  ConnectionConfig,
  DailyStats,
  FunnelStage,
  Lead,
  ProspectingCandidate,
  SiteDiagnostic,
  ToastNotification,
} from '../types/garimpo';

interface GarimpoContextValue {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  leads: Lead[];
  selectedChatLeadId: string | null;
  setSelectedChatLeadId: (id: string | null) => void;
  openLeadInChat: (leadId: string) => void;
  workerRunning: boolean;
  toggleWorker: () => void;
  nextDispatchSeconds: number;
  isWithinBusinessHours: boolean;
  dailyStats: DailyStats;
  hotLeads: Lead[];
  responseRate: number;
  // Prospecção
  searchResults: ProspectingCandidate[];
  isSearching: boolean;
  runProspectingSearch: (city: string, niche: string, limit: number) => void;
  sendCandidatesToQueue: (candidateIds: string[]) => void;
  // Kanban
  moveLeadStage: (leadId: string, newStage: FunnelStage) => void;
  // Chat
  toggleLeadAi: (leadId: string) => void;
  sendManualMessage: (leadId: string, text: string) => void;
  // Brain
  brainConfig: BrainConfig;
  updateBrainConfig: (next: BrainConfig) => void;
  // Connections
  connectionConfig: ConnectionConfig;
  updateConnectionConfig: (next: ConnectionConfig) => void;
  toggleWhatsappConnection: (connected: boolean) => void;
  // Toasts
  toasts: ToastNotification[];
  pushToast: (title: string, description?: string, type?: ToastNotification['type']) => void;
  dismissToast: (id: string) => void;
}

const GarimpoContext = createContext<GarimpoContextValue | null>(null);

const STORAGE_KEYS = {
  leads: 'garimpo_leads_v1',
  brain: 'garimpo_brain_v1',
  connections: 'garimpo_connections_v1',
  stats: 'garimpo_stats_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function checkWithinBusinessHours(start: string, end: string): boolean {
  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return true;
  }
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return currentMin >= startMin && currentMin <= endMin;
}

function generateDynamicCandidates(
  city: string,
  niche: string,
  limit: number,
  existingLeads: Lead[]
): ProspectingCandidate[] {
  const cleanCity = city.trim() || 'São Paulo';
  const cleanNiche = niche.trim() || 'Clínica Odontológica';
  const existingNames = new Set(existingLeads.map((l) => l.companyName.toLowerCase()));

  const matchingCatalog = PROSPECTING_CATALOG.filter((item) => {
    const cityMatch =
      !city.trim() ||
      item.city.toLowerCase().includes(cleanCity.toLowerCase()) ||
      item.neighborhood.toLowerCase().includes(cleanCity.toLowerCase());
    const nicheMatch =
      !niche.trim() || item.niche.toLowerCase().includes(cleanNiche.toLowerCase());
    return cityMatch && nicheMatch;
  });

  const prefixes = [
    'Centro',
    'Clínica',
    'Espaço',
    'Grupo',
    'Studio',
    'Instituto',
    'Oficina',
    'Rede',
    'Casa',
    'Soluções',
    'Prime',
    'Ateliê',
  ];
  const suffixes = [
    'Prime',
    'Integrada',
    'Premium',
    'Brasil',
    'Moderna',
    'Master',
    'Nova Era',
    'Excelência',
    'Avançada',
    'Pro',
    'Express',
    'Popular',
  ];
  const neighborhoods = ['Centro', 'Jardins', 'Vila Nova', 'Boa Vista', 'Santa Cruz', 'Industrial'];
  const diagnostics: SiteDiagnostic[] = [
    'sem_site',
    'so_instagram',
    'sem_site',
    'possui_site',
    'so_instagram',
    'sem_site',
  ];

  const combined: ProspectingCandidate[] = matchingCatalog.map((item) => ({
    ...item,
    alreadyQueued: existingNames.has(item.companyName.toLowerCase()),
  }));

  let idx = 0;
  while (combined.length < limit) {
    const prefix = prefixes[idx % prefixes.length];
    const suffix = suffixes[(idx * 3 + 1) % suffixes.length];
    const neighborhood = neighborhoods[(idx * 2) % neighborhoods.length];
    const diagnostic = diagnostics[idx % diagnostics.length];
    const shortNiche = cleanNiche.split(' ')[0] || 'Comercial';
    const companyName = `${prefix} ${shortNiche} ${suffix} ${idx + 1}`;
    const slug = companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');

    combined.push({
      id: `gen-${Date.now()}-${idx}`,
      companyName,
      niche: cleanNiche,
      city: cleanCity,
      neighborhood,
      phone: `55119${String(81000000 + idx * 13791).slice(0, 8)}`,
      diagnostic,
      websiteUrl: diagnostic === 'possui_site' ? `https://${slug}.com.br` : undefined,
      instagramHandle: diagnostic === 'so_instagram' ? `@${slug}` : undefined,
      rating: Number((4.3 + ((idx * 7) % 7) * 0.1).toFixed(1)),
      reviewsCount: 24 + ((idx * 19) % 180),
      alreadyQueued: existingNames.has(companyName.toLowerCase()),
    });
    idx += 1;
  }

  return combined.slice(0, limit);
}

export function GarimpoProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [leads, setLeads] = useState<Lead[]>(() =>
    loadFromStorage(STORAGE_KEYS.leads, INITIAL_LEADS)
  );
  const [brainConfig, setBrainConfig] = useState<BrainConfig>(() =>
    loadFromStorage(STORAGE_KEYS.brain, INITIAL_BRAIN_CONFIG)
  );
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>(() =>
    loadFromStorage(STORAGE_KEYS.connections, INITIAL_CONNECTION_CONFIG)
  );
  const [dailyStats, setDailyStats] = useState<DailyStats>(() =>
    loadFromStorage(STORAGE_KEYS.stats, INITIAL_DAILY_STATS)
  );

  const [selectedChatLeadId, setSelectedChatLeadId] = useState<string | null>(
    () => leads.find((l) => l.stage === 'assumir_conversa')?.id ?? leads[0]?.id ?? null
  );

  const [workerRunning, setWorkerRunning] = useState<boolean>(true);
  const [nextDispatchSeconds, setNextDispatchSeconds] = useState<number>(102); // 1m 42s
  const [searchResults, setSearchResults] = useState<ProspectingCandidate[]>(() =>
    PROSPECTING_CATALOG.slice(0, 8)
  );
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.leads, JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.brain, JSON.stringify(brainConfig));
  }, [brainConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.connections, JSON.stringify(connectionConfig));
  }, [connectionConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(dailyStats));
  }, [dailyStats]);

  const isWithinBusinessHours = useMemo(
    () => checkWithinBusinessHours(brainConfig.allowedStartTime, brainConfig.allowedEndTime),
    [brainConfig.allowedStartTime, brainConfig.allowedEndTime]
  );

  const pushToast = useCallback(
    (title: string, description?: string, type: ToastNotification['type'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, title, description, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Countdown tick for the Worker indicator
  useEffect(() => {
    if (!workerRunning || !isWithinBusinessHours || !connectionConfig.whatsappConnected) {
      return;
    }

    const timer = window.setInterval(() => {
      setNextDispatchSeconds((prev) => {
        if (prev <= 1) {
          const min = Math.max(15, brainConfig.minIntervalSec);
          const max = Math.max(min, brainConfig.maxIntervalSec);
          return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    workerRunning,
    isWithinBusinessHours,
    connectionConfig.whatsappConnected,
    brainConfig.minIntervalSec,
    brainConfig.maxIntervalSec,
  ]);

  const toggleWorker = useCallback(() => {
    setWorkerRunning((prev) => {
      const next = !prev;
      pushToast(
        next ? 'Worker ativado' : 'Worker pausado',
        next
          ? 'Os disparos automáticos retomaram respeitando a cadência anti-ban.'
          : 'Todos os disparos em fila foram pausados imediatamente.',
        next ? 'success' : 'warning'
      );
      return next;
    });
  }, [pushToast]);

  const openLeadInChat = useCallback((leadId: string) => {
    setSelectedChatLeadId(leadId);
    setActiveTab('chat');
  }, []);

  const runProspectingSearch = useCallback(
    (city: string, niche: string, limit: number) => {
      setIsSearching(true);
      window.setTimeout(() => {
        const results = generateDynamicCandidates(city, niche, limit, leads);
        setSearchResults(results);
        setIsSearching(false);
        const eligibleCount = results.filter((r) => r.diagnostic !== 'possui_site').length;
        setDailyStats((prev) => ({
          ...prev,
          leadsExtractedToday: prev.leadsExtractedToday + results.length,
        }));
        pushToast(
          `${results.length} empresas encontradas`,
          `${eligibleCount} elegíveis (sem site ou apenas Instagram/Linktree).`,
          'info'
        );
      }, 650);
    },
    [leads, pushToast]
  );

  const sendCandidatesToQueue = useCallback(
    (candidateIds: string[]) => {
      const selected = searchResults.filter(
        (c) => candidateIds.includes(c.id) && !c.alreadyQueued
      );
      if (selected.length === 0) return;

      const newLeads: Lead[] = selected.map((c) => ({
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        companyName: c.companyName,
        niche: c.niche,
        city: c.city,
        neighborhood: c.neighborhood,
        phone: c.phone,
        websiteUrl: c.websiteUrl,
        instagramHandle: c.instagramHandle,
        diagnostic: c.diagnostic,
        stage: 'na_fila',
        aiActive: true,
        lastMessageMinutesAgo: 0,
        rating: c.rating,
        reviewsCount: c.reviewsCount,
        messages: [],
      }));

      setLeads((prev) => [...newLeads, ...prev]);
      setSearchResults((prev) =>
        prev.map((item) =>
          candidateIds.includes(item.id) ? { ...item, alreadyQueued: true } : item
        )
      );
      pushToast(
        `${newLeads.length} lead(s) enviados para a fila`,
        'Eles já estão na coluna "Na Fila" do Funil de Vendas.',
        'success'
      );
    },
    [searchResults, pushToast]
  );

  const moveLeadStage = useCallback(
    (leadId: string, newStage: FunnelStage) => {
      setLeads((prev) =>
        prev.map((lead) => {
          if (lead.id !== leadId) return lead;
          const shouldPauseAi =
            newStage === 'assumir_conversa' ||
            newStage === 'proposta_fechado' ||
            newStage === 'sem_interesse';
          return {
            ...lead,
            stage: newStage,
            aiActive: shouldPauseAi ? false : lead.aiActive,
          };
        })
      );
    },
    []
  );

  const toggleLeadAi = useCallback(
    (leadId: string) => {
      setLeads((prev) =>
        prev.map((lead) => {
          if (lead.id !== leadId) return lead;
          const nextAi = !lead.aiActive;
          pushToast(
            nextAi ? 'IA reativada para este contato' : 'IA pausada para este contato',
            lead.companyName,
            nextAi ? 'info' : 'warning'
          );
          return { ...lead, aiActive: nextAi };
        })
      );
    },
    [pushToast]
  );

  const sendManualMessage = useCallback(
    (leadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = new Date();
      const timeLabel = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      setLeads((prev) =>
        prev.map((lead) => {
          if (lead.id !== leadId) return lead;
          const nextStage: FunnelStage =
            lead.stage === 'na_fila' || lead.stage === 'abordado'
              ? 'assumir_conversa'
              : lead.stage;
          return {
            ...lead,
            aiActive: false, // Rule: sending manual message automatically disables AI for this lead
            stage: nextStage,
            lastMessageMinutesAgo: 0,
            messages: [
              ...lead.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'user',
                text: trimmed,
                timestamp: now.toISOString(),
                timeLabel,
              },
            ],
          };
        })
      );
      setDailyStats((prev) => ({
        ...prev,
        messagesSentToday: prev.messagesSentToday + 1,
      }));
    },
    []
  );

  const updateBrainConfig = useCallback(
    (next: BrainConfig) => {
      setBrainConfig(next);
      pushToast(
        'Configurações da IA salvas',
        'Prompt, variações e regras anti-ban atualizados.',
        'success'
      );
    },
    [pushToast]
  );

  const updateConnectionConfig = useCallback(
    (next: ConnectionConfig) => {
      setConnectionConfig(next);
      pushToast(
        'Conexões & Alertas atualizados',
        'Chaves e número de alerta salvos com segurança.',
        'success'
      );
    },
    [pushToast]
  );

  const toggleWhatsappConnection = useCallback(
    (connected: boolean) => {
      setConnectionConfig((prev) => ({
        ...prev,
        whatsappConnected: connected,
        lastSyncAt: connected ? 'Agora mesmo' : 'Desconectado',
      }));
      pushToast(
        connected ? 'WhatsApp pareado com sucesso' : 'Instância desconectada',
        connected
          ? 'Sessão pronta para iniciar ou retomar os disparos.'
          : 'Leia o QR Code para reconectar seu chip de prospecção.',
        connected ? 'success' : 'warning'
      );
    },
    [pushToast]
  );

  const hotLeads = useMemo(
    () =>
      leads
        .filter((l) => l.stage === 'assumir_conversa')
        .sort((a, b) => a.lastMessageMinutesAgo - b.lastMessageMinutesAgo),
    [leads]
  );

  const responseRate = useMemo(() => {
    if (dailyStats.messagesSentToday === 0) return 0;
    return Math.round((dailyStats.repliesReceivedToday / dailyStats.messagesSentToday) * 100);
  }, [dailyStats]);

  const value: GarimpoContextValue = {
    activeTab,
    setActiveTab,
    leads,
    selectedChatLeadId,
    setSelectedChatLeadId,
    openLeadInChat,
    workerRunning,
    toggleWorker,
    nextDispatchSeconds,
    isWithinBusinessHours,
    dailyStats,
    hotLeads,
    responseRate,
    searchResults,
    isSearching,
    runProspectingSearch,
    sendCandidatesToQueue,
    moveLeadStage,
    toggleLeadAi,
    sendManualMessage,
    brainConfig,
    updateBrainConfig,
    connectionConfig,
    updateConnectionConfig,
    toggleWhatsappConnection,
    toasts,
    pushToast,
    dismissToast,
  };

  return <GarimpoContext.Provider value={value}>{children}</GarimpoContext.Provider>;
}

export function useGarimpo() {
  const ctx = useContext(GarimpoContext);
  if (!ctx) {
    throw new Error('useGarimpo must be used within GarimpoProvider');
  }
  return ctx;
}
