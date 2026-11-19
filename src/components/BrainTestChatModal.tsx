import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Flame,
  Loader2,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useGarimpo } from '../context/GarimpoContext';
import { garimpoApi } from '../services/api';
import type { BrainConfig, SiteDiagnostic } from '../types/garimpo';

type SimulatorMode = 'screen' | 'whatsapp';

interface SimMessage {
  id: string;
  sender: 'ai' | 'lead' | 'handoff';
  text: string;
  timeLabel: string;
  reason?: string | null;
}

const QUICK_LEAD_REPLIES = [
  'Oi, já temos Instagram e recebemos clientes por lá. Pra que site?',
  'No momento estou sem tempo para acompanhar criação de site.',
  'Gostei da ideia! Quanto custa e qual o prazo para entregar?',
  'Pode me mandar uma proposta ou ligar hoje à tarde?',
];

function nowLabel(): string {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderOpeningMessage(
  brain: BrainConfig,
  companyName: string,
  city: string,
  niche: string
): string {
  const firstTemplate =
    brain.templates[0]?.content ||
    'Olá! Vi a {nome_empresa} em {cidade} e notei que vocês atuam com {nicho}. Podemos conversar?';
  return firstTemplate
    .replaceAll('{nome_empresa}', companyName)
    .replaceAll('{cidade}', city)
    .replaceAll('{nicho}', niche);
}

function normalizeDigits(phone: string): string {
  return phone.replace(/\D+/g, '');
}

export function BrainTestChatModal({
  open,
  onClose,
  brain,
}: {
  open: boolean;
  onClose: () => void;
  brain: BrainConfig;
}) {
  const {
    backendMode,
    connectionConfig,
    leads,
    openLeadInChat,
    pushToast,
    retryApiConnection,
  } = useGarimpo();

  const [mode, setMode] = useState<SimulatorMode>('screen');
  const [companyName, setCompanyName] = useState('Clínica Odonto Sorriso Vivo');
  const [niche, setNiche] = useState('Clínica Odontológica');
  const [city, setCity] = useState('São Paulo');
  const [diagnostic, setDiagnostic] = useState<SiteDiagnostic>('so_instagram');

  // Screen simulator state
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [engineBadge, setEngineBadge] = useState<string>('Aguardando envio');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Real WhatsApp alert-number test state
  const [waTargetPhone, setWaTargetPhone] = useState(
    connectionConfig.alertPhone || '5573988323477'
  );
  const [isSendingWaTest, setIsSendingWaTest] = useState(false);
  const [isDeletingWaLead, setIsDeletingWaLead] = useState(false);
  const [waTestLeadId, setWaTestLeadId] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  const openingPreview = useMemo(
    () => renderOpeningMessage(brain, companyName, city, niche),
    [brain, companyName, city, niche]
  );

  // Locate the real lead in context matching either waTestLeadId or the alert phone digits
  const liveWaLead = useMemo(() => {
    if (waTestLeadId) {
      const byId = leads.find((l) => l.id === waTestLeadId);
      if (byId) return byId;
    }
    const targetDigits = normalizeDigits(waTargetPhone);
    if (targetDigits.length < 8) return null;
    const tail = targetDigits.slice(-8);
    return leads.find((l) => normalizeDigits(l.phone).endsWith(tail)) ?? null;
  }, [leads, waTestLeadId, waTargetPhone]);

  const resetConversation = (
    nextCompany = companyName,
    nextCity = city,
    nextNiche = niche
  ) => {
    setMessages([
      {
        id: `sim-init-${Date.now()}`,
        sender: 'ai',
        text: renderOpeningMessage(brain, nextCompany, nextCity, nextNiche),
        timeLabel: nowLabel(),
      },
    ]);
    setHandedOff(false);
    setErrorText(null);
    setDraft('');
    setEngineBadge(backendMode === 'api' ? 'Pronto (API)' : 'Simulação Local (Offline)');
  };

  useEffect(() => {
    if (open) {
      resetConversation();
      setWaTargetPhone(connectionConfig.alertPhone || '5573988323477');
      setWaError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking, liveWaLead?.messages.length, mode]);

  if (!open) return null;

  const sendLeadMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isThinking) return;

    setErrorText(null);
    const userMsg: SimMessage = {
      id: `sim-lead-${Date.now()}`,
      sender: 'lead',
      text: trimmed,
      timeLabel: nowLabel(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setDraft('');
    setIsThinking(true);

    try {
      const apiHistory = nextHistory
        .filter((m): m is SimMessage & { sender: 'lead' | 'ai' } => m.sender !== 'handoff')
        .map((m) => ({ sender: m.sender, text: m.text }));

      let useApi = backendMode === 'api';
      if (!useApi) {
        try {
          await garimpoApi.health();
          useApi = true;
        } catch {
          useApi = false;
        }
      }

      if (useApi) {
        const res = await garimpoApi.testBrainChat({
          company_name: companyName.trim() || 'Empresa Teste',
          niche: niche.trim() || 'Serviços Locais',
          city: city.trim() || 'São Paulo',
          diagnostic,
          persona_prompt: brain.personaPrompt,
          problem_solved: brain.problemSolved,
          common_objections: brain.commonObjections,
          handoff_triggers: brain.handoffTriggers,
          messages: apiHistory,
        });

        setEngineBadge(
          res.provider_used === 'offline_heuristic'
            ? 'Heurística Local (sem chave IA)'
            : `${res.provider_used.toUpperCase()} • ${res.model_used}`
        );

        if (res.action === 'handoff') {
          setHandedOff(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `sim-handoff-${Date.now()}`,
              sender: 'handoff',
              text:
                res.handoff_summary ||
                'A IA identificou intenção comercial e acionou o transbordo para atendimento humano.',
              reason: res.reason,
              timeLabel: nowLabel(),
            },
          ]);
        } else if (res.reply_text) {
          setMessages((prev) => [
            ...prev,
            {
              id: `sim-ai-${Date.now()}`,
              sender: 'ai',
              text: res.reply_text as string,
              timeLabel: nowLabel(),
            },
          ]);
        }
      } else {
        await new Promise((r) => setTimeout(r, 450));
        setEngineBadge('Simulação Local (API offline)');
        const triggers = brain.handoffTriggers
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        const lower = trimmed.toLowerCase();
        if (triggers.some((t) => lower.includes(t))) {
          setHandedOff(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `sim-handoff-${Date.now()}`,
              sender: 'handoff',
              text: `${companyName} acionou um gatilho de transbordo na mensagem simulada.`,
              reason: 'gatilho_local',
              timeLabel: nowLabel(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `sim-ai-${Date.now()}`,
              sender: 'ai',
              text: `Entendi! Para ${niche} em ${city}, focamos em captar quem já pesquisa no Google pronto para agendar no WhatsApp. Faz sentido ver um exemplo?`,
              timeLabel: nowLabel(),
            },
          ]);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível obter resposta do modelo.';
      setErrorText(msg);
    } finally {
      setIsThinking(false);
    }
  };

  const handleStartWhatsAppTest = async () => {
    setWaError(null);
    setIsSendingWaTest(true);
    try {
      const res = await garimpoApi.testBrainWhatsApp({
        phone: waTargetPhone.trim() || undefined,
        company_name: companyName.trim() || 'Empresa Teste',
        niche: niche.trim() || 'Serviços Locais',
        city: city.trim() || 'São Paulo',
        diagnostic,
        persona_prompt: brain.personaPrompt,
        problem_solved: brain.problemSolved,
        common_objections: brain.commonObjections,
        handoff_triggers: brain.handoffTriggers,
        opening_message: openingPreview,
      });
      setWaTestLeadId(res.lead_id);
      pushToast(
        'Teste real iniciado no seu WhatsApp!',
        `1ª mensagem enviada para +${res.phone}. Responda pelo celular para conversar com a IA.`,
        'success'
      );
      void retryApiConnection();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível disparar no WhatsApp.';
      setWaError(msg);
    } finally {
      setIsSendingWaTest(false);
    }
  };

  const handleDeleteWaTestLead = async () => {
    if (!liveWaLead) return;
    setIsDeletingWaLead(true);
    try {
      await garimpoApi.deleteLead(liveWaLead.id);
      setWaTestLeadId(null);
      pushToast('Lead de teste removido', 'Seu Kanban e Chat estão limpos novamente.', 'info');
      void retryApiConnection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover lead de teste.';
      setWaError(msg);
    } finally {
      setIsDeletingWaLead(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
              {mode === 'screen' ? (
                <Bot className="w-5 h-5" />
              ) : (
                <Smartphone className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Testar Modelo — Cérebro da IA
                </h3>
                {mode === 'screen' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    {engineBadge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {mode === 'screen'
                  ? 'Converse na tela como um cliente real usando o prompt atual do editor.'
                  : 'Dispare a 1ª mensagem para o seu número pessoal de alertas e converse ao vivo no WhatsApp.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {mode === 'screen' && (
              <button
                type="button"
                onClick={() => resetConversation()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition cursor-pointer"
                title="Reiniciar conversa simulada"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Fechar simulador"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('screen')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              mode === 'screen'
                ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat Simulado (Na Tela)
          </button>

          <button
            type="button"
            onClick={() => setMode('whatsapp')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              mode === 'whatsapp'
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Testar no Meu WhatsApp ({connectionConfig.alertPhone || 'Alerta Pessoal'})
          </button>
        </div>

        {/* Simulated Lead Profile Bar */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/90 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Nome da empresa teste"
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-violet-500/60"
          />
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Nicho"
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-violet-500/60"
          />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Cidade"
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-violet-500/60"
          />
          <select
            value={diagnostic}
            onChange={(e) => setDiagnostic(e.target.value as SiteDiagnostic)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-violet-500/60"
          >
            <option value="sem_site">🔴 Sem Site</option>
            <option value="so_instagram">🟡 Só Instagram</option>
            <option value="possui_site">🟢 Possui Site</option>
          </select>
        </div>

        {mode === 'screen' ? (
          <>
            {/* Screen Chat Feed */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-950/75 min-h-[300px]">
              {messages.map((msg) => {
                if (msg.sender === 'handoff') {
                  return (
                    <div
                      key={msg.id}
                      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 shadow-lg"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                          <Flame className="w-4 h-4 text-amber-400" />
                          Function Calling: transferir_para_humano() acionada!
                        </span>
                        <span className="text-[10px] font-mono text-amber-300/70">
                          {msg.timeLabel}
                        </span>
                      </div>
                      <p className="text-sm text-amber-100 leading-relaxed">{msg.text}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-amber-300/90">
                        {msg.reason && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 font-mono">
                            motivo: {msg.reason}
                          </span>
                        )}
                        <span>
                          Em produção: a IA pausaria este contato e enviaria alerta para{' '}
                          <strong className="font-mono">
                            {connectionConfig.alertPhone || 'seu WhatsApp'}
                          </strong>
                          .
                        </span>
                      </div>
                    </div>
                  );
                }

                const isLead = msg.sender === 'lead';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isLead ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 border shadow ${
                        isLead
                          ? 'bg-emerald-950/70 border-emerald-500/35 text-emerald-50 rounded-tr-sm'
                          : 'bg-violet-950/55 border-violet-500/30 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                            isLead ? 'text-emerald-300' : 'text-violet-300'
                          }`}
                        >
                          {isLead ? (
                            <>
                              <User className="w-3 h-3" /> Você (simulando cliente)
                            </>
                          ) : (
                            <>
                              <Bot className="w-3 h-3" /> IA SDR
                            </>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {msg.timeLabel}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                );
              })}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-violet-950/40 border border-violet-500/30 text-xs text-violet-200">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    IA pensando na resposta...
                  </div>
                </div>
              )}

              {errorText && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                  {errorText}
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Quick Test Scenarios + Input */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 mr-1">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  Testes rápidos:
                </span>
                {QUICK_LEAD_REPLIES.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isThinking || handedOff}
                    onClick={() => void sendLeadMessage(promptText)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-[11px] text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    {promptText.length > 42 ? `${promptText.slice(0, 42)}...` : promptText}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendLeadMessage(draft);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={draft}
                  disabled={isThinking || handedOff}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    handedOff
                      ? 'A IA pausou após o transbordo. Clique em "Reiniciar" para testar novamente.'
                      : 'Digite como se fosse o dono da empresa respondendo no WhatsApp...'
                  }
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || isThinking || handedOff}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Enviar
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Real WhatsApp Alert-Number Testing Tab */
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/75 min-h-[380px]">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Conversa Real via WhatsApp (Número de Alertas)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Envia a 1ª mensagem de prospecção no seu celular pessoal e deixa a IA responder de verdade pelo Worker + Webhook (debounce ~10s).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-7 space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <Phone className="w-3 h-3" /> Número pessoal para o teste
                  </label>
                  <input
                    type="text"
                    value={waTargetPhone}
                    onChange={(e) => setWaTargetPhone(e.target.value)}
                    placeholder="5573988323477"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div className="sm:col-span-5">
                  <button
                    type="button"
                    disabled={isSendingWaTest || !waTargetPhone.trim()}
                    onClick={() => void handleStartWhatsAppTest()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition cursor-pointer shadow-lg"
                  >
                    {isSendingWaTest ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Disparando no WhatsApp...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {liveWaLead ? 'Reiniciar Teste no WhatsApp' : 'Iniciar Teste no Meu WhatsApp'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  1ª mensagem que será enviada para +{normalizeDigits(waTargetPhone) || '...'}:
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{openingPreview}</p>
              </div>

              {waError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                  {waError}
                </div>
              )}
            </div>

            {/* Live Mirror of Real WhatsApp Thread */}
            {liveWaLead ? (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        liveWaLead.aiActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-white">
                      Espelho ao vivo ({liveWaLead.messages.length} msg)
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {liveWaLead.aiActive ? 'IA Ativa aguardando sua resposta' : 'IA Pausada / Transbordo'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        openLeadInChat(liveWaLead.id);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 cursor-pointer"
                    >
                      Abrir no Chat <ExternalLink className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingWaLead}
                      onClick={() => void handleDeleteWaTestLead()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-medium text-rose-300 border border-rose-500/30 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar Teste
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-2.5 max-h-64 overflow-y-auto bg-slate-950/50">
                  {liveWaLead.handoffSummary && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                      <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                        <Flame className="w-3.5 h-3.5" /> Transbordo acionado pela IA!
                      </div>
                      {liveWaLead.handoffSummary}
                    </div>
                  )}

                  {liveWaLead.messages.map((m) => {
                    const isLead = m.sender === 'lead';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isLead ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs border ${
                            isLead
                              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-50'
                              : 'bg-violet-950/50 border-violet-500/30 text-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 mb-0.5">
                            <span>{isLead ? 'Você (WhatsApp)' : 'IA SDR'}</span>
                            <span className="font-mono">{m.timeLabel}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
                Clique em <strong>Iniciar Teste no Meu WhatsApp</strong> acima. Assim que você responder pelo celular, a conversa aparecerá aqui automaticamente a cada 5s (o Worker responde em ~10s após sua última mensagem por causa do debounce).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
