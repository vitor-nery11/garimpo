import { useMemo, useState } from 'react';
import {
  Bot,
  Clock,
  GripVertical,
  MessageSquare,
  PauseCircle,
  Search,
} from 'lucide-react';
import { DiagnosticBadge } from '../components/DiagnosticBadge';
import { useGarimpo } from '../context/GarimpoContext';
import type { FunnelStage, Lead } from '../types/garimpo';

interface KanbanColumnDef {
  id: FunnelStage;
  title: string;
  subtitle: string;
  headerAccent: string;
  columnBorder: string;
}

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: 'na_fila',
    title: 'Na Fila',
    subtitle: 'Aguardando horário/intervalo',
    headerAccent: 'bg-slate-500',
    columnBorder: 'border-slate-800',
  },
  {
    id: 'abordado',
    title: 'Abordado',
    subtitle: '1ª msg enviada, sem resposta',
    headerAccent: 'bg-sky-400',
    columnBorder: 'border-slate-800',
  },
  {
    id: 'em_conversa_ia',
    title: 'Em Conversa (IA)',
    subtitle: 'IA conduzindo qualificação',
    headerAccent: 'bg-violet-400',
    columnBorder: 'border-slate-800',
  },
  {
    id: 'assumir_conversa',
    title: '🔥 Assumir Conversa',
    subtitle: 'Interesse detectado e pausado',
    headerAccent: 'bg-amber-400',
    columnBorder: 'border-amber-500/35',
  },
  {
    id: 'proposta_fechado',
    title: 'Proposta Enviada / Fechado',
    subtitle: 'Negociação avançada ou ganha',
    headerAccent: 'bg-emerald-400',
    columnBorder: 'border-slate-800',
  },
  {
    id: 'sem_interesse',
    title: 'Sem Interesse',
    subtitle: 'Encerrado ou recusado',
    headerAccent: 'bg-rose-400',
    columnBorder: 'border-slate-800',
  },
];

function formatElapsed(minutes: number, stage: FunnelStage): string {
  if (stage === 'na_fila' || minutes === 0) return 'Aguardando disparo';
  if (minutes < 60) return `há ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `há ${hours}h ${rem}m` : `há ${hours}h`;
}

export function KanbanPage() {
  const { leads, moveLeadStage, openLeadInChat, pushToast } = useGarimpo();
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.companyName.toLowerCase().includes(q) ||
        l.niche.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const handleDrop = (targetStage: FunnelStage) => {
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    if (lead && lead.stage !== targetStage) {
      moveLeadStage(draggedLeadId, targetStage);
      const colTitle = KANBAN_COLUMNS.find((c) => c.id === targetStage)?.title ?? targetStage;
      pushToast(`Lead movido para "${colTitle}"`, lead.companyName, 'info');
    }
    setDraggedLeadId(null);
    setDragOverStage(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Funil de Vendas (Kanban)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Arraste os cards entre colunas para atualizar manualmente a etapa comercial de cada empresa.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar empresa, nicho ou cidade..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
      </div>

      {/* Horizontal Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {KANBAN_COLUMNS.map((col) => {
          const colLeads = filteredLeads.filter((l) => l.stage === col.id);
          const isDropTarget = dragOverStage === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStage !== col.id) setDragOverStage(col.id);
              }}
              onDragLeave={() => {
                if (dragOverStage === col.id) setDragOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.id);
              }}
              className={`w-76 shrink-0 rounded-2xl bg-slate-900/90 border transition-colors flex flex-col max-h-[calc(100vh-12rem)] ${
                isDropTarget
                  ? 'border-emerald-400 bg-emerald-500/5'
                  : col.columnBorder
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.headerAccent}`} />
                    <h3 className="text-sm font-semibold text-white truncate">
                      {col.title}
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-800 text-slate-300">
                    {colLeads.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{col.subtitle}</p>
              </div>

              {/* Cards List */}
              <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1 min-h-[140px]">
                {colLeads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">
                    Arraste um lead para cá
                  </div>
                ) : (
                  colLeads.map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      isDragging={draggedLeadId === lead.id}
                      onDragStart={() => setDraggedLeadId(lead.id)}
                      onDragEnd={() => {
                        setDraggedLeadId(null);
                        setDragOverStage(null);
                      }}
                      onOpenChat={() => openLeadInChat(lead.id)}
                      onStageSelect={(nextStage) => moveLeadStage(lead.id, nextStage)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpenChat,
  onStageSelect,
}: {
  lead: Lead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenChat: () => void;
  onStageSelect: (stage: FunnelStage) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl bg-slate-950/90 border border-slate-800 hover:border-slate-700 p-3.5 space-y-2.5 cursor-grab active:cursor-grabbing transition shadow-sm ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      }`}
    >
      {/* Top row: Company name & drag handle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white leading-snug truncate">
            {lead.companyName}
          </h4>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {lead.niche} • {lead.city}
          </p>
        </div>
        <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 mt-0.5" />
      </div>

      {/* Diagnostic + Bot Status Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <DiagnosticBadge diagnostic={lead.diagnostic} compact />
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
            lead.aiActive
              ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {lead.aiActive ? (
            <>
              <Bot className="w-3 h-3" /> IA Ativa
            </>
          ) : (
            <>
              <PauseCircle className="w-3 h-3 text-amber-400" /> IA Pausada
            </>
          )}
        </span>
      </div>

      {/* Footer: Time since last msg + actions */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          {formatElapsed(lead.lastMessageMinutesAgo, lead.stage)}
        </span>

        <div className="flex items-center gap-1.5">
          <select
            value={lead.stage}
            onChange={(e) => onStageSelect(e.target.value as FunnelStage)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Mover ${lead.companyName} para coluna`}
            className="bg-slate-900 border border-slate-800 text-[11px] text-slate-300 rounded-lg px-1.5 py-1 focus:outline-none focus:border-emerald-500/50 max-w-[92px]"
          >
            {KANBAN_COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title.replace('🔥 ', '')}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenChat}
            title="Abrir conversa na Central de Chat"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 border border-slate-800 transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
