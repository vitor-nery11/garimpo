import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Flame,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { DiagnosticBadge } from '../components/DiagnosticBadge';
import { useGarimpo } from '../context/GarimpoContext';
import type { FunnelStage } from '../types/garimpo';

type ChatFilterTab = 'precisam_de_mim' | 'ia_conversando' | 'todos';

const QUICK_REPLIES = [
  'Olá! Aqui é o responsável pela Garimpo Digital. Vi que pediu valores — posso te enviar uma simulação de página pronta para o seu nicho?',
  'Nosso prazo de entrega é de 7 dias úteis já com integração para seu WhatsApp e otimização para buscas no Google Maps.',
  'Consigo te mostrar 2 exemplos reais de clientes agora. Prefere que eu mande por aqui ou fazemos uma call rápida de 10 min?',
];

export function ChatPage() {
  const {
    leads,
    selectedChatLeadId,
    setSelectedChatLeadId,
    toggleLeadAi,
    sendManualMessage,
    moveLeadStage,
  } = useGarimpo();

  const [filterTab, setFilterTab] = useState<ChatFilterTab>('precisam_de_mim');
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Leads that have messages or are active in conversation/handoff
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesTab =
        filterTab === 'todos'
          ? true
          : filterTab === 'precisam_de_mim'
            ? lead.stage === 'assumir_conversa'
            : lead.aiActive &&
              (lead.stage === 'em_conversa_ia' || lead.stage === 'abordado');

      const matchesQuery =
        !q ||
        lead.companyName.toLowerCase().includes(q) ||
        lead.niche.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q);

      return matchesTab && matchesQuery;
    });
  }, [leads, filterTab, searchQuery]);

  const activeLead = useMemo(
    () =>
      leads.find((l) => l.id === selectedChatLeadId) ??
      filteredContacts[0] ??
      leads[0] ??
      null,
    [leads, selectedChatLeadId, filteredContacts]
  );

  // If the user clicks a lead from Dashboard/Kanban that isn't in current filterTab, switch to 'todos'
  useEffect(() => {
    if (!activeLead) return;
    const inCurrentTab = filteredContacts.some((c) => c.id === activeLead.id);
    if (!inCurrentTab && selectedChatLeadId === activeLead.id) {
      setFilterTab('todos');
    }
  }, [activeLead, filteredContacts, selectedChatLeadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLead?.id, activeLead?.messages.length]);

  const counts = useMemo(
    () => ({
      precisam: leads.filter((l) => l.stage === 'assumir_conversa').length,
      ia: leads.filter(
        (l) => l.aiActive && (l.stage === 'em_conversa_ia' || l.stage === 'abordado')
      ).length,
      todos: leads.length,
    }),
    [leads]
  );

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || !draft.trim()) return;
    sendManualMessage(activeLead.id, draft);
    setDraft('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Central de Chat (Conversas & Transbordo)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Audite as abordagens da IA em tempo real e assuma o atendimento com um clique quando o lead esquentar.
        </p>
      </div>

      {/* 3-pane WhatsApp Web style container */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12 min-h-[640px] lg:h-[calc(100vh-11.5rem)]">
        {/* Left Sidebar: Filters + Contact List */}
        <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col bg-slate-950/50 min-h-[280px] lg:min-h-0">
          {/* Quick Tabs */}
          <div className="p-3 border-b border-slate-800 space-y-2.5">
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setFilterTab('precisam_de_mim')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer truncate ${
                  filterTab === 'precisam_de_mim'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🔥 Mim ({counts.precisam})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('ia_conversando')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer truncate ${
                  filterTab === 'ia_conversando'
                    ? 'bg-violet-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                IA ({counts.ia})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('todos')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer truncate ${
                  filterTab === 'todos'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({counts.todos})
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar conversa..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredContacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhuma conversa neste filtro.
              </div>
            ) : (
              filteredContacts.map((lead) => {
                const isSelected = activeLead?.id === lead.id;
                const lastMsg = lead.messages[lead.messages.length - 1];
                const isHot = lead.stage === 'assumir_conversa';

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedChatLeadId(lead.id)}
                    className={`w-full text-left p-3.5 transition cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400'
                        : 'hover:bg-slate-900/80 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border ${
                        isHot
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {isHot ? (
                        <Flame className="w-4 h-4 text-amber-400" />
                      ) : (
                        lead.companyName.slice(0, 2).toUpperCase()
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {lead.companyName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {lastMsg?.timeLabel ?? 'Fila'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {lastMsg
                          ? `${lastMsg.sender === 'ai' ? 'IA: ' : lastMsg.sender === 'user' ? 'Você: ' : ''}${lastMsg.text}`
                          : 'Aguardando 1º disparo'}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            lead.aiActive
                              ? 'bg-violet-500/15 text-violet-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {lead.aiActive ? 'IA Ativa' : 'IA Pausada'}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">
                          {lead.niche}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center Pane: Message History & Top Control Bar */}
        <div className="lg:col-span-6 flex flex-col bg-slate-950/80 border-b lg:border-b-0 lg:border-r border-slate-800 min-h-[420px] lg:min-h-0">
          {activeLead ? (
            <>
              {/* Barra de Controle Superior */}
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate flex items-center gap-2">
                    {activeLead.companyName}
                    {activeLead.stage === 'assumir_conversa' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        🔥 Transbordo
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    {activeLead.niche} • {activeLead.city} ({activeLead.neighborhood})
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Switch IA Ativa / Pausada */}
                  <button
                    type="button"
                    onClick={() => toggleLeadAi(activeLead.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      activeLead.aiActive
                        ? 'bg-violet-500/15 text-violet-200 border-violet-500/40 hover:bg-violet-500/25'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`w-7 h-4 rounded-full relative transition-colors ${
                        activeLead.aiActive ? 'bg-violet-500' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          activeLead.aiActive ? 'left-3.5' : 'left-0.5'
                        }`}
                      />
                    </span>
                    {activeLead.aiActive ? 'IA Ativa' : 'IA Pausada'}
                  </button>

                  {/* Botão Abrir no WhatsApp */}
                  <a
                    href={`https://wa.me/${activeLead.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition"
                  >
                    Abrir no WhatsApp
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Janela de Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.04),_transparent_55%)]">
                {activeLead.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                    <MessageSquare className="w-8 h-8 mb-2 text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">
                      Nenhuma mensagem enviada ainda
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Este lead está na fila aguardando a próxima janela de disparo ou pode ser abordado manualmente abaixo.
                    </p>
                  </div>
                ) : (
                  activeLead.messages.map((msg) => {
                    const isLead = msg.sender === 'lead';
                    const isAi = msg.sender === 'ai';

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isLead ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-md border ${
                            isLead
                              ? 'bg-slate-900 border-slate-800 text-slate-100 rounded-tl-sm'
                              : isAi
                                ? 'bg-violet-950/60 border-violet-500/30 text-slate-100 rounded-tr-sm'
                                : 'bg-emerald-950/70 border-emerald-500/35 text-emerald-50 rounded-tr-sm'
                          }`}
                        >
                          {/* Sender Tag */}
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                                isLead
                                  ? 'text-slate-400'
                                  : isAi
                                    ? 'text-violet-300'
                                    : 'text-emerald-300'
                              }`}
                            >
                              {isLead ? (
                                activeLead.companyName
                              ) : isAi ? (
                                <>
                                  <Bot className="w-3 h-3" /> Enviado pela IA
                                </>
                              ) : (
                                <>
                                  <User className="w-3 h-3" /> Digitado por Você
                                </>
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {msg.timeLabel}
                            </span>
                          </div>

                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Manual Reply Box */}
              <form
                onSubmit={handleSend}
                className="p-3 border-t border-slate-800 bg-slate-900/90 space-y-2"
              >
                {activeLead.aiActive && (
                  <p className="text-[11px] text-violet-300/90 flex items-center gap-1.5 px-1">
                    <Bot className="w-3.5 h-3.5" />
                    Ao enviar uma mensagem manual, a IA será pausada automaticamente para este contato.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Escreva sua resposta manual no WhatsApp..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-sm transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    Enviar
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Selecione uma conversa na lista lateral.
            </div>
          )}
        </div>

        {/* Right Context Panel: AI Handoff Summary & Lead Info */}
        <div className="lg:col-span-3 bg-slate-900/60 p-4 flex flex-col gap-4 overflow-y-auto">
          {activeLead ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Resumo do Transbordo (IA)
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-slate-200 leading-relaxed">
                  {activeLead.handoffSummary ||
                    'A IA ainda não gerou um resumo de transbordo para este contato. Assim que detectar intenção de compra ou pedido de orçamento, o contexto aparecerá aqui.'}
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Dados do Estabelecimento
                </h4>
                <DiagnosticBadge diagnostic={activeLead.diagnostic} />

                <div className="space-y-2 text-xs text-slate-300 pt-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-mono">+{activeLead.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      {activeLead.neighborhood}, {activeLead.city}
                    </span>
                  </div>
                  {activeLead.instagramHandle && (
                    <div className="text-amber-300/90 font-mono text-[11px]">
                      Instagram: {activeLead.instagramHandle}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Etapa no Funil
                </label>
                <select
                  value={activeLead.stage}
                  onChange={(e) =>
                    moveLeadStage(activeLead.id, e.target.value as FunnelStage)
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="na_fila">Na Fila</option>
                  <option value="abordado">Abordado</option>
                  <option value="em_conversa_ia">Em Conversa (IA)</option>
                  <option value="assumir_conversa">🔥 Assumir Conversa</option>
                  <option value="proposta_fechado">Proposta Enviada / Fechado</option>
                  <option value="sem_interesse">Sem Interesse</option>
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Respostas Rápidas
                </h4>
                <div className="space-y-1.5">
                  {QUICK_REPLIES.map((snippet, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setDraft(snippet)}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 leading-snug transition cursor-pointer"
                    >
                      {snippet}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500">Sem contexto selecionado.</div>
          )}
        </div>
      </div>
    </div>
  );
}
