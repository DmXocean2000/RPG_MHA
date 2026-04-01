import { Navigate, Route, Routes } from "react-router-dom";
import CharacterCreationPage from "./pages/CharacterCreation";
import CampaignSelectionPage from "./pages/CampaignSelection";
import GameScreenPage from "./pages/GameScreen";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route path="/create" element={<CharacterCreationPage />} />
        <Route path="/campaign" element={<CampaignSelectionPage />} />
        <Route path="/game/:gameId" element={<GameScreenPage />} />
      </Routes>
    </div>
  );
}
