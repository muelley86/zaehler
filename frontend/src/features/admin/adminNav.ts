/**
 * Single-Source-of-Truth fuer alle Admin-Sub-Routen.
 *
 * Wird verwendet von:
 *  - {@link AdminLayout} - rendert die Sub-Sidebar (Desktop) und den
 *    horizontalen Tab-Strip (Mobile).
 *  - {@link AdminHubPage} - rendert das Card-Grid auf /admin.
 *
 * Reihenfolge ist die Anzeige-Reihenfolge in beiden Sichten. Wer einen
 * neuen Admin-Bereich anlegt, ergaenzt hier einen Eintrag und legt unter
 * features/admin/<slug>/ die Page-Komponente an. App.tsx-Route nicht
 * vergessen.
 */

import type { ReactNode } from 'react';
import {
  Building2,
  Database,
  Gauge,
  MapPin,
  QrCode,
  ScrollText,
  Shield,
  Sigma,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { createElement } from 'react';

export type AdminSectionColor = 'primary' | 'electricity' | 'water' | 'heating';

export interface AdminNavItem {
  /** Absoluter Pfad, immer ``/admin/...``. */
  to: string;
  /** Anzeige-Label (Sidebar, Tab-Strip, Hub-Card). */
  label: string;
  /** Optionales Kuerzel fuer den Tab-Strip auf schmalen Viewports. */
  short?: string;
  /** lucide-Icon (16-20 px). */
  icon: ReactNode;
  /** Kurzbeschreibung fuer die Hub-Card. */
  description: string;
  /** Farbton der Hub-Card-Icon-Box. */
  color: AdminSectionColor;
}

export const ADMIN_SECTIONS: AdminNavItem[] = [
  {
    to: '/admin/messstellen',
    label: 'Messstellen',
    icon: createElement(Gauge, { size: 18 }),
    description: 'Zähler, Register, Tarife',
    color: 'electricity',
  },
  {
    to: '/admin/standorte',
    label: 'Zählerstandorte',
    short: 'Zählerstand.',
    icon: createElement(MapPin, { size: 18 }),
    description: 'Adressen und Geo-Punkte',
    color: 'water',
  },
  {
    to: '/admin/hauptstandorte',
    label: 'Hauptstandorte',
    short: 'Haupt.',
    icon: createElement(Building2, { size: 18 }),
    description: 'Logische Klammer ueber Zaehlerstandorten',
    color: 'water',
  },
  {
    to: '/admin/eigentuemer',
    label: 'Eigentümer',
    short: 'Eigt.',
    icon: createElement(User, { size: 18 }),
    description: 'Eigentuemer-Stammdaten und MP-Zuordnung',
    color: 'primary',
  },
  {
    to: '/admin/verrechnung',
    label: 'Verrechnete Messstellen',
    short: 'Verrechn.',
    icon: createElement(Sigma, { size: 18 }),
    description: 'Virtuelle Messstellen aus +/− Komponenten',
    color: 'electricity',
  },
  {
    to: '/admin/benutzer',
    label: 'Benutzer',
    icon: createElement(Users, { size: 18 }),
    description: 'Konten, Rollen, Zugriffe',
    color: 'primary',
  },
  {
    to: '/admin/qr-codes',
    label: 'QR-Codes',
    icon: createElement(QrCode, { size: 18 }),
    description: 'Token-Vorrat und Druck',
    color: 'primary',
  },
  {
    to: '/admin/import',
    label: 'Import',
    icon: createElement(Upload, { size: 18 }),
    description: 'Historische Zählerstände aus Excel/CSV',
    color: 'electricity',
  },
  {
    to: '/admin/audit',
    label: 'Audit',
    icon: createElement(ScrollText, { size: 18 }),
    description: 'Änderungs-Log',
    color: 'heating',
  },
  {
    to: '/admin/system',
    label: 'System',
    icon: createElement(Database, { size: 18 }),
    description: 'Backup, Version, Wartung',
    color: 'heating',
  },
  {
    to: '/admin/sessions',
    label: 'Sessions',
    icon: createElement(Shield, { size: 18 }),
    description: 'Aktive Logins, 2FA',
    color: 'water',
  },
];
