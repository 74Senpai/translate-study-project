import { Routes, Route } from "react-router-dom";
import TranslatePage from "@/pages/TranslatePage";
import TopicDetailPage from "@/pages/TopicDetailPage";
import AuthPage from "@/pages/AuthPage";
import HistoryPage from "@/pages/HistoryPage";
import EncounteredWordsPage from "@/pages/EncounteredWordsPage";
import MyProfilePage from "@/pages/MyProfilePage";
import NotFoundPage from "@/pages/NotFoundPage";
import ErrorPage from "@/pages/ErrorPage";
import FlashcardListPage from "@/pages/FlashcardListPage";
import FlashcardPlayerPage from "@/pages/FlashcardPlayerPage";
import SettingsPage from "@/pages/SettingsPage";
import ExtensionLoginPage from "@/pages/ExtensionLoginPage";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PublicRoute from "@/components/auth/PublicRoute";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/contexts/SettingsContext";
import axiosInstance from "@/services/axiosInstance";
import { useEffect, useState } from "react";
import Toast from "@/components/ui/Toast";
import { NotificationProvider } from "@/components/ui/NotificationProvider";

// Admin CMS Pages
import DashboardLayout from "@/pages/admin/DashboardLayout";
import Overview from "@/pages/admin/Overview";
import UserManagement from "@/pages/admin/UserManagement";
import DictionaryManagement from "@/pages/admin/DictionaryManagement";
import FlashcardManagement from "@/pages/admin/FlashcardManagement";
import FlashcardEditor from "@/pages/admin/FlashcardEditor";
import AdminErrorPage from "@/pages/admin/AdminErrorPage";

export default function App() {
  const { isAuthenticated } = useAuth();
  const { localProficiency, syncLocalData } = useSettings();
  const [syncNotification, setSyncNotification] = useState(null);

  useEffect(() => {
    if (isAuthenticated && Object.keys(localProficiency || {}).length > 0) {
      syncLocalData(axiosInstance).then((count) => {
        if (count > 0) {
          setSyncNotification(`Đã đồng bộ ${count} từ vựng từ máy của bạn!`);
        }
      });
    }
  }, [isAuthenticated, localProficiency, syncLocalData]);

  return (
    <NotificationProvider>
      {syncNotification && (
        <Toast
          message={syncNotification}
          type="sync"
          onClose={() => setSyncNotification(null)}
        />
      )}
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<TranslatePage />} />
        <Route path="/library/topic/:slug" element={<TopicDetailPage />} />
        <Route path="/flashcards" element={<FlashcardListPage />} />
        <Route path="/flashcards/play/:id" element={<FlashcardPlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/403" element={<ErrorPage code={403} />} />
        <Route path="/500" element={<ErrorPage code={500} />} />
        <Route path="/extension-login" element={<ExtensionLoginPage />} />

        {/* Auth Routes (Guest Only) */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <AuthPage />
            </PublicRoute>
          }
        />

        {/* Private Routes (Auth Required) */}
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/saved-words"
          element={
            <ProtectedRoute>
              <EncounteredWordsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <MyProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Admin Console Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRoles={["ADMIN", "MANAGER", "CREATOR"]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="dictionary" element={<DictionaryManagement />} />
          <Route path="flashcards" element={<FlashcardManagement />} />
          <Route path="flashcards/new" element={<FlashcardEditor />} />
          <Route path="flashcards/edit/:id" element={<FlashcardEditor />} />
          <Route path="403" element={<AdminErrorPage code={403} />} />
          <Route path="500" element={<AdminErrorPage code={500} />} />
          <Route path="*" element={<AdminErrorPage code={404} />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </NotificationProvider>
  );
}
