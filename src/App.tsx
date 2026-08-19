import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";
import { NotifyProvider } from "./components/ui/notify";

// Uncomment each once the page file exists.
import InventoryHome from "./pages/Inventory/InventoryHome";
import VendorsPage from "./pages/Inventory/VendorsPage";
import CategoriesPage from "./pages/Inventory/CategoriesPage";
import BrandsPage from "./pages/Inventory/BrandsPage";
import NewItemPage from "./pages/Inventory/NewItemPage";
import ItemSearchPage from "./pages/Inventory/Itemsearchpage";
import ArchivedItemsPage from "./pages/Inventory/ArchivedItemsPage";
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
import PerformancePage from "./pages/Tools/PerformancePage";
import CashCalculatorPage from "./pages/Tools/CashCalculatorPage";
import StoreSettingsPage from "./pages/Store/StoreSettingsPage";
import SharingPage from "./pages/Store/SharingPage";
import MasterPage from "./pages/Master/MasterPage";


/**
 * A focused number field changes value when the wheel passes over it, which
 * silently edits a price while someone is only scrolling the page. Dropping
 * focus first means the browser has nothing to step, and the page scrolls as
 * normal. The arrows themselves are hidden in index.css.
 */
function useNoWheelOnNumbers() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number" && el === e.target) {
        el.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
}

export default function App() {
  useNoWheelOnNumbers();

  return (
    <Router>
      <NotifyProvider>
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
            <Route path="/inventory/archive" element={<ArchivedItemsPage />} />
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
            <Route path="/tools/performance" element={<PerformancePage />} />
            <Route path="/tools/cash" element={<CashCalculatorPage />} />
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
      </NotifyProvider>
    </Router>
  );
}