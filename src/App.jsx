import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './admin/AuthContext.jsx'
import AdminLayout from './admin/components/AdminLayout.jsx'
import ProtectedRoute from './admin/components/ProtectedRoute.jsx'
import DashboardPage from './admin/pages/DashboardPage.jsx'
import LeadsPage from './admin/pages/LeadsPage.jsx'
import LoginPage from './admin/pages/LoginPage.jsx'
import Operacao from './admin/pages/Operacao.jsx'
import OrdersPage from './admin/pages/OrdersPage.jsx'
import ProductsPage from './admin/pages/ProductsPage.jsx'
import SettingsPage from './admin/pages/SettingsPage.jsx'
import './admin/admin.css'
import StorePage from './store/pages/StorePage.jsx'
import CheckoutPage from './store/pages/CheckoutPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<StorePage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="produtos" element={<ProductsPage />} />
              <Route path="pedidos" element={<OrdersPage />} />
              <Route path="operacao" element={<Operacao />} />
              <Route path="conteudo" element={<Navigate replace to="/admin/operacao" />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
