import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthModalProvider } from "./context/AuthModalContext";
import AuthModal from "./components/auth/AuthModal";
import AppShell from "./layout/AppShell";
import Landing from "./pages/home/Landing";
import Sistema from "./pages/Sistema";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import RegisterPage from "./pages/auth/RegisterPage";
import LegalConsentPage from "./pages/auth/LegalConsentPage";
import ForbiddenPage from "./pages/system/ForbiddenPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleGuard from "./components/auth/RoleGuard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminReports from "./pages/admin/Reports";
import AdminSettings from "./pages/admin/Settings";
import AdminAnimalsPage from "./pages/admin/AdminAnimalsPage";
import AdminAdoptionsPage from "./pages/admin/AdminAdoptionsPage";
import CouponsAdminPage from "./pages/admin/CouponsAdminPage";
import RedirectHome from "./pages/RedirectHome";
import AuthLayout from "./layout/AuthLayout";
import AdminHome from "./pages/admin/AdminHome";
import ProfilePage from "./pages/profile/ProfilePage";
import AnimalsPublicList from "./pages/animals/AnimalsPublicList";
import AnimalDetail from "./pages/animals/AnimalDetail";
import MyAdoptions from "./pages/animals/MyAdoptions";
import AdoptionDetail from "./pages/animals/AdoptionDetail";
import ProtectoraDashboard from "./pages/protectora/ProtectoraDashboard";
import AnimalsPage from "./pages/landlord/AnimalsPage";
import AdoptionsPage from "./pages/landlord/AdoptionsPage";
import QuestionnairePage from "./pages/landlord/QuestionnairePage";
import DonationsPage from "./pages/Donations";
import Home from "./pages/home/Home";
import CouponsList from "./pages/coupons/CouponsList";
import PatitasPending from "./pages/partners/PatitasPending";
import PetPage from "./pages/pet/PetPage";

const tenantHome = <Navigate to="/home" replace />;
const protectoraHome = <Navigate to="/landlord" replace />;
const adminHome = <Navigate to="/admin" replace />;

// Entrada pública: usuarios anónimos ven la landing; los logueados van a su panel.
function HomeGate() {
  const { user } = useAuth();
  return user ? <RedirectHome /> : <Landing />;
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <AuthModalProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomeGate />} />
            <Route path="/sistema" element={<Sistema />} />
            <Route element={<AppShell />}>
              <Route path="/animals" element={<AnimalsPublicList />} />
              <Route path="/animals/:id" element={<AnimalDetail />} />
              <Route path="/coupons" element={<CouponsList />} />
              <Route path="/donate" element={<ProtectedRoute><DonationsPage /></ProtectedRoute>} />

              <Route path="/home" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><Home /></RoleGuard></ProtectedRoute>} />
              <Route path="/pet" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><PetPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/adoptions/mine" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><MyAdoptions /></RoleGuard></ProtectedRoute>} />
              <Route path="/adoptions/:id" element={<ProtectedRoute><AdoptionDetail /></ProtectedRoute>} />

              <Route path="/landlord" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><ProtectoraDashboard /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/animals" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><AnimalsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/adoptions" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><AdoptionsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/questionnaire" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><QuestionnairePage /></RoleGuard></ProtectedRoute>} />

              <Route path="/partner" element={<ProtectedRoute><RoleGuard roles={["store", "vet"]}><PatitasPending /></RoleGuard></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminHome /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminUsersPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/animals" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminAnimalsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/adoptions" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminAdoptionsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/coupons" element={<ProtectedRoute><RoleGuard roles={["admin"]}><CouponsAdminPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/reports" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminReports /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminSettings /></RoleGuard></ProtectedRoute>} />

              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

              <Route path="/properties/*" element={<Navigate to="/animals" replace />} />
              <Route path="/coliving/*" element={<Navigate to="/animals" replace />} />
              <Route path="/pros/*" element={<Navigate to="/coupons" replace />} />
              <Route path="/me/favorites" element={<Navigate to="/animals" replace />} />

              <Route path="/tenant" element={tenantHome} />
              <Route path="/tenant/*" element={tenantHome} />
              <Route path="/contracts/*" element={tenantHome} />
              <Route path="/tickets/*" element={tenantHome} />
              <Route path="/tenant-pro/*" element={<Navigate to="/profile" replace />} />

              <Route path="/owner/properties" element={protectoraHome} />
              <Route path="/landlord/payments" element={protectoraHome} />
              <Route path="/landlord/issues" element={protectoraHome} />
              <Route path="/landlord/services" element={protectoraHome} />
              <Route path="/landlord/showings" element={protectoraHome} />

              <Route path="/pro" element={<Navigate to="/partner" replace />} />
              <Route path="/pro/*" element={<Navigate to="/partner" replace />} />

              <Route path="/earnings" element={adminHome} />
              <Route path="/admin/tenant-pro" element={adminHome} />
              <Route path="/admin/properties" element={<Navigate to="/admin/animals" replace />} />
              <Route path="/admin/incidents" element={<Navigate to="/admin/reports" replace />} />
              <Route path="/admin/payments" element={<Navigate to="/admin/reports" replace />} />

              <Route path="/403" element={<ForbiddenPage />} />
              <Route path="*" element={<div style={{ padding: 24 }}>404</div>} />
            </Route>

            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset" element={<ResetPassword />} />
              <Route path="/legal-consent" element={<ProtectedRoute><LegalConsentPage /></ProtectedRoute>} />
            </Route>
          </Routes>
          <AuthModal />
        </BrowserRouter>
      </AuthModalProvider>
    </AuthProvider>
  );
}
