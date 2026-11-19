import { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  QrCode,
  RefreshCw,
  Save,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useGarimpo } from '../context/GarimpoContext';
import type { ConnectionConfig } from '../types/garimpo';

function QrCodeMock({ seed }: { seed: number }) {
  // Deterministic crisp SVG QR matrix for pairing UI preview in demo mode
  const size = 21;
  const cells: Array<{ x: number; y: number }> = [];

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (isFinder(r, c)) {
        const localR = r >= size - 7 ? r - (size - 7) : r;
        const localC = c >= size - 7 ? c - (size - 7) : c;
        const border =
          localR === 0 ||
          localR === 6 ||
          localC === 0 ||
          localC === 6 ||
          (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4);
        if (border) cells.push({ x: c, y: r });
      } else {
        const hash = (r * 31 + c * 17 + seed * 13) % 7;
        if (hash === 0 || hash === 2 || hash === 5) {
          cells.push({ x: c, y: r });
        }
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size + 2} ${size + 2}`}
      className="w-44 h-44 bg-white rounded-xl p-2 shadow-lg"
      role="img"
      aria-label="QR Code para pareamento do WhatsApp"
    >
      {cells.map((cell, idx) => (
        <rect
          key={idx}
          x={cell.x + 1}
          y={cell.y + 1}
          width={0.92}
          height={0.92}
          rx={0.12}
          fill="#0f172a"
        />
      ))}
    </svg>
  );
}

export function ConnectionsPage() {
  const {
    backendMode,
    connectionConfig,
    updateConnectionConfig,
    toggleWhatsappConnection,
    requestWhatsappQrCode,
    refreshWhatsappStatus,
    sendTestAlert,
  } = useGarimpo();

  const [form, setForm] = useState<ConnectionConfig>(connectionConfig);
  const [isDirty, setIsDirty] = useState(false);
  const [isTestingAlert, setIsTestingAlert] = useState(false);
  const [showSearchKey, setShowSearchKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [qrSeed, setQrSeed] = useState(1);

  useEffect(() => {
    if (!isDirty) {
      setForm(connectionConfig);
    }
  }, [connectionConfig, isDirty]);

  const updateForm = (patch: Partial<ConnectionConfig>) => {
    setIsDirty(true);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const qrSrc = connectionConfig.whatsappQrBase64
    ? connectionConfig.whatsappQrBase64.startsWith('data:image')
      ? connectionConfig.whatsappQrBase64
      : `data:image/png;base64,${connectionConfig.whatsappQrBase64}`
    : null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsDirty(false);
    updateConnectionConfig({
      ...form,
      whatsappConnected: connectionConfig.whatsappConnected,
      lastSyncAt: connectionConfig.lastSyncAt,
    });
  };

  const handleTestAlert = async () => {
    setIsTestingAlert(true);
    try {
      await sendTestAlert(form.alertPhone);
    } finally {
      setIsTestingAlert(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Conexões & Alertas
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Gerencie o pareamento do WhatsApp de prospecção, seu número pessoal de avisos e as chaves de API.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Status do WhatsApp + QR Code */}
        <div className="xl:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                    connectionConfig.whatsappConnected
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {connectionConfig.whatsappConnected ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <QrCode className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Status do WhatsApp
                  </h3>
                  <p className="text-xs text-slate-400">
                    Instância dedicada para disparos e atendimento IA
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  connectionConfig.whatsappConnected
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionConfig.whatsappConnected
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-rose-400'
                  }`}
                />
                {connectionConfig.whatsappConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>

            {connectionConfig.whatsappConnected ? (
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Sessão ativa e pronta para disparo
                </div>
                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Número / Instância:</span>
                    <span className="font-mono text-white">
                      {connectionConfig.whatsappPhone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dispositivo:</span>
                    <span>{connectionConfig.whatsappDeviceName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Última sincronização:</span>
                    <span className="font-mono text-emerald-300">
                      {connectionConfig.lastSyncAt}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-5 flex flex-col items-center text-center gap-3">
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt="QR Code WhatsApp Evolution API"
                    className="w-44 h-44 bg-white rounded-xl p-2 shadow-lg object-contain"
                  />
                ) : (
                  <QrCodeMock seed={qrSeed} />
                )}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-white">
                    {qrSrc
                      ? 'Escaneie este QR Code no WhatsApp → Aparelhos Conectados'
                      : backendMode === 'api'
                        ? 'Clique em "Gerar QR Code" para conectar via Evolution API'
                        : 'Escaneie no WhatsApp → Aparelhos Conectados (Modo Demo)'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Use o chip exclusivo de prospecção para proteger seu número pessoal.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-800">
            {connectionConfig.whatsappConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setQrSeed((s) => s + 1);
                    toggleWhatsappConnection(false);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Desconectar / Logout
                </button>
                <button
                  type="button"
                  onClick={() => void refreshWhatsappStatus()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Verificar Sessão
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (backendMode === 'api') {
                      void requestWhatsappQrCode();
                    } else {
                      setQrSeed((s) => s + 1);
                    }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  {backendMode === 'api' ? 'Gerar QR Code' : 'Novo QR Code'}
                </button>
                {backendMode === 'api' ? (
                  <button
                    type="button"
                    onClick={() => void refreshWhatsappStatus()}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition cursor-pointer"
                  >
                    Verificar Pareamento
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleWhatsappConnection(true)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition cursor-pointer"
                  >
                    <WifiOff className="w-4 h-4 hidden" />
                    Simular Pareamento
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Telefone de Alerta + Chaves de API */}
        <form
          onSubmit={handleSave}
          className="xl:col-span-7 space-y-6 rounded-2xl bg-slate-900 border border-slate-800 p-5"
        >
          {/* Telefone de Alerta (Seu Pessoal) */}
          <div className="space-y-3 pb-5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Telefone de Alerta (Seu Pessoal)
                </h3>
                <p className="text-xs text-slate-400">
                  Receba um aviso imediato no seu WhatsApp toda vez que um lead ficar quente.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <input
                type="text"
                value={form.alertPhone}
                onChange={(e) => updateForm({ alertPhone: e.target.value })}
                placeholder="Ex: 5573988323477"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
              />
              <button
                type="button"
                disabled={isTestingAlert}
                onClick={() => void handleTestAlert()}
                className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-60 text-amber-300 border border-amber-500/30 text-xs font-semibold transition cursor-pointer shrink-0"
              >
                {isTestingAlert ? 'Enviando teste...' : 'Enviar Alerta de Teste'}
              </button>
            </div>
          </div>

          {/* Chaves de API */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Chaves de API</h3>
                <p className="text-xs text-slate-400">
                  Credenciais para extração de empresas e inteligência de atendimento.
                </p>
              </div>
            </div>

            {/* Provedor de Busca (Playwright / Google Places / Serper) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4 space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Motor de Garimpo
                </label>
                <select
                  value={form.searchProvider}
                  onChange={(e) =>
                    updateForm({
                      searchProvider: e.target.value as
                        | 'playwright'
                        | 'google_places'
                        | 'serper',
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="playwright">Playwright (Maps Grátis)</option>
                  <option value="google_places">Google Places API</option>
                  <option value="serper">Serper.dev (Maps)</option>
                </select>
              </div>

              <div className="sm:col-span-8 space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  {form.searchProvider === 'playwright'
                    ? 'API Key (Dispensada no modo Playwright)'
                    : 'API Key (Google Places / Serper)'}
                </label>
                <div className="relative">
                  <input
                    type={showSearchKey ? 'text' : 'password'}
                    value={form.searchApiKey}
                    disabled={form.searchProvider === 'playwright'}
                    onChange={(e) => updateForm({ searchApiKey: e.target.value })}
                    placeholder={
                      form.searchProvider === 'playwright'
                        ? 'Playwright navega direto no Google Maps sem precisar de chave'
                        : 'Cole sua chave de busca aqui...'
                    }
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={form.searchProvider === 'playwright'}
                    onClick={() => setShowSearchKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer disabled:opacity-40"
                    aria-label="Alternar visibilidade da chave de busca"
                  >
                    {showSearchKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Provedor de IA (OpenAI / Gemini) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4 space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Modelo de IA
                </label>
                <select
                  value={form.aiProvider}
                  onChange={(e) =>
                    updateForm({
                      aiProvider: e.target.value as 'openai' | 'gemini',
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div className="sm:col-span-8 space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  API Key (OpenAI / Gemini)
                </label>
                <div className="relative">
                  <input
                    type={showAiKey ? 'text' : 'password'}
                    value={form.aiApiKey}
                    onChange={(e) => updateForm({ aiApiKey: e.target.value })}
                    placeholder="Cole sua chave de IA aqui..."
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    aria-label="Alternar visibilidade da chave de IA"
                  >
                    {showAiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition cursor-pointer shadow-lg"
            >
              <Save className="w-4 h-4" />
              Salvar Conexões & Chaves
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
