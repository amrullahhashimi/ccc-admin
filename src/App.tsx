import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import { AuthProvider, RequireAuth } from "./context/AuthContext";

// Uncomment each once the page file exists.
import InventoryHome from "./pages/Inventory/InventoryHome";
import VendorsPage from "./pages/Inventory/VendorsPage";
import CategoriesPage from "./pages/Inventory/CategoriesPage";
import BrandsPage from "./pages/Inventory/BrandsPage";
import NewItemPage from "./pages/Inventory/NewItemPage";
import ItemSearchPage from "./pages/Inventory/Itemsearchpage";
import ProductDetailPage from "./pages/Inventory/ProductDetailPage";
import SettingsPage from "./pages/SettingsPage";
import CustomersPage from "./pages/Inventory/CustomersPage";
import ServiceHome from "./pages/Inventory/ServiceHome";
import ServicePage from "./pages/Inventory/ServicePage";
import ServiceNewPage from "./pages/Inventory/ServiceNewPage";
import TrackPage from "./pages/Inventory/Trackpage";

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          {/* Everything inside here needs a signed-in user */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index path="/" element={<Home />} />
            <Route path="/inventory" element={<InventoryHome />} />
            <Route path="/inventory/vendors" element={<VendorsPage />} />
            <Route path="/inventory/categories" element={<CategoriesPage />} />
            <Route path="/inventory/brands" element={<BrandsPage />} />
            <Route path="/inventory/new" element={<NewItemPage />} />
            <Route path="/inventory/search" element={<ItemSearchPage />} />
            <Route path="/inventory/items/:id" element={<ProductDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/service" element={<ServiceHome />} />
            <Route path="/service/orders" element={<ServicePage />} />
            <Route path="/service/new" element={<ServiceNewPage />} />
            <Route path="/service/:id" element={<ServiceNewPage />} />
          </Route>

          {/* Public */}
          <Route path="/signin" element={<SignIn />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
          {/* Public — no login */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/track/:token" element={<TrackPage />} />

        </Routes>
      </AuthProvider>
    </Router>
  );
}