import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../lib/api";

function parseInventory(text) {
  return text
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((entry) => {
      const leadingCount = entry.match(/^(\d+)\s+(.+)$/);
      const trailingCount = entry.match(/^(.+?)\s*x\s*(\d+)$/i);
      if (leadingCount) {
        return { name: leadingCount[2].trim().toLowerCase(), quantity: Number(leadingCount[1]) };
      }
      if (trailingCount) {
        return { name: trailingCount[1].trim().toLowerCase(), quantity: Number(trailingCount[2]) };
      }
      return { name: entry.trim().toLowerCase(), quantity: 1 };
    })
    .filter((entry) => entry.name && Number.isFinite(entry.quantity) && entry.quantity > 0);
}

function inventoryToText(inventoryList) {
  if (!Array.isArray(inventoryList)) return "";
  return inventoryList
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const name = String(entry?.name || "").trim();
      const quantity = Number(entry?.quantity);
      if (!name) return "";
      if (!Number.isFinite(quantity) || quantity <= 1) return name;
      return `${quantity} ${name}`;
    })
    .filter(Boolean)
    .join("\n");
}

export default function DevToolsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [gameId, setGameId] = useState(location?.state?.gameId || localStorage.getItem("rpg_gameId") || "");
  const [newPlayerName, setNewPlayerName] = useState("DevPlayer");
  const [newFaction, setNewFaction] = useState("hero");
  const [newQuirk, setNewQuirk] = useState("quirkless");
  const [newDmChoice, setNewDmChoice] = useState("aizawa");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [inventoryText, setInventoryText] = useState("");

  const companionStatus = useMemo(() => gameState?.companionStatus || [], [gameState?.companionStatus]);

  function enterGame(targetGameId, options = {}) {
    const safeGameId = String(targetGameId || "").trim();
    if (!safeGameId) {
      setError("Game ID is required before entering the game.");
      return;
    }
    localStorage.setItem("rpg_gameId", safeGameId);
    navigate(`/game/${safeGameId}`, { state: options });
  }

  async function verifyPassword() {
    setError("");
    try {
      setLoading(true);
      await api.post("/api/dev/verify", { password });
      setVerified(true);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Dev password check failed.");
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadGame() {
    if (!verified) {
      setError("Verify password first.");
      return;
    }
    if (!gameId.trim()) {
      setError("Game ID is required.");
      return;
    }

    setError("");
    try {
      setLoading(true);
      const { data } = await api.post(`/api/dev/game/${gameId.trim()}`, { password });
      setGameState(data.gameState);
      setInventoryText(inventoryToText(data.gameState?.player?.inventory || []));
      localStorage.setItem("rpg_gameId", gameId.trim());
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load game.");
    } finally {
      setLoading(false);
    }
  }

  async function createGame() {
    if (!verified) {
      setError("Verify password first.");
      return;
    }
    setError("");
    try {
      setLoading(true);
      const { data } = await api.post("/api/dev/game", {
        password,
        settings: {
          playerName: newPlayerName,
          faction: newFaction,
          quirk: newQuirk,
          dmChoice: newDmChoice,
        },
      });
      setGameId(data.gameId);
      setGameState(data.gameState);
      setInventoryText(inventoryToText(data.gameState?.player?.inventory || []));
      localStorage.setItem("rpg_gameId", data.gameId);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to create dev game.");
    } finally {
      setLoading(false);
    }
  }

  async function saveGame(playAfterSave = false) {
    if (!gameState) return;
    setError("");
    try {
      setLoading(true);
      const updates = {
        player: {
          name: gameState.player?.name || "",
          faction: gameState.player?.faction || "hero",
          quirk: gameState.player?.quirk || "quirkless",
          hp: Number(gameState.player?.hp || 20),
          energy: Number(gameState.player?.energy || 20),
          inventory: parseInventory(inventoryText),
        },
        location: gameState.location || "beach",
        companionStatus: companionStatus,
      };

      const { data } = await api.patch(`/api/dev/game/${gameId.trim()}`, {
        password,
        updates,
      });
      setGameState(data.gameState);
      if (playAfterSave) {
        enterGame(gameId.trim(), { dmChoice: data?.gameState?.campaign?.dm });
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to save game.");
    } finally {
      setLoading(false);
    }
  }

  function playCurrentGame() {
    enterGame(gameId, { dmChoice: gameState?.campaign?.dm });
  }

  function updateCompanion(index, patch) {
    setGameState((prev) => {
      if (!prev) return prev;
      const next = [...(prev.companionStatus || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, companionStatus: next };
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="rounded-2xl border border-gray-700 bg-panel p-6 shadow-glow sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-300">Developer Mode</h1>
          <Link to="/create" className="text-sm text-indigo-300 hover:text-indigo-200">
            Back to Game
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-300">Developer Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter dev password"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={verifyPassword}
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-60"
            >
              Verify Access
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-300">Existing Game ID (optional)</label>
            <input
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              placeholder="game_xxx"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-3">
          <button
            onClick={createGame}
            disabled={loading || !verified}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60"
          >
            Create New Dev Game
          </button>
          <button
            onClick={loadGame}
            disabled={loading || !verified}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm hover:border-indigo-400 disabled:opacity-60"
          >
            Load Game
          </button>
          <button
            onClick={() => saveGame(false)}
            disabled={loading || !gameState}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            Save Changes
          </button>
          <button
            onClick={() => saveGame(true)}
            disabled={loading || !gameState || !gameId.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-60"
          >
            Save + Play
          </button>
          <button
            onClick={playCurrentGame}
            disabled={loading || !gameState || !gameId.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60"
          >
            Play This Game
          </button>
        </div>

        {error && <p className="mt-3 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/60 p-3">
          <p className="mb-2 text-xs font-semibold text-indigo-300">New Dev Game Setup</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-300">Player Name</label>
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Drakina"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-300">Starting Faction</label>
              <select
                value={newFaction}
                onChange={(e) => setNewFaction(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2"
              >
                <option value="hero">hero</option>
                <option value="villain">villain</option>
                <option value="civilian">civilian</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-300">Dungeon Master</label>
              <select
                value={newDmChoice}
                onChange={(e) => setNewDmChoice(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2"
              >
                <option value="aizawa">aizawa</option>
                <option value="iida">iida</option>
                <option value="bakugo">bakugo</option>
                <option value="midoriya">midoriya</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-300">Starting Quirk</label>
              <select
                value={newQuirk}
                onChange={(e) => setNewQuirk(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2"
              >
                <option value="hardening">hardening</option>
                <option value="half_cold_half_hot">half_cold_half_hot</option>
                <option value="fiber_master">fiber_master</option>
                <option value="quirkless">quirkless</option>
              </select>
            </div>
          </div>
        </div>

        {gameState && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">Player Name</label>
                <input
                  value={gameState.player?.name || ""}
                  onChange={(e) =>
                    setGameState((prev) => ({ ...prev, player: { ...prev.player, name: e.target.value } }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">Player Faction</label>
                <select
                  value={gameState.player?.faction || "hero"}
                  onChange={(e) =>
                    setGameState((prev) => ({ ...prev, player: { ...prev.player, faction: e.target.value } }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                >
                  <option value="hero">hero</option>
                  <option value="villain">villain</option>
                  <option value="civilian">civilian</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">Player Quirk</label>
                <select
                  value={gameState.player?.quirk || "quirkless"}
                  onChange={(e) =>
                    setGameState((prev) => ({ ...prev, player: { ...prev.player, quirk: e.target.value } }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                >
                  <option value="hardening">hardening</option>
                  <option value="half_cold_half_hot">half_cold_half_hot</option>
                  <option value="fiber_master">fiber_master</option>
                  <option value="quirkless">quirkless</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">HP (health points)</label>
                <input
                  type="number"
                  value={gameState.player?.hp ?? 20}
                  onChange={(e) =>
                    setGameState((prev) => ({ ...prev, player: { ...prev.player, hp: Number(e.target.value) } }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">Energy</label>
                <input
                  type="number"
                  value={gameState.player?.energy ?? 20}
                  onChange={(e) =>
                    setGameState((prev) => ({ ...prev, player: { ...prev.player, energy: Number(e.target.value) } }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-300">Location Label</label>
                <input
                  value={gameState.location || ""}
                  onChange={(e) => setGameState((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                />
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-indigo-300">Inventory (comma or newline separated)</h2>
              <textarea
                rows={4}
                value={inventoryText}
                onChange={(e) => setInventoryText(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              />
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-indigo-300">Companion Trust/Treatment/Status</h2>
              <div className="space-y-3">
                {companionStatus.map((c, idx) => (
                  <div key={`${c.name}-${idx}`} className="grid gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 sm:grid-cols-6">
                    <input
                      value={c.name || ""}
                      onChange={(e) => updateCompanion(idx, { name: e.target.value })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="Name"
                    />
                    <input
                      type="number"
                      value={c.trust ?? 50}
                      onChange={(e) => updateCompanion(idx, { trust: Number(e.target.value) })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="Trust"
                    />
                    <input
                      type="number"
                      value={c.hp ?? 20}
                      onChange={(e) => updateCompanion(idx, { hp: Number(e.target.value) })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="HP"
                    />
                    <input
                      type="number"
                      value={c.energy ?? 20}
                      onChange={(e) => updateCompanion(idx, { energy: Number(e.target.value) })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="Energy"
                    />
                    <input
                      value={c.treatment || ""}
                      onChange={(e) => updateCompanion(idx, { treatment: e.target.value })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="Treatment"
                    />
                    <input
                      value={c.status || ""}
                      onChange={(e) => updateCompanion(idx, { status: e.target.value })}
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1"
                      placeholder="Status"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
