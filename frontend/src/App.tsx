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
  import('@/features/measuring-points/MeasuringPointsAdminPage').then((m) => ({
    default: m.MeasuringPointsAdminPage,
  })),
);
const MeasuringPointDetailPage = lazy(() =>
  import('@/features/measuring-points/MeasuringPointDetailPage').then((m) => ({
    default: m.MeasuringPointDetailPage,
  })),
);
const UsersAdminPage = lazy(() =>
  import('@/features/admin/UsersAdminPage').then((m) => ({ default: m.UsersAdminPage })),
);
const LocationsAdminPage = lazy(() =>
  import('@/features/admin/LocationsAdminPage').then((m) => ({ default: m.LocationsAdminPage })),
);
const AuditLogPage = lazy(() =>
  import('@/features/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const QrCodesAdminPage = lazy(() =>
  import('@/features/admin/QrCodesAdminPage').then((m) => ({ default: m.QrCodesAdminPage })),
);
const MorePage = lazy(() =>
  import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })),
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

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/erfassen" element={<RecordReadingPage />} />
          <Route path="/q/:token" element={<QrShortRedirect />} />
          <Route path="/erfassungen" element={<ReadingsListPage />} />
          <Route path="/mehr" element={<MorePage />} />
          <Route path="/passwort-aendern" element={<ChangePasswordPage />} />
          <Route
            path="/messstellen"
            element={
              <AdminOnly>
                <MeasuringPointsAdminPage />
              </AdminOnly>
            }
          />
          <Route
            path="/messstellen/:id"
            element={
              <AdminOnly>
                <MeasuringPointDetailPage />
              </AdminOnly>
            }
          />
          <Route
            path="/standorte"
            element={
              <AdminOnly>
                <LocationsAdminPage />
              </AdminOnly>
            }
          />
          <Route
            path="/benutzer"
            element={
              <AdminOnly>
                <UsersAdminPage />
              </AdminOnly>
            }
          />
          <Route
            path="/audit"
            element={
              <AdminOnly>
                <AuditLogPage />
              </AdminOnly>
            }
          />
          <Route
            path="/qr-codes"
            element={
              <AdminOnly>
                <QrCodesAdminPage />
              </AdminOnly>
            }
          />
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
