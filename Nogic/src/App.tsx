import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Workspace from "./Workspace.tsx";
import { SettingsProvider } from "@/contexts/SettingsContext.tsx";
import { TitleBar } from "@/components/TitleBar.tsx";

function App() {
  return (
    <SettingsProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TitleBar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <HashRouter>
            <Routes>
              <Route path="/" element={<Workspace />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </div>
      </div>
    </SettingsProvider>
  );
}

export default App;