/**
 * Auswertungen — Platzhalter.
 *
 * Der Menüpunkt + die Route existieren bereits; die konfigurierbaren
 * Auswertungsmöglichkeiten folgen in einem späteren Schritt. Sichtbar für
 * alle angemeldeten Nutzer (kein Admin-Gating).
 */

import { BarChart3 } from 'lucide-react';

import { EmptyState, LargeTitle } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';

export function ReportsPage() {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">
        <LargeTitle title="Auswertungen" />
        <EmptyState
          icon={<BarChart3 size={32} />}
          title="Auswertungen kommen bald"
          description="Hier entstehen konfigurierbare Verbrauchs- und Bestandsauswertungen. Die Konfiguration folgt in einem nächsten Schritt."
        />
      </div>
    </div>
  );
}
