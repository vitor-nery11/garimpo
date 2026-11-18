import {
  ArrowRight,
  Clock,
  Flame,
  MessageCircle,
  Pause,
  Play,
  Radar,
  Send,
  Sparkles,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { formatCountdown } from '../components/Layout';
import { DiagnosticBadge } from '../components/DiagnosticBadge';
import { useGarimpo } from '../context/GarimpoContext';

export function DashboardPage() {
  const {
    leads,
    hotLeads,
    dailyStats,
    responseRate,
    workerRunning,
    toggleWorker,
    nextDispatchSeconds,
    isWithinBusinessHours,
    brainConfig,
    connectionConfig,
    openLeadInChat,
    setActiveTab,
  } = useGarimpo();

  const workerActuallySending =
    workerRunning && isWithinBusinessHours && connectionConfig.whatsappConnected;

  const statusIndicator = !connectionConfig.whatsappConnected
    ? {
        label: 'WhatsApp desconectado — pareie em Conexões',
        tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
        dot: 'bg-rose-400',
      }
    : !workerRunning
      ? {
          label: 'Disparos pausados manualmente',
          tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
          dot: 'bg-amber-400',
        }
      : !isWithinBusinessHours
        ? {
            label: `Fora do horário comercial (${brainConfig.allowedStartTime} às ${brainConfig.allowedEndTime})`,
            tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
            dot: 'bg-amber-400',
          }
        : {
            label: `Próximo disparo em ${formatCountdown(nextDispatchSeconds)}`,
            tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
            dot: 'bg-emerald-400 animate-pulse',
          };

  const dailyCapacityPct = Math.min(
    100,
    Math.round((dailyStats.messagesSentToday / Math.max(1, brainConfig.maxDailyMessages)) * 100)
  );

  const stageCounts = {
    na_fila: leads.filter((l) => l.stage === 'na_fila').length,
    abordado: leads.filter((l) => l.stage === 'abordado').length,
    em_conversa_ia: leads.filter((l) => l.stage === 'em_conversa_ia').length,
    assumir_conversa: hotLeads.length,
    proposta_fechado: leads.filter((l) => l.stage === 'proposta_fechado').length,
  };

  return (
    <div className="space-y-6">
      {/* Page Header + Master Worker Control */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Visão Geral & Status do Robô
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Acompanhe o ritmo da prospecção, o limite anti-ban e os clientes quentes prontos para fechamento.
          </p>
        </div>

        {/* Controle Mestre do Worker */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3.5 shadow-lg">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-medium ${statusIndicator.tone}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusIndicator.dot}`} />
              <span>{statusIndicator.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:border-l sm:border-slate-800 sm:pl-4">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Cota Diária
              </div>
              <div className="text-xs font-mono text-slate-200">
                {dailyStats.messagesSentToday}/{brainConfig.maxDailyMessages} ({dailyCapacityPct}%)
              </div>
            </div>

            <button
              type="button"
              onClick={toggleWorker}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer shadow-sm ${
                workerRunning
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {workerRunning ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  Pausar Worker
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Iniciar Worker
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Warning banner if WhatsApp disconnected */}
      {!connectionConfig.whatsappConnected && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-rose-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>
              Sua instância de WhatsApp está desconectada. Os disparos automáticos estão retidos até o pareamento.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('conexoes')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 shrink-0 cursor-pointer"
          >
            Ir para Conexões
          </button>
        </div>
      )}

      {/* Fila de Urgência (Topo) */}
      <section className="rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                Fila de Urgência — Leads Quentes
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950">
                  {hotLeads.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Empresas que pediram orçamento ou demonstraram interesse. A IA pausou e aguarda você.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 cursor-pointer self-start sm:self-auto"
          >
            Abrir Central de Chat <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {hotLeads.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
            Nenhum lead aguardando transbordo no momento. A IA continua conduzindo as conversas ativas.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            {hotLeads.slice(0, 3).map((lead) => {
              const lastMsg = lead.messages[lead.messages.length - 1];
              return (
                <div
                  key={lead.id}
                  className="rounded-xl bg-slate-950/85 border border-slate-800 hover:border-amber-500/40 p-4 flex flex-col justify-between gap-3 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-sm text-white leading-snug">
                          {lead.companyName}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {lead.niche} • {lead.city}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 shrink-0">
                        <Clock className="w-3 h-3" />
                        {lead.lastMessageMinutesAgo === 0
                          ? 'Agora'
                          : `${lead.lastMessageMinutesAgo}m`}
                      </span>
                    </div>

                    <DiagnosticBadge diagnostic={lead.diagnostic} compact />

                    <p className="text-xs text-slate-300 bg-slate-900/90 border border-slate-800/80 rounded-lg p-2.5 line-clamp-2">
                      {lead.handoffSummary || lastMsg?.text || 'Lead solicitou contato.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openLeadInChat(lead.id)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Assumir Conversa
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cards de Métricas do Dia */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Leads Extraídos Hoje"
          value={String(dailyStats.leadsExtractedToday)}
          subtitle="Empresas garimpadas no Maps"
          icon={Radar}
          accent="sky"
        />
        <MetricCard
          title="Mensagens Enviadas"
          value={String(dailyStats.messagesSentToday)}
          subtitle={`Limite diário: ${brainConfig.maxDailyMessages} disparos`}
          icon={Send}
          accent="emerald"
        />
        <MetricCard
          title="Taxa de Resposta"
          value={`${responseRate}%`}
          subtitle={`${dailyStats.repliesReceivedToday} respostas recebidas hoje`}
          icon={TrendingUp}
          accent="violet"
        />
        <MetricCard
          title="Leads Quentes (Aguardando)"
          value={String(hotLeads.length)}
          subtitle="Prontos para transbordo humano"
          icon={Flame}
          accent="amber"
        />
      </section>

      {/* Pipeline & Cadence Overview */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Resumo do Funil Comercial</h3>
              <p className="text-xs text-slate-400">
                Distribuição atual dos {leads.length} leads no pipeline
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('kanban')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
            >
              Abrir Kanban <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StageMiniStat label="Na Fila" count={stageCounts.na_fila} color="slate" />
            <StageMiniStat label="Abordado" count={stageCounts.abordado} color="sky" />
            <StageMiniStat label="Em Conversa (IA)" count={stageCounts.em_conversa_ia} color="violet" />
            <StageMiniStat label="Assumir Agora" count={stageCounts.assumir_conversa} color="amber" />
            <StageMiniStat label="Proposta / Fechado" count={stageCounts.proposta_fechado} color="emerald" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              Motor Anti-Ban Ativo
            </div>
            <p className="text-sm text-slate-200 font-medium">
              {workerActuallySending
                ? 'Alternando automaticamente entre 3 variações de abordagem.'
                : 'Fila aguardando liberação de horário ou retomada do worker.'}
            </p>
            <div className="text-xs text-slate-400 space-y-1 pt-1 font-mono">
              <div>
                • Janela: {brainConfig.allowedStartTime} – {brainConfig.allowedEndTime}
              </div>
              <div>
                • Intervalo: {brainConfig.minIntervalSec}s a {brainConfig.maxIntervalSec}s
              </div>
              <div>• Variações ativas: {brainConfig.templates.length} modelos</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('prospeccao')}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            + Garimpar Novos Clientes
          </button>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Radar;
  accent: 'sky' | 'emerald' | 'violet' | 'amber';
}) {
  const accentStyles = {
    sky: 'bg-sky-500/12 text-sky-400 border-sky-500/25',
    emerald: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    violet: 'bg-violet-500/12 text-violet-400 border-violet-500/25',
    amber: 'bg-amber-500/12 text-amber-400 border-amber-500/25',
  }[accent];

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-slate-400">{title}</p>
        <p className="text-3xl font-bold text-white tracking-tight mt-2">{value}</p>
        <p className="text-xs text-slate-500 mt-1.5">{subtitle}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${accentStyles}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}

function StageMiniStat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'slate' | 'sky' | 'violet' | 'amber' | 'emerald';
}) {
  const barColor = {
    slate: 'bg-slate-500',
    sky: 'bg-sky-400',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
    emerald: 'bg-emerald-400',
  }[color];

  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
      <div className={`w-6 h-1 rounded-full ${barColor} mb-2`} />
      <div className="text-xl font-bold text-white">{count}</div>
      <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}
