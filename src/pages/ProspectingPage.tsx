import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  Search,
  Send,
  Star,
} from 'lucide-react';
import { DiagnosticBadge } from '../components/DiagnosticBadge';
import { useGarimpo } from '../context/GarimpoContext';
import type { SiteDiagnostic } from '../types/garimpo';

const QUICK_NICHES = [
  'Clínica Odontológica',
  'Oficina Mecânica',
  'Imobiliária',
  'Clínica de Estética',
  'Escritório Contábil',
];

export function ProspectingPage() {
  const {
    searchResults,
    isSearching,
    runProspectingSearch,
    sendCandidatesToQueue,
    setActiveTab,
  } = useGarimpo();

  const [city, setCity] = useState('São Paulo');
  const [niche, setNiche] = useState('Clínica Odontológica');
  const [limit, setLimit] = useState<number>(10);
  const [diagnosticFilter, setDiagnosticFilter] = useState<'all' | SiteDiagnostic>('all');

  // Auto-select eligible leads (sem_site & so_instagram) that aren't already queued
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    searchResults
      .filter((r) => r.diagnostic !== 'possui_site' && !r.alreadyQueued)
      .map((r) => r.id)
  );

  // Sync default selection whenever new searchResults arrive
  useEffect(() => {
    setSelectedIds(
      searchResults
        .filter((r) => r.diagnostic !== 'possui_site' && !r.alreadyQueued)
        .map((r) => r.id)
    );
  }, [searchResults]);

  const filteredResults = useMemo(() => {
    if (diagnosticFilter === 'all') return searchResults;
    return searchResults.filter((r) => r.diagnostic === diagnosticFilter);
  }, [searchResults, diagnosticFilter]);

  const counts = useMemo(
    () => ({
      all: searchResults.length,
      sem_site: searchResults.filter((r) => r.diagnostic === 'sem_site').length,
      so_instagram: searchResults.filter((r) => r.diagnostic === 'so_instagram').length,
      possui_site: searchResults.filter((r) => r.diagnostic === 'possui_site').length,
    }),
    [searchResults]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllEligible = () => {
    const eligible = filteredResults
      .filter((r) => r.diagnostic !== 'possui_site' && !r.alreadyQueued)
      .map((r) => r.id);
    setSelectedIds(eligible);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runProspectingSearch(city, niche, limit);
  };

  const handleBatchSend = () => {
    if (selectedIds.length === 0) return;
    sendCandidatesToQueue(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Nova Prospecção (Captação & Filtro)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Extraia empresas locais, identifique automaticamente quem não tem site e envie os alvos para a fila de disparo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('kanban')}
          className="text-xs font-medium text-slate-300 hover:text-white px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition self-start sm:self-auto cursor-pointer"
        >
          Ver Fila no Kanban →
        </button>
      </div>

      {/* Formulário de Busca */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Cidade / Bairro
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: São Paulo, Moema"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Nicho de Mercado
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Ex: clínica odontológica, oficina mecânica"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Limite de Resultados
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500/60"
            >
              <option value={8}>8 empresas</option>
              <option value={15}>15 empresas</option>
              <option value={25}>25 empresas</option>
              <option value={40}>40 empresas</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={isSearching}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-semibold text-sm transition cursor-pointer"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Garimpando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Buscar Leads
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sugestões rápidas de nicho */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-slate-500 font-medium">Nichos sugeridos:</span>
          {QUICK_NICHES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setNiche(item)}
              className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer border ${
                niche.toLowerCase() === item.toLowerCase()
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </form>

      {/* Toolbar de Filtros + Ação em Lote */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" /> Diagnóstico:
          </span>
          <FilterChip
            active={diagnosticFilter === 'all'}
            onClick={() => setDiagnosticFilter('all')}
            label={`Todos (${counts.all})`}
          />
          <FilterChip
            active={diagnosticFilter === 'sem_site'}
            onClick={() => setDiagnosticFilter('sem_site')}
            label={`🔴 Sem Site (${counts.sem_site})`}
          />
          <FilterChip
            active={diagnosticFilter === 'so_instagram'}
            onClick={() => setDiagnosticFilter('so_instagram')}
            label={`🟡 Só Instagram (${counts.so_instagram})`}
          />
          <FilterChip
            active={diagnosticFilter === 'possui_site'}
            onClick={() => setDiagnosticFilter('possui_site')}
            label={`🟢 Possui Site (${counts.possui_site})`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={selectAllEligible}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 transition cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            Selecionar Elegíveis
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Limpar
          </button>

          <button
            type="button"
            onClick={handleBatchSend}
            disabled={selectedIds.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs transition cursor-pointer shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar para Fila de Disparo ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* Tabela de Resultados Pré-Qualificados */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3.5 pl-4 pr-2 w-10">Sel.</th>
                <th className="py-3.5 px-3">Empresa / Nicho</th>
                <th className="py-3.5 px-3">Localização</th>
                <th className="py-3.5 px-3">Diagnóstico Digital</th>
                <th className="py-3.5 px-3">Contato / Maps</th>
                <th className="py-3.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-sm">
              {filteredResults.map((candidate) => {
                const isIgnored = candidate.diagnostic === 'possui_site';
                const isChecked = selectedIds.includes(candidate.id);
                const disabled = candidate.alreadyQueued || isIgnored;

                return (
                  <tr
                    key={candidate.id}
                    className={`transition ${
                      isIgnored
                        ? 'bg-slate-950/40 opacity-60'
                        : isChecked
                          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3.5 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={disabled}
                        onChange={() => toggleSelect(candidate.id)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40 cursor-pointer disabled:cursor-not-allowed"
                        aria-label={`Selecionar ${candidate.companyName}`}
                      />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-white">{candidate.companyName}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{candidate.niche}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="text-slate-200 text-xs font-medium">{candidate.city}</div>
                      <div className="text-slate-500 text-xs">{candidate.neighborhood}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col items-start gap-1">
                        <DiagnosticBadge diagnostic={candidate.diagnostic} compact />
                        {candidate.instagramHandle && (
                          <span className="text-[11px] font-mono text-amber-300/80">
                            {candidate.instagramHandle}
                          </span>
                        )}
                        {candidate.websiteUrl && (
                          <a
                            href={candidate.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200"
                          >
                            {candidate.websiteUrl.replace('https://', '')}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="font-mono text-xs text-slate-300">
                        +{candidate.phone.slice(0, 2)} ({candidate.phone.slice(2, 4)}){' '}
                        {candidate.phone.slice(4, 9)}-{candidate.phone.slice(9)}
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs text-amber-300 mt-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{candidate.rating.toFixed(1)}</span>
                        <span className="text-slate-500">({candidate.reviewsCount})</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {candidate.alreadyQueued ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          Já na Fila
                        </span>
                      ) : isIgnored ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Ignorado (tem site)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/12 text-emerald-300 border border-emerald-500/25">
                          Apto p/ Disparo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredResults.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    {searchResults.length === 0
                      ? 'Preencha Cidade/Bairro e Nicho acima e clique em "Buscar Leads" para iniciar o garimpo.'
                      : 'Nenhuma empresa encontrada com esse filtro de diagnóstico.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
        active
          ? 'bg-slate-800 text-white border-slate-600'
          : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
