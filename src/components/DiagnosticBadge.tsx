import type { SiteDiagnostic } from '../types/garimpo';

const DIAGNOSTIC_CONFIG: Record<
  SiteDiagnostic,
  { dotClass: string; badgeClass: string; label: string }
> = {
  sem_site: {
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-500/12 text-rose-300 border-rose-500/30',
    label: 'Sem Site',
  },
  so_instagram: {
    dotClass: 'bg-amber-400',
    badgeClass: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
    label: 'Só Instagram / Linktree',
  },
  possui_site: {
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
    label: 'Possui Site',
  },
};

export function DiagnosticBadge({
  diagnostic,
  compact = false,
}: {
  diagnostic: SiteDiagnostic;
  compact?: boolean;
}) {
  const cfg = DIAGNOSTIC_CONFIG[diagnostic];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cfg.badgeClass} ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
      <span>{cfg.label}</span>
    </span>
  );
}
