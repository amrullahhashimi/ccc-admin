import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";

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
import NewSalePage from "./pages/Sales/Newsalepage";
import SalesPage from "./pages/Sales/Salespage";
import SaleDetailPage from "./pages/Sales/Saledetailpage";
import ToolsHome from "./pages/Tools/ToolsHome";
import ImeiCheckerPage from "./pages/Tools/ImeiCheckerPage";
import StoreSettingsPage from "./pages/Store/StoreSettingsPage";
import SharingPage from "./pages/Store/SharingPage";
import MasterPage from "./pages/Master/MasterPage";


export default function App() {
  return (
    <Router>
      <AuthProvider>
        <StoreProvider>
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
            <Route path="/inventory" element={<InventoryHome />} />
            <Route path="/inventory/vendors" element={<VendorsPage />} />
            <Route path="/inventory/categories" element={<CategoriesPage />} />
            <Route path="/inventory/brands" element={<BrandsPage />} />
            <Route path="/inventory/new" element={<NewItemPage />} />
            <Route path="/inventory/search" element={<ItemSearchPage />} />
            <Route path="/inventory/items/:id" element={<ProductDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route index path="/" element={<Home />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/service" element={<ServiceHome />} />
            <Route path="/service/orders" element={<ServicePage />} />
            <Route path="/service/new" element={<ServiceNewPage />} />
            <Route path="/service/:id" element={<ServiceNewPage />} />
            <Route path="/sales/new" element={<NewSalePage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/sales/:id" element={<SaleDetailPage />} />
            <Route path="/tools" element={<ToolsHome />} />
            <Route path="/tools/imei" element={<ImeiCheckerPage />} />
            <Route path="/store" element={<StoreSettingsPage />} />
            <Route path="/store/sharing" element={<SharingPage />} />
            <Route path="/master" element={<MasterPage />} />

          </Route>

          {/* Public */}
          <Route path="/signin" element={<SignIn />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
          {/* Public — no login */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/track/:token" element={<TrackPage />} />

        </Routes>
        </StoreProvider>
      </AuthProvider>
    </Router>
  );
}