import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import CalendarPage from "@/pages/CalendarPage";
import CourseDetailPage from "@/pages/CourseDetailPage";
import LoginPage from "@/pages/LoginPage";
import OfficeHoursPage from "@/pages/OfficeHoursPage";
import RegisterPage from "@/pages/RegisterPage";
import SemesterSetupPage from "@/pages/SemesterSetupPage";
import SemesterHubPage from "@/pages/SemesterHubPage";
import SyllabusReviewPage from "@/pages/SyllabusReviewPage";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-muted">Loading…</div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/semester-setup"
        element={
          <RequireAuth>
            <SemesterSetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug"
        element={
          <RequireAuth>
            <CourseDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug/review"
        element={
          <RequireAuth>
            <SyllabusReviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/office-hours"
        element={
          <RequireAuth>
            <OfficeHoursPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <SemesterHubPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
