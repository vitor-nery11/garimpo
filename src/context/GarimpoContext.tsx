import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  garimpoApi,
  mapApiConnToUi,
  type ApiWhatsAppStatus,
} from '../services/api';
import type {
  AppTab,
  BackendMode,
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
  backendMode: BackendMode;
  retryApiConnection: () => Promise<void>;
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
  requestWhatsappQrCode: () => Promise<void>;
  refreshWhatsappStatus: () => Promise<void>;
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
      hasWhatsapp: true,
      alreadyQueued: existingNames.has(companyName.toLowerCase()),
    });
    idx += 1;
  }

  return combined.slice(0, limit);
}

export function GarimpoProvider({ children }: { children: ReactNode }) {
  const [backendMode, setBackendMode] = useState<BackendMode>('demo');
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
  const [apiWithinHours, setApiWithinHours] = useState<boolean | null>(null);
  const [nextDispatchSeconds, setNextDispatchSeconds] = useState<number>(102); // 1m 42s
  const [searchResults, setSearchResults] = useState<ProspectingCandidate[]>(() =>
    PROSPECTING_CATALOG.slice(0, 8)
  );
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const lastWaStatusRef = useRef<ApiWhatsAppStatus>({
    connected: false,
    state: 'close',
    instance_name: 'garimpo_prospeccao',
  });

  // Persist local fallback state only while in demo mode
  useEffect(() => {
    if (backendMode === 'demo') {
      localStorage.setItem(STORAGE_KEYS.leads, JSON.stringify(leads));
    }
  }, [leads, backendMode]);

  useEffect(() => {
    if (backendMode === 'demo') {
      localStorage.setItem(STORAGE_KEYS.brain, JSON.stringify(brainConfig));
    }
  }, [brainConfig, backendMode]);

  useEffect(() => {
    if (backendMode === 'demo') {
      localStorage.setItem(STORAGE_KEYS.connections, JSON.stringify(connectionConfig));
    }
  }, [connectionConfig, backendMode]);

  useEffect(() => {
    if (backendMode === 'demo') {
      localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(dailyStats));
    }
  }, [dailyStats, backendMode]);

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

  const syncFromApi = useCallback(async (includeSettings: boolean) => {
    const [dashboard, apiLeads] = await Promise.all([
      garimpoApi.getDashboard(),
      garimpoApi.listLeads(),
    ]);

    setWorkerRunning(dashboard.worker.running);
    setApiWithinHours(dashboard.worker.within_business_hours);
    setNextDispatchSeconds(dashboard.worker.next_dispatch_seconds);
    setDailyStats({
      leadsExtractedToday: dashboard.metrics.leads_extracted_today,
      messagesSentToday: dashboard.metrics.messages_sent_today,
      repliesReceivedToday: dashboard.metrics.replies_received_today,
    });
    setLeads(apiLeads);
    setSelectedChatLeadId((prev) => {
      if (prev && apiLeads.some((l) => l.id === prev)) return prev;
      return (
        apiLeads.find((l) => l.stage === 'assumir_conversa')?.id ??
        apiLeads[0]?.id ??
        null
      );
    });

    if (includeSettings) {
      const [brain, connRaw, waStatus] = await Promise.all([
        garimpoApi.getBrainSettings(),
        garimpoApi.getConnectionSettingsRaw(),
        garimpoApi.getWhatsAppStatus(),
      ]);
      lastWaStatusRef.current = waStatus;
      setBrainConfig(brain);
      setConnectionConfig((prev) => ({
        ...mapApiConnToUi(connRaw, waStatus),
        whatsappQrBase64: waStatus.qr_code_base64 ?? prev.whatsappQrBase64 ?? null,
      }));
    } else {
      setConnectionConfig((prev) => ({
        ...prev,
        whatsappConnected: dashboard.worker.whatsapp_connected,
      }));
    }
  }, []);

  const bootstrapApi = useCallback(
    async (notifyOnSuccess = false) => {
      try {
        await garimpoApi.health();
        await syncFromApi(true);
        setBackendMode('api');
        if (notifyOnSuccess) {
          pushToast(
            'Conectado ao backend FastAPI',
            'Dados sincronizados com PostgreSQL e Redis.',
            'success'
          );
        }
      } catch {
        setBackendMode('demo');
        if (notifyOnSuccess) {
          pushToast(
            'Backend indisponível no momento',
            'Continuando em Modo Demo local.',
            'warning'
          );
        }
      }
    },
    [syncFromApi, pushToast]
  );

  // Initial API discovery
  useEffect(() => {
    void bootstrapApi(false);
  }, [bootstrapApi]);

  // Real-time 5s polling when connected to FastAPI backend
  useEffect(() => {
    if (backendMode !== 'api') return;
    const interval = window.setInterval(() => {
      void syncFromApi(false).catch(() => {
        // Keep current mode on transient hiccup; user can manually retry if needed
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [backendMode, syncFromApi]);

  const isWithinBusinessHours = useMemo(() => {
    if (backendMode === 'api' && apiWithinHours !== null) {
      return apiWithinHours;
    }
    return checkWithinBusinessHours(
      brainConfig.allowedStartTime,
      brainConfig.allowedEndTime
    );
  }, [backendMode, apiWithinHours, brainConfig.allowedStartTime, brainConfig.allowedEndTime]);

  // Local 1s countdown tick for Worker indicator
  useEffect(() => {
    if (!workerRunning || !isWithinBusinessHours || !connectionConfig.whatsappConnected) {
      return;
    }

    const timer = window.setInterval(() => {
      setNextDispatchSeconds((prev) => {
        if (prev <= 1) {
          if (backendMode === 'api') return 0;
          const min = Math.max(15, brainConfig.minIntervalSec);
          const max = Math.max(min, brainConfig.maxIntervalSec);
          return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    backendMode,
    workerRunning,
    isWithinBusinessHours,
    connectionConfig.whatsappConnected,
    brainConfig.minIntervalSec,
    brainConfig.maxIntervalSec,
  ]);

  const toggleWorker = useCallback(() => {
    if (backendMode === 'api') {
      void garimpoApi
        .toggleWorker()
        .then(({ running }) => {
          setWorkerRunning(running);
          pushToast(
            running ? 'Worker ativado' : 'Worker pausado',
            running
              ? 'Os disparos automáticos retomaram respeitando a cadência anti-ban.'
              : 'Todos os disparos em fila foram pausados imediatamente.',
            running ? 'success' : 'warning'
          );
        })
        .catch(() => {
          pushToast('Erro ao alternar Worker', 'Verifique a conexão com a API.', 'warning');
        });
      return;
    }

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
  }, [backendMode, pushToast]);

  const openLeadInChat = useCallback((leadId: string) => {
    setSelectedChatLeadId(leadId);
    setActiveTab('chat');
  }, []);

  const runProspectingSearch = useCallback(
    (city: string, niche: string, limit: number) => {
      setIsSearching(true);
      if (backendMode === 'api') {
        void garimpoApi
          .searchProspects(city, niche, limit)
          .then((results) => {
            setSearchResults(results);
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
          })
          .catch(() => {
            pushToast('Erro na busca', 'Falha ao consultar o endpoint de prospecção.', 'warning');
          })
          .finally(() => setIsSearching(false));
        return;
      }

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
    [backendMode, leads, pushToast]
  );

  const sendCandidatesToQueue = useCallback(
    (candidateIds: string[]) => {
      const selected = searchResults.filter(
        (c) => candidateIds.includes(c.id) && !c.alreadyQueued
      );
      if (selected.length === 0) return;

      if (backendMode === 'api') {
        void garimpoApi
          .enqueueProspects(selected)
          .then(async (res) => {
            setSearchResults((prev) =>
              prev.map((item) =>
                candidateIds.includes(item.id) ? { ...item, alreadyQueued: true } : item
              )
            );
            await syncFromApi(false);
            pushToast(
              `${res.enqueued_count} lead(s) enviados para a fila`,
              res.skipped_duplicates > 0
                ? `${res.skipped_duplicates} duplicado(s) ignorado(s).`
                : 'Já disponíveis na fila do Redis e coluna "Na Fila" do Kanban.',
              'success'
            );
          })
          .catch(() => {
            pushToast('Erro ao enfileirar leads', 'Não foi possível salvar no backend.', 'warning');
          });
        return;
      }

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
    [backendMode, searchResults, syncFromApi, pushToast]
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

      if (backendMode === 'api') {
        void garimpoApi
          .updateLeadStage(leadId, newStage)
          .then((updated) => {
            setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
          })
          .catch(() => {
            pushToast('Erro ao mover etapa', 'Falha ao sincronizar etapa com o servidor.', 'warning');
          });
      }
    },
    [backendMode, pushToast]
  );

  const toggleLeadAi = useCallback(
    (leadId: string) => {
      const currentLead = leads.find((l) => l.id === leadId);
      if (!currentLead) return;
      const nextAi = !currentLead.aiActive;

      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? { ...lead, aiActive: nextAi } : lead))
      );

      if (backendMode === 'api') {
        void garimpoApi
          .toggleLeadAi(leadId, nextAi)
          .then((updated) => {
            setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
            pushToast(
              nextAi ? 'IA reativada para este contato' : 'IA pausada para este contato',
              currentLead.companyName,
              nextAi ? 'info' : 'warning'
            );
          })
          .catch(() => {
            pushToast('Erro ao alternar IA', 'Não foi possível atualizar no servidor.', 'warning');
          });
        return;
      }

      pushToast(
        nextAi ? 'IA reativada para este contato' : 'IA pausada para este contato',
        currentLead.companyName,
        nextAi ? 'info' : 'warning'
      );
    },
    [backendMode, leads, pushToast]
  );

  const sendManualMessage = useCallback(
    (leadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (backendMode === 'api') {
        void garimpoApi
          .sendManualMessage(leadId, trimmed)
          .then((msg) => {
            setLeads((prev) =>
              prev.map((lead) => {
                if (lead.id !== leadId) return lead;
                const nextStage: FunnelStage =
                  lead.stage === 'na_fila' || lead.stage === 'abordado'
                    ? 'assumir_conversa'
                    : lead.stage;
                return {
                  ...lead,
                  aiActive: false,
                  stage: nextStage,
                  lastMessageMinutesAgo: 0,
                  messages: [...lead.messages, msg],
                };
              })
            );
            setDailyStats((prev) => ({
              ...prev,
              messagesSentToday: prev.messagesSentToday + 1,
            }));
          })
          .catch(() => {
            pushToast('Erro ao enviar mensagem', 'Falha na comunicação com a API.', 'warning');
          });
        return;
      }

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
            aiActive: false,
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
    [backendMode, pushToast]
  );

  const updateBrainConfig = useCallback(
    (next: BrainConfig) => {
      if (backendMode === 'api') {
        void garimpoApi
          .updateBrainSettings(next)
          .then((saved) => {
            setBrainConfig(saved);
            pushToast(
              'Configurações da IA salvas',
              'Prompt, variações e regras anti-ban gravados no PostgreSQL.',
              'success'
            );
          })
          .catch(() => {
            pushToast('Erro ao salvar configurações', 'Verifique a conexão com a API.', 'warning');
          });
        return;
      }

      setBrainConfig(next);
      pushToast(
        'Configurações da IA salvas',
        'Prompt, variações e regras anti-ban atualizados.',
        'success'
      );
    },
    [backendMode, pushToast]
  );

  const updateConnectionConfig = useCallback(
    (next: ConnectionConfig) => {
      if (backendMode === 'api') {
        void garimpoApi
          .updateConnectionSettings(next, lastWaStatusRef.current)
          .then((saved) => {
            setConnectionConfig((prev) => ({
              ...saved,
              whatsappQrBase64: prev.whatsappQrBase64,
            }));
            pushToast(
              'Conexões & Alertas atualizados',
              'Chaves e telefone de alerta salvos no PostgreSQL.',
              'success'
            );
          })
          .catch(() => {
            pushToast('Erro ao salvar chaves', 'Falha na comunicação com o backend.', 'warning');
          });
        return;
      }

      setConnectionConfig(next);
      pushToast(
        'Conexões & Alertas atualizados',
        'Chaves e número de alerta salvos com segurança.',
        'success'
      );
    },
    [backendMode, pushToast]
  );

  const requestWhatsappQrCode = useCallback(async () => {
    if (backendMode !== 'api') return;
    try {
      const wa = await garimpoApi.connectWhatsApp();
      lastWaStatusRef.current = wa;
      setConnectionConfig((prev) => ({
        ...prev,
        whatsappConnected: wa.connected,
        whatsappDeviceName: wa.instance_name || prev.whatsappDeviceName,
        whatsappQrBase64: wa.qr_code_base64 ?? null,
        lastSyncAt: wa.connected ? 'Conectado' : 'Aguardando leitura do QR Code',
      }));
      if (wa.qr_code_base64) {
        pushToast('QR Code gerado', 'Escaneie pelo WhatsApp em Aparelhos Conectados.', 'info');
      } else {
        pushToast(
          'Evolution API indisponível',
          'Suba o container evolution-api para gerar o QR Code real.',
          'warning'
        );
      }
    } catch {
      pushToast('Erro ao solicitar QR Code', 'Falha ao chamar /whatsapp/connect.', 'warning');
    }
  }, [backendMode, pushToast]);

  const refreshWhatsappStatus = useCallback(async () => {
    if (backendMode !== 'api') {
      pushToast('Instância verificada', 'Modo Demo ativo.', 'info');
      return;
    }
    try {
      const wa = await garimpoApi.getWhatsAppStatus();
      lastWaStatusRef.current = wa;
      setConnectionConfig((prev) => ({
        ...prev,
        whatsappConnected: wa.connected,
        whatsappDeviceName: wa.instance_name || prev.whatsappDeviceName,
        whatsappPhone: wa.phone || prev.whatsappPhone,
        lastSyncAt: wa.connected ? 'Agora mesmo' : wa.state,
      }));
      pushToast(
        wa.connected ? 'WhatsApp conectado' : 'WhatsApp desconectado',
        `Estado atual da instância: ${wa.state}`,
        wa.connected ? 'success' : 'warning'
      );
    } catch {
      pushToast('Erro ao verificar status', 'Falha ao consultar /whatsapp/status.', 'warning');
    }
  }, [backendMode, pushToast]);

  const toggleWhatsappConnection = useCallback(
    (connected: boolean) => {
      if (backendMode === 'api') {
        if (!connected) {
          void garimpoApi
            .logoutWhatsApp()
            .then(() => {
              lastWaStatusRef.current = {
                ...lastWaStatusRef.current,
                connected: false,
                state: 'close',
              };
              setConnectionConfig((prev) => ({
                ...prev,
                whatsappConnected: false,
                whatsappQrBase64: null,
                lastSyncAt: 'Desconectado',
              }));
              pushToast(
                'Instância desconectada',
                'Sessão encerrada na Evolution API.',
                'warning'
              );
            })
            .catch(() => {
              pushToast('Erro ao desconectar', 'Falha ao chamar /whatsapp/logout.', 'warning');
            });
        } else {
          void requestWhatsappQrCode();
        }
        return;
      }

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
    [backendMode, pushToast, requestWhatsappQrCode]
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
    backendMode,
    retryApiConnection: () => bootstrapApi(true),
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
    requestWhatsappQrCode,
    refreshWhatsappStatus,
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
