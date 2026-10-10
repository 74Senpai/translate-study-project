import { Routes, Route } from "react-router-dom";
import DashboardLayout from "@/pages/DashboardLayout";
import Overview from "@/pages/Overview";
import LoginPage from "@/pages/LoginPage";
import FeedbackManagement from "@/pages/FeedbackManagement";
import LibraryManagement from "@/pages/LibraryManagement";
import LibraryForm from "@/pages/LibraryForm";
import DictionaryManagement from "@/pages/DictionaryManagement";
import UserManagement from "@/pages/UserManagement";
import FlashcardManagement from "@/pages/FlashcardManagement";
import FlashcardEditor from "@/pages/FlashcardEditor";
import SkillsManagement from "@/pages/SkillsManagement";
import SkillExerciseForm from "@/pages/SkillExerciseForm";
import AdminErrorPage from "@/pages/AdminErrorPage";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PublicRoute from "@/components/auth/PublicRoute";
import { NotificationProvider } from "@/components/ui/NotificationProvider";

export default function App() {
  return (
    <NotificationProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route 
            index 
            element={
              <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
                <Overview />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="users" 
            element={
              <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
                <UserManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="feedback" 
            element={
              <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
                <FeedbackManagement />
              </ProtectedRoute>
            } 
          />
          <Route path="library" element={<LibraryManagement />} />
          <Route path="library/new" element={<LibraryForm />} />
          <Route path="library/edit/:slug" element={<LibraryForm />} />
          <Route 
            path="dictionary" 
            element={
              <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
                <DictionaryManagement />
              </ProtectedRoute>
            } 
          />
          <Route path="flashcards" element={<FlashcardManagement />} />
          <Route path="flashcards/new" element={<FlashcardEditor />} />
          <Route path="flashcards/edit/:id" element={<FlashcardEditor />} />
          <Route path="skills" element={<SkillsManagement />} />
          <Route path="skills/new" element={<SkillExerciseForm />} />
          <Route path="skills/edit/:id" element={<SkillExerciseForm />} />
          <Route path="403" element={<AdminErrorPage code={403} />} />
          <Route path="500" element={<AdminErrorPage code={500} />} />
          <Route path="*" element={<AdminErrorPage code={404} />} />
        </Route>
        <Route path="*" element={<AdminErrorPage code={404} />} />
      </Routes>
    </NotificationProvider>
  );
}
