import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import WelcomePage from "./pages/Welcome";
import DnDBasicsPage from "./pages/DnDBasics";
import CharacterCreationPage from "./pages/CharacterCreation";
import QuirkSelectionPage from "./pages/QuirkSelection";
import CampaignSelectionPage from "./pages/CampaignSelection";
import GameScreenPage from "./pages/GameScreen";
import DevToolsPage from "./pages/DevTools";

const ONBOARDING_ROUTES = new Set(["/", "/create", "/quirk", "/campaign"]);

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ONBOARDING_ROUTES.has(location.pathname)) return undefined;

    function handleMouseBackForward(event) {
      if (event.button === 3) {
        event.preventDefault();
        navigate(-1);
      } else if (event.button === 4) {
        event.preventDefault();
        navigate(1);
      }
    }

    window.addEventListener("mousedown", handleMouseBackForward);
    return () => window.removeEventListener("mousedown", handleMouseBackForward);
  }, [location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/basics" element={<DnDBasicsPage />} />
        <Route path="/create" element={<CharacterCreationPage />} />
        <Route path="/quirk" element={<QuirkSelectionPage />} />
        <Route path="/campaign" element={<CampaignSelectionPage />} />
        <Route path="/game/:gameId" element={<GameScreenPage />} />
        <Route path="/dev" element={<DevToolsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
