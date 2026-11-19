import { useEffect, useState } from 'react';
import {
  BrainCircuit,
  Clock,
  Flame,
  MessageSquareCode,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BrainTestChatModal } from '../components/BrainTestChatModal';
import { useGarimpo } from '../context/GarimpoContext';
import type { BrainConfig } from '../types/garimpo';

const TEMPLATE_VARIABLES = ['{nome_empresa}', '{cidade}', '{nicho}'] as const;

export function BrainPage() {
  const { brainConfig, updateBrainConfig } = useGarimpo();
  const [form, setForm] = useState<BrainConfig>(brainConfig);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [focusedTemplateId, setFocusedTemplateId] = useState<string>(
    brainConfig.templates[0]?.id ?? ''
  );

  useEffect(() => {
    setForm(brainConfig);
  }, [brainConfig]);

  const insertVariable = (variable: string) => {
    const targetId = focusedTemplateId || form.templates[0]?.id;
    if (!targetId) return;
    setForm((prev) => ({
      ...prev,
      templates: prev.templates.map((tpl) =>
        tpl.id === targetId ? { ...tpl, content: `${tpl.content} ${variable}` } : tpl
      ),
    }));
  };

  const updateTemplate = (id: string, content: string) => {
    setForm((prev) => ({
      ...prev,
      templates: prev.templates.map((tpl) => (tpl.id === id ? { ...tpl, content } : tpl)),
    }));
  };

  const addTemplate = () => {
    if (form.templates.length >= 6) return;
    const newId = `tpl-${Date.now()}`;
    setForm((prev) => ({
      ...prev,
      templates: [
        ...prev.templates,
        {
          id: newId,
          label: `Variação ${prev.templates.length + 1}`,
          content:
            'Olá! Vi a {nome_empresa} em {cidade} e notei que vocês atuam com {nicho}. Podemos conversar rápido sobre como captar mais clientes no Google?',
        },
      ],
    }));
    setFocusedTemplateId(newId);
  };

  const removeTemplate = (id: string) => {
    if (form.templates.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      templates: prev.templates.filter((tpl) => tpl.id !== id),
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const minSec = Math.max(15, form.minIntervalSec);
    const maxSec = Math.max(minSec, form.maxIntervalSec);
    updateBrainConfig({
      ...form,
      minIntervalSec: minSec,
      maxIntervalSec: maxSec,
    });
  };

  const safetyAssessment =
    form.minIntervalSec >= 60 && form.maxDailyMessages <= 80 && form.templates.length >= 3
      ? {
          label: 'Risco de Banimento: Baixo (Recomendado)',
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        }
      : form.minIntervalSec >= 30 && form.maxDailyMessages <= 120
        ? {
            label: 'Risco de Banimento: Moderado',
            badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          }
        : {
            label: 'Risco de Banimento: Alto (Ajuste intervalo/limite)',
            badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        };

  const previewTemplate =
    form.templates.find((t) => t.id === focusedTemplateId) ?? form.templates[0];
  const renderedPreview = (previewTemplate?.content ?? '')
    .replaceAll('{nome_empresa}', 'Clínica Odonto Sorriso Vivo')
    .replaceAll('{cidade}', 'São Paulo')
    .replaceAll('{nicho}', 'Clínica Odontológica');

  return (
    <>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Cérebro da IA & Cadência
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Ajuste o discurso comercial, modelos de abertura e travas anti-ban para proteger seu chip.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTestModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/40 font-semibold text-sm transition cursor-pointer shadow-sm"
            >
              <MessageSquareCode className="w-4 h-4 text-violet-300" />
              Testar Modelo
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition cursor-pointer shadow-lg"
            >
              <Save className="w-4 h-4" />
              Salvar Configurações
            </button>
          </div>
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Editor de Prompt / Persona */}
        <div className="xl:col-span-6 space-y-5 rounded-2xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Editor de Prompt & Persona
              </h3>
              <p className="text-xs text-slate-400">
                Define como a IA conversa, contorna objeções e decide chamar você.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Como a IA se apresenta (Tom & Persona)
            </label>
            <textarea
              rows={3}
              value={form.personaPrompt}
              onChange={(e) => setForm({ ...form, personaPrompt: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Qual problema resolve (Proposta de Valor)
            </label>
            <textarea
              rows={3}
              value={form.problemSolved}
              onChange={(e) => setForm({ ...form, problemSolved: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Objeções Comuns & Respostas
            </label>
            <textarea
              rows={4}
              value={form.commonObjections}
              onChange={(e) => setForm({ ...form, commonObjections: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/60 font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <Flame className="w-3.5 h-3.5" />
              Gatilhos de Transbordo (palavras/intenções que pausam a IA e te avisam)
            </label>
            <textarea
              rows={2}
              value={form.handoffTriggers}
              onChange={(e) => setForm({ ...form, handoffTriggers: e.target.value })}
              placeholder="Ex: preço, orçamento, quanto custa, reunião, ligar..."
              className="w-full p-3 rounded-xl bg-slate-950 border border-amber-500/30 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Right: Regras Anti-Ban + Variações da 1ª Mensagem */}
        <div className="xl:col-span-6 space-y-6">
          {/* Regras Anti-Ban */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Regras Anti-Ban</h3>
                  <p className="text-xs text-slate-400">
                    Controle de janela, teto diário e cadência aleatória.
                  </p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${safetyAssessment.badgeClass}`}
              >
                {safetyAssessment.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Início da Janela
                </label>
                <input
                  type="time"
                  value={form.allowedStartTime}
                  onChange={(e) => setForm({ ...form, allowedStartTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Fim da Janela
                </label>
                <input
                  type="time"
                  value={form.allowedEndTime}
                  onChange={(e) => setForm({ ...form, allowedEndTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Limite Máximo de Disparos / Dia
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={form.maxDailyMessages}
                  onChange={(e) =>
                    setForm({ ...form, maxDailyMessages: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Intervalo Mín (s)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={600}
                    value={form.minIntervalSec}
                    onChange={(e) =>
                      setForm({ ...form, minIntervalSec: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Intervalo Máx (s)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={900}
                    value={form.maxIntervalSec}
                    onChange={(e) =>
                      setForm({ ...form, maxIntervalSec: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Variações da 1ª Mensagem */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Variações da 1ª Mensagem ({form.templates.length})
                </h3>
                <p className="text-xs text-slate-400">
                  O robô alterna entre os modelos abaixo para evitar bloqueio por texto repetido.
                </p>
              </div>
              <button
                type="button"
                onClick={addTemplate}
                disabled={form.templates.length >= 6}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Modelo
              </button>
            </div>

            {/* Variáveis dinâmicas */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">Inserir variável:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] transition cursor-pointer"
                >
                  + {v}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {form.templates.map((tpl, idx) => (
                <div
                  key={tpl.id}
                  className={`rounded-xl border p-3 space-y-2 transition ${
                    focusedTemplateId === tpl.id
                      ? 'bg-slate-950 border-emerald-500/40'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Modelo #{idx + 1}
                    </span>
                    {form.templates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTemplate(tpl.id)}
                        className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Remover modelo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={tpl.content}
                    onFocus={() => setFocusedTemplateId(tpl.id)}
                    onChange={(e) => updateTemplate(tpl.id, e.target.value)}
                    className="w-full bg-transparent text-xs text-slate-200 leading-relaxed focus:outline-none resize-none"
                  />
                </div>
              ))}
            </div>

            {/* Live Preview */}
            {previewTemplate && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Prévia com lead de exemplo:
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{renderedPreview}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </form>

      <BrainTestChatModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        brain={form}
      />
    </>
  );
}
