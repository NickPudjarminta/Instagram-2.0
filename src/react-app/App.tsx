import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "./context/SettingsContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}
