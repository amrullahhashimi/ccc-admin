import { useSidebar } from "../context/SidebarContext";

const Backdrop: React.FC = () => {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();

  if (!isMobileOpen) return null;

  return (
    <div
      className="sidebar-backdrop fixed inset-0 z-40 lg:hidden"
      onClick={toggleMobileSidebar}
    />
  );
};

export default Backdrop;
