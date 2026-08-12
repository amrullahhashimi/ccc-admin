import { useStore } from "../../context/StoreContext";
import React from "react";
import GridShape from "../../components/common/GridShape";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logo, branding } = useStore();
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full lg:w-1/2 bg-brand-950 dark:bg-white/5 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex flex-col items-center max-w-xs">
                <img
                  width={231}
                  height={48}
                  src={logo("authLogo")}
                  alt={branding.name ?? "Logo"}
                />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
