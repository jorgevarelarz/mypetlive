import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthModalProvider } from "./context/AuthModalContext";
import AuthModal from "./components/auth/AuthModal";
import AppShell from "./layout/AppShell";
import HashScroll from "./components/HashScroll";
import Landing from "./pages/home/Landing";
import Sistema from "./pages/Sistema";
import AnimalPassport from "./pages/passport/AnimalPassport";
import MoodDirections from "./pages/MoodDirections";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import RegisterPage from "./pages/auth/RegisterPage";
import LegalConsentPage from "./pages/auth/LegalConsentPage";
import LegalDocPage from "./pages/legal/LegalDocPage";
import ForbiddenPage from "./pages/system/ForbiddenPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleGuard from "./components/auth/RoleGuard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminReports from "./pages/admin/Reports";
import AdminSettings from "./pages/admin/Settings";
import AdminAnimalsPage from "./pages/admin/AdminAnimalsPage";
import AdminAdoptionsPage from "./pages/admin/AdminAdoptionsPage";
import CouponsAdminPage from "./pages/admin/CouponsAdminPage";
import AdminVerificationsPage from "./pages/admin/AdminVerificationsPage";
import AdminSettlementsPage from "./pages/admin/AdminSettlementsPage";
import RedirectHome from "./pages/RedirectHome";
import AuthLayout from "./layout/AuthLayout";
import AdminHome from "./pages/admin/AdminHome";
import ProfilePage from "./pages/profile/ProfilePage";
import ConfirmEmailChange from "./pages/profile/ConfirmEmailChange";
import AnimalsPublicList from "./pages/animals/AnimalsPublicList";
import AnimalDetail from "./pages/animals/AnimalDetail";
import MyAdoptions from "./pages/animals/MyAdoptions";
import AdoptionDetail from "./pages/animals/AdoptionDetail";
import ProtectoraDashboard from "./pages/protectora/ProtectoraDashboard";
import AnimalsPage from "./pages/landlord/AnimalsPage";
import AdoptionsPage from "./pages/landlord/AdoptionsPage";
import QuestionnairePage from "./pages/landlord/QuestionnairePage";
import ShelterVerificationPage from "./pages/protectora/ShelterVerificationPage";
import DonationsPage from "./pages/Donations";
import Home from "./pages/home/Home";
import CouponsList from "./pages/coupons/CouponsList";
import PatitasPending from "./pages/partners/PatitasPending";
import PartnerHome from "./pages/partners/PartnerHome";
import PartnerCouponsPage from "./pages/partners/PartnerCouponsPage";
import CashierPage from "./pages/partners/CashierPage";
import WhereToBuyPage from "./pages/shop/WhereToBuyPage";
import StorePage from "./pages/shop/StorePage";
import ProductPage from "./pages/shop/ProductPage";
import CartPage from "./pages/shop/CartPage";
import OrderPage from "./pages/shop/OrderPage";
import MyOrdersPage from "./pages/shop/MyOrdersPage";
import StoreProductsPage from "./pages/partners/StoreProductsPage";
import StoreOrdersPage from "./pages/partners/StoreOrdersPage";
import TpvGuidePage from "./pages/developers/TpvGuidePage";
import PetPage from "./pages/pet/PetPage";
import AppointmentsPage from "./pages/vet/AppointmentsPage";
import Favorites from "./pages/Favorites";
import AnimalAlerts from "./pages/animals/AnimalAlerts";

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
          <HashScroll />
          <Routes>
            <Route path="/" element={<HomeGate />} />
            <Route path="/sistema" element={<Sistema />} />
            <Route path="/mood" element={<MoodDirections />} />
            <Route path="/p/:code" element={<AnimalPassport />} />
            <Route element={<AppShell />}>
              <Route path="/animals" element={<AnimalsPublicList />} />
              <Route path="/animals/:id" element={<AnimalDetail />} />
              <Route path="/me/favorites" element={<Favorites />} />
              <Route path="/me/alerts" element={<ProtectedRoute><AnimalAlerts /></ProtectedRoute>} />
              <Route path="/coupons" element={<CouponsList />} />
              <Route path="/donate" element={<ProtectedRoute><DonationsPage /></ProtectedRoute>} />

              {/* Marketplace. Catálogo, carrito y pedido son públicos a propósito:
                  se puede comprar sin cuenta, y el invitado vuelve de Stripe a
                  /pedido/:id con el token que le da acceso. */}
              <Route path="/tienda" element={<StorePage />} />
              <Route path="/tienda/:id" element={<ProductPage />} />
              <Route path="/carrito" element={<CartPage />} />
              <Route path="/pedido/:id" element={<OrderPage />} />
              <Route path="/mis-pedidos" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />

              <Route path="/home" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><Home /></RoleGuard></ProtectedRoute>} />
              <Route path="/pet" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><PetPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/adoptions/mine" element={<ProtectedRoute><RoleGuard roles={["tenant"]}><MyAdoptions /></RoleGuard></ProtectedRoute>} />
              <Route path="/adoptions/:id" element={<ProtectedRoute><AdoptionDetail /></ProtectedRoute>} />

              <Route path="/landlord" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><ProtectoraDashboard /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/animals" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><AnimalsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/adoptions" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><AdoptionsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/questionnaire" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><QuestionnairePage /></RoleGuard></ProtectedRoute>} />
              <Route path="/landlord/verificacion" element={<ProtectedRoute><RoleGuard roles={["landlord"]}><ShelterVerificationPage /></RoleGuard></ProtectedRoute>} />

              <Route path="/partner" element={<ProtectedRoute><RoleGuard roles={["store", "vet"]}><PartnerHome /></RoleGuard></ProtectedRoute>} />
              <Route path="/partner/patitas" element={<ProtectedRoute><RoleGuard roles={["store", "vet"]}><PatitasPending /></RoleGuard></ProtectedRoute>} />
              <Route path="/partner/cupones" element={<ProtectedRoute><RoleGuard roles={["store", "vet"]}><PartnerCouponsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/comprar" element={<ProtectedRoute><WhereToBuyPage /></ProtectedRoute>} />
              <Route path="/caja" element={<ProtectedRoute><RoleGuard roles={["store", "vet"]}><CashierPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/partner/productos" element={<ProtectedRoute><RoleGuard roles={["store"]}><StoreProductsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/partner/pedidos" element={<ProtectedRoute><RoleGuard roles={["store"]}><StoreOrdersPage /></RoleGuard></ProtectedRoute>} />
              {/* Guía pública para proveedores de TPV (sin cuenta). */}
              <Route path="/developers/tpv" element={<TpvGuidePage />} />

              <Route path="/citas" element={<ProtectedRoute><RoleGuard roles={["tenant", "landlord", "vet"]}><AppointmentsPage /></RoleGuard></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminHome /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminUsersPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/animals" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminAnimalsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/adoptions" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminAdoptionsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/coupons" element={<ProtectedRoute><RoleGuard roles={["admin"]}><CouponsAdminPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/verifications" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminVerificationsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/settlements" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminSettlementsPage /></RoleGuard></ProtectedRoute>} />
              {/* Misma pantalla que la tienda: el trabajo es el mismo y para el
                  admin añade el coste de proveedor de lo que vendemos nosotros. */}
              <Route path="/admin/productos" element={<ProtectedRoute><RoleGuard roles={["admin"]}><StoreProductsPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/pedidos" element={<ProtectedRoute><RoleGuard roles={["admin"]}><StoreOrdersPage /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/reports" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminReports /></RoleGuard></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute><RoleGuard roles={["admin"]}><AdminSettings /></RoleGuard></ProtectedRoute>} />

              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

              <Route path="/properties/*" element={<Navigate to="/animals" replace />} />
              <Route path="/coliving/*" element={<Navigate to="/animals" replace />} />
              <Route path="/pros/*" element={<Navigate to="/coupons" replace />} />
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
              {/* Pública a propósito: se abre desde el buzón nuevo, donde puede
                  no haber sesión. El token del enlace es la credencial. */}
              <Route path="/perfil/confirmar-email" element={<ConfirmEmailChange />} />
              <Route path="/legal-consent" element={<ProtectedRoute><LegalConsentPage /></ProtectedRoute>} />
              {/* Públicas a propósito: los textos legales tienen que poder
                  leerse ANTES de registrarse y sin sesión. */}
              <Route path="/legal/:slug" element={<LegalDocPage />} />
            </Route>
          </Routes>
          <AuthModal />
        </BrowserRouter>
      </AuthModalProvider>
    </AuthProvider>
  );
}
