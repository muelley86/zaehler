/**
 * Routing-Wurzel der App.
 *
 * Drei Modi:
 *  1) nicht angemeldet  → nur /login
 *  2) Force-Password-Change → nur /passwort-aendern
 *  3) angemeldet → AppShell mit allen Routen, Admin-Bereiche per AdminOnly
 *
 * Routen-Komponenten sind ``React.lazy``-geladen — das initiale JS-Bundle
 * enthält damit nur AppShell + Login + ChangePassword. Der Rest wird beim
 * ersten Aufruf der jeweiligen Route nachgeladen (Recharts, Leaflet etc.
 * landen so nicht im Initial-Chunk).
 */

import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/features/auth/auth-context';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { TwoFactorSetupPage } from '@/features/auth/TwoFactorSetupPage';
import { AdminLayout } from '@/features/admin/AdminLayout';

const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const RecordReadingPage = lazy(() =>
  import('@/features/readings/RecordReadingPage').then((m) => ({ default: m.RecordReadingPage })),
);
const ReadingsListPage = lazy(() =>
  import('@/features/readings/ReadingsListPage').then((m) => ({ default: m.ReadingsListPage })),
);
const MeasuringPointsAdminPage = lazy(() =>
  import('@/features/admin/measuring-points/MeasuringPointsAdminPage').then((m) => ({
    default: m.MeasuringPointsAdminPage,
  })),
);
const MeasuringPointDetailPage = lazy(() =>
  import('@/features/admin/measuring-points/MeasuringPointDetailPage').then((m) => ({
    default: m.MeasuringPointDetailPage,
  })),
);
const UsersAdminPage = lazy(() =>
  import('@/features/admin/users/UsersAdminPage').then((m) => ({ default: m.UsersAdminPage })),
);
const LocationsAdminPage = lazy(() =>
  import('@/features/admin/locations/LocationsAdminPage').then((m) => ({
    default: m.LocationsAdminPage,
  })),
);
const MainLocationsAdminPage = lazy(() =>
  import('@/features/admin/main-locations/MainLocationsAdminPage').then((m) => ({
    default: m.MainLocationsAdminPage,
  })),
);
const OwnersAdminPage = lazy(() =>
  import('@/features/admin/owners/OwnersAdminPage').then((m) => ({
    default: m.OwnersAdminPage,
  })),
);
const OwnerDetailPage = lazy(() =>
  import('@/features/admin/owners/OwnerDetailPage').then((m) => ({
    default: m.OwnerDetailPage,
  })),
);
const SuppliersAdminPage = lazy(() =>
  import('@/features/admin/suppliers/SuppliersAdminPage').then((m) => ({
    default: m.SuppliersAdminPage,
  })),
);
const SupplierDetailPage = lazy(() =>
  import('@/features/admin/suppliers/SupplierDetailPage').then((m) => ({
    default: m.SupplierDetailPage,
  })),
);
const MietersAdminPage = lazy(() =>
  import('@/features/admin/mieters/MietersAdminPage').then((m) => ({
    default: m.MietersAdminPage,
  })),
);
const MieterDetailPage = lazy(() =>
  import('@/features/admin/mieters/MieterDetailPage').then((m) => ({
    default: m.MieterDetailPage,
  })),
);
const VirtualPointsAdminPage = lazy(() =>
  import('@/features/admin/virtual-points/VirtualPointsAdminPage').then((m) => ({
    default: m.VirtualPointsAdminPage,
  })),
);
const AuditLogPage = lazy(() =>
  import('@/features/admin/audit/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const ImportReadingsPage = lazy(() =>
  import('@/features/admin/import/ImportReadingsPage').then((m) => ({
    default: m.ImportReadingsPage,
  })),
);
const QrCodesAdminPage = lazy(() =>
  import('@/features/admin/qr-codes/QrCodesAdminPage').then((m) => ({
    default: m.QrCodesAdminPage,
  })),
);
const AdminHubPage = lazy(() =>
  import('@/features/admin/AdminHubPage').then((m) => ({ default: m.AdminHubPage })),
);
const SystemAdminPage = lazy(() =>
  import('@/features/admin/system/SystemAdminPage').then((m) => ({
    default: m.SystemAdminPage,
  })),
);
const SessionsAdminPage = lazy(() =>
  import('@/features/admin/sessions/SessionsAdminPage').then((m) => ({
    default: m.SessionsAdminPage,
  })),
);
const MorePage = lazy(() =>
  import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const VirtualPointDetailPage = lazy(() =>
  import('@/features/virtual-points/VirtualPointDetailPage').then((m) => ({
    default: m.VirtualPointDetailPage,
  })),
);

function RouteFallback(): JSX.Element {
  return <div className="flex h-full items-center justify-center text-tertiary">Lade…</div>;
}

/** Crockford-Base32, 8 Zeichen — siehe parseScannedUrl. */
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{8}$/;

/**
 * Shortpath-Redirect: ``/q/{token}`` → ``/erfassen?token={token}``.
 *
 * Diese Route existiert primär, damit der QR-Code den kürzeren URL-String
 * enkodieren kann (eine Version weniger im QR — siehe Backend-Doc in
 * ``_build_token_url``). Token wird zur Großschreibung normalisiert, bei
 * ungültigem Format Weiterleitung zur Startseite.
 */
function QrShortRedirect(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  if (!token || !TOKEN_RE.test(token)) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to={`/erfassen?token=${token.toUpperCase()}`} replace />;
}

/**
 * Legacy-Redirect für die alte ``/messstellen/:id``-Detail-URL. Erhält
 * den ``id``-Parameter und schickt auf ``/admin/messstellen/:id``.
 */
function LegacyMpDetailRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/messstellen/${id ?? ''}`} replace />;
}

export function App() {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-tertiary">Lade…</div>;
  }

  if (!me) {
    // ``/q/:token`` als from-Hint inkl. Search beibehalten, damit der User
    // nach dem Login direkt im Erfassen-Flow landet.
    const from = location.pathname + location.search;
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" state={{ from }} replace />} />
      </Routes>
    );
  }

  if (me.force_password_change) {
    return (
      <Routes>
        <Route path="/passwort-aendern" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/passwort-aendern" replace />} />
      </Routes>
    );
  }

  // Erzwungene 2FA-Einrichtung (Admin ohne TOTP bei aktivem
  // METERS_REQUIRE_TOTP_FOR_ADMIN). Greift nach der Passwort-Pflicht, damit
  // die Reihenfolge "erst Passwort, dann 2FA" stimmt. Das Backend erzwingt
  // dasselbe serverseitig (api/deps.py) — der Guard ist die UX-Schicht.
  if (me.must_setup_totp) {
    return (
      <Routes>
        <Route path="/2fa-einrichten" element={<TwoFactorSetupPage />} />
        <Route path="*" element={<Navigate to="/2fa-einrichten" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/erfassen" element={<RecordReadingPage />} />
          <Route path="/q/:token" element={<QrShortRedirect />} />
          <Route path="/erfassungen" element={<ReadingsListPage />} />
          <Route path="/auswertungen" element={<ReportsPage />} />
          {/* Detail einer verrechneten Messstelle — kein AdminOnly: das
              Backend liefert 404, wenn der Recorder keinen Vollzugriff hat. */}
          <Route path="/verrechnung/:id" element={<VirtualPointDetailPage />} />
          <Route path="/mehr" element={<MorePage />} />
          <Route path="/passwort-aendern" element={<ChangePasswordPage />} />
          <Route path="/2fa-einrichten" element={<TwoFactorSetupPage />} />

          {/* Admin-Bereich. Sub-Pages rendern unter dem AdminLayout-Outlet. */}
          <Route
            path="/admin"
            element={
              <AdminOnly>
                <AdminLayout />
              </AdminOnly>
            }
          >
            <Route index element={<AdminHubPage />} />
            <Route path="messstellen" element={<MeasuringPointsAdminPage />} />
            <Route path="messstellen/:id" element={<MeasuringPointDetailPage />} />
            <Route path="standorte" element={<LocationsAdminPage />} />
            <Route path="hauptstandorte" element={<MainLocationsAdminPage />} />
            <Route path="eigentuemer" element={<OwnersAdminPage />} />
            <Route path="eigentuemer/:id" element={<OwnerDetailPage />} />
            <Route path="lieferanten" element={<SuppliersAdminPage />} />
            <Route path="lieferanten/:id" element={<SupplierDetailPage />} />
            <Route path="mieter" element={<MietersAdminPage />} />
            <Route path="mieter/:id" element={<MieterDetailPage />} />
            <Route path="verrechnung" element={<VirtualPointsAdminPage />} />
            <Route path="benutzer" element={<UsersAdminPage />} />
            <Route path="qr-codes" element={<QrCodesAdminPage />} />
            <Route path="import" element={<ImportReadingsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="system" element={<SystemAdminPage />} />
            <Route path="sessions" element={<SessionsAdminPage />} />
          </Route>

          {/* Legacy-Redirects: alte Top-Level-Admin-URLs leben als
              clientseitige 301-Hops weiter. */}
          <Route path="/messstellen" element={<Navigate to="/admin/messstellen" replace />} />
          <Route path="/messstellen/:id" element={<LegacyMpDetailRedirect />} />
          <Route path="/standorte" element={<Navigate to="/admin/standorte" replace />} />
          <Route path="/benutzer" element={<Navigate to="/admin/benutzer" replace />} />
          <Route path="/qr-codes" element={<Navigate to="/admin/qr-codes" replace />} />
          <Route path="/audit" element={<Navigate to="/admin/audit" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (me?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
