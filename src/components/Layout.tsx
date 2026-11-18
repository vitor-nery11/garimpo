import { useState, type ReactNode } from 'react';
import {
  BrainCircuit,
  Flame,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Pause,
  Pickaxe,
  Play,
  Plug,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useGarimpo } from '../context/GarimpoContext';
import type { AppTab } from '../types/garimpo';

interface NavItem {
  id: AppTab;
  label: string;
  shortDesc: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortDesc: 'Status & Métricas',
    icon: LayoutDashboard,
  },
  {
    id: 'prospeccao',
    label: 'Nova Prospecção',
    shortDesc: 'Captação & Filtro',
    icon: Search,
  },
  {
    id: 'kanban',
    label: 'Funil de Vendas',
    shortDesc: 'Kanban Comercial',
    icon: Kanban,
  },
  {
    id: 'chat',
    label: 'Central de Chat',
    shortDesc: 'Conversas & Transbordo',
    icon: MessageSquareText,
  },
  {
    id: 'cerebro',
    label: 'Cérebro da IA',
    shortDesc: 'Prompt & Anti-Ban',
    icon: BrainCircuit,
  },
  {
    id: 'conexoes',
    label: 'Conexões & Alertas',
    shortDesc: 'WhatsApp & Chaves',
    icon: Plug,
  },
];

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function Layout({ children }: { children: ReactNode }) {
  const {
    backendMode,
    retryApiConnection,
    activeTab,
    setActiveTab,
    hotLeads,
    workerRunning,
    toggleWorker,
    nextDispatchSeconds,
    isWithinBusinessHours,
    connectionConfig,
    toasts,
    dismissToast,
  } = useGarimpo();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const workerStatusText = !connectionConfig.whatsappConnected
    ? 'WhatsApp desconectado'
    : !workerRunning
      ? 'Pausado manualmente'
      : !isWithinBusinessHours
        ? 'Fora do horário comercial'
        : `Próx. em ${formatCountdown(nextDispatchSeconds)}`;

  const workerActive =
    workerRunning && isWithinBusinessHours && connectionConfig.whatsappConnected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Pickaxe className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white">Garimpo</span>
            <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
              B2B AI
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
          aria-label="Abrir menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-0 z-40 flex' : 'hidden'
        } lg:static lg:flex lg:w-68 lg:shrink-0 flex-col border-r border-slate-800/80 bg-slate-900/95 backdrop-blur`}
      >
        {/* Brand */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/40">
              <Pickaxe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white leading-none">
                Garimpo
              </h1>
              <p className="text-xs text-slate-400 mt-1">Prospecção & IA no WhatsApp</p>
            </div>
          </div>
          {mobileMenuOpen && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showHotBadge =
              (item.id === 'chat' || item.id === 'kanban') && hotLeads.length > 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/25 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4.5 h-4.5 shrink-0 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{item.shortDesc}</div>
                </div>
                {showHotBadge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Flame className="w-3 h-3 text-amber-400" />
                    {hotLeads.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Global Worker Mini Widget */}
        <div className="p-3.5 border-t border-slate-800/80">
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    workerActive
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-medium text-slate-200">
                  {workerActive ? 'Robô Rodando' : 'Robô Parado'}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleWorker}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  workerRunning
                    ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                }`}
              >
                {workerRunning ? (
                  <>
                    <Pause className="w-3 h-3" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" /> Iniciar
                  </>
                )}
              </button>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {workerStatusText}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800/70">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  backendMode === 'api' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-400">
                {backendMode === 'api' ? 'API FastAPI Online' : 'Modo Demo (Offline)'}
              </span>
            </div>
            {backendMode === 'demo' && (
              <button
                type="button"
                onClick={() => void retryApiConnection()}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                title="Tentar conectar ao backend FastAPI"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Reconectar
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all ${
              toast.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100'
                : toast.type === 'warning'
                  ? 'bg-slate-900/95 border-amber-500/40 text-slate-100'
                  : 'bg-slate-900/95 border-sky-500/40 text-slate-100'
            }`}
          >
            <span
              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                toast.type === 'success'
                  ? 'bg-emerald-400'
                  : toast.type === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-sky-400'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{toast.title}</p>
              {toast.description && (
                <p className="text-xs text-slate-400 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-slate-500 hover:text-slate-300"
              aria-label="Fechar notificação"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
