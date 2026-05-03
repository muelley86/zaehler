/**
 * Routing-Wurzel der App.
 *
 * Drei Modi:
 *  1) nicht angemeldet  → nur /login
 *  2) Force-Password-Change → nur /passwort-aendern
 *  3) angemeldet → AppShell mit allen Routen, Admin-Bereiche per AdminOnly
 */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/features/auth/auth-context';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { RecordReadingPage } from '@/features/readings/RecordReadingPage';
import { ReadingsListPage } from '@/features/readings/ReadingsListPage';
import { MeasuringPointsAdminPage } from '@/features/measuring-points/MeasuringPointsAdminPage';
import { MeasuringPointDetailPage } from '@/features/measuring-points/MeasuringPointDetailPage';
import { UsersAdminPage } from '@/features/admin/UsersAdminPage';
import { LocationsAdminPage } from '@/features/admin/LocationsAdminPage';
import { AuditLogPage } from '@/features/admin/AuditLogPage';
import { MorePage } from '@/features/more/MorePage';

export function App() {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-tertiary">Lade…</div>;
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="*"
          element={<Navigate to="/login" state={{ from: location.pathname }} replace />}
        />
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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/erfassen" element={<RecordReadingPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
