import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Brain,
  TrendingUp,
  Map,
  AlertCircle,
  BarChart3,
  Bell,
  Leaf,
  Microscope,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const notifications = 0; // Replace with real unread count from /alerts endpoint

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/" },
    { name: "Prediction", icon: TrendingUp, path: "/prediction" },
    { name: "Leaf Scanner", icon: Microscope, path: "/leaf-scanner" },
    { name: "Field Map", icon: Map, path: "/field-map" },
    { name: "Analytics", icon: BarChart3, path: "/analytics" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-48 bg-white shadow-lg">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <Leaf className="w-8 h-8 text-green-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">AgriPredict</h1>
              <p className="text-xs text-gray-500">PEST INTELLIGENCE</p>
            </div>
          </div>
        </div>

        <nav className="p-4">
          <p className="text-xs font-semibold text-gray-400 mb-4">MAIN</p>
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                      active
                        ? "bg-green-100 text-green-700 font-medium"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b flex items-center justify-between px-8 py-4">
          <input
            type="text"
            placeholder="Search fields, alerts, pests..."
            className="flex-1 bg-gray-100 px-4 py-2 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="flex items-center gap-4 ml-6">
            <div className="flex items-center gap-1 text-xs text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              Live data stream
            </div>
            <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
