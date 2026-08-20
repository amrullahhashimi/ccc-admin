import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      {/* min-w-0: a flex child is min-width:auto by default, so anything wide
          inside a page — a table, a chart — stretches this column past the
          viewport and scrolls the whole shell sideways, sidebar and all.
          Allowing it to shrink lets each page's own overflow container do the
          scrolling instead. */}
      <div
        className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[200px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
