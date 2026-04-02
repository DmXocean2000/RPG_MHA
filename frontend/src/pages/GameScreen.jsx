import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";

const QUICK_ACTIONS = ["Explore", "Hunt", "Build", "Rest"];
const FACTION_TITLE = {
  hero: "hero",
  villain: "villain",
  civilian: "civilian",
};
const CHARACTER_DISPLAY_NAMES = {
  dm: "DM",
  aizawa: "Aizawa",
  iida: "Iida",
  bakugo: "Bakugo",
  midoriya: "Midoriya",
  afo: "AFO",
  shigaraki: "Shigaraki",
  toga: "Toga",
  twice: "Twice",
  companion1: "Companion 1",
  companion2: "Companion 2",
  companion3: "Companion 3",
};
const SPEAKER_STYLES = {
  dm: "border-indigo-500/40 bg-indigo-500/10",
  aizawa: "border-zinc-500/40 bg-zinc-500/10",
  iida: "border-blue-500/40 bg-blue-500/10",
  bakugo: "border-orange-500/40 bg-orange-500/10",
  midoriya: "border-emerald-500/40 bg-emerald-500/10",
  afo: "border-purple-500/40 bg-purple-500/10",
  shigaraki: "border-red-500/40 bg-red-500/10",
  toga: "border-pink-500/40 bg-pink-500/10",
  twice: "border-cyan-500/40 bg-cyan-500/10",
  companion1: "border-emerald-500/40 bg-emerald-500/10",
  companion2: "border-amber-500/40 bg-amber-500/10",
  companion3: "border-rose-500/40 bg-rose-500/10",
};

function toDisplayName(rawName) {
  const key = String(rawName || "").toLowerCase().trim();
  if (!key) return "Companion";
  if (CHARACTER_DISPLAY_NAMES[key]) return CHARACTER_DISPLAY_NAMES[key];

  return key
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCompanions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const speaker = String(item.name || "companion").toLowerCase().trim();
      const text = typeof item.text === "string" ? item.text : "";
      return {
        speaker,
        name: toDisplayName(speaker),
        text: text || "...",
        kind: "companion",
      };
    });
}

function normalizeInventoryList(list) {
  if (!Array.isArray(list)) return [];
  const aggregate = new Map();
  for (const entry of list) {
    if (typeof entry === "string") {
      const name = entry.trim().toLowerCase();
      if (!name) continue;
      aggregate.set(name, (aggregate.get(name) || 0) + 1);
      continue;
    }
    if (entry && typeof entry === "object") {
      const name = String(entry.name || "").trim().toLowerCase();
      const quantity = Number(entry.quantity);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
      aggregate.set(name, (aggregate.get(name) || 0) + quantity);
    }
  }
  return Array.from(aggregate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => ({ name, quantity }));
}

function asMessageList(response, dmSpeaker = "dm") {
  const safeResponse = response && typeof response === "object" ? response : {};
  const dmNarration =
    typeof safeResponse.dm_narration === "string" && safeResponse.dm_narration.trim()
      ? safeResponse.dm_narration
      : "The DM pauses, watching what you will do next.";
  const companionsPre = normalizeCompanions(safeResponse.companions_pre);
  const companionsPost = normalizeCompanions(safeResponse.companions_post);
  const dmKey = String(dmSpeaker || "dm").toLowerCase().trim();

  const list = [
    { speaker: dmKey, name: `DM · ${toDisplayName(dmKey)}`, text: dmNarration, kind: "dm" },
    ...companionsPre,
  ];

  if (safeResponse.dice_roll && typeof safeResponse.dice_roll === "object") {
    const rollType = String(safeResponse.dice_roll.type || "check").toUpperCase();
    const dc = Number(safeResponse.dice_roll.dc);
    const result = Number(safeResponse.dice_roll.result);
    const hasNumbers = Number.isFinite(dc) && Number.isFinite(result);
    const success = hasNumbers ? result >= dc : null;

    list.push({
      speaker: "system",
      name: "Dice",
      text: hasNumbers
        ? `${rollType} check: ${result} vs DC ${dc} (${success ? "SUCCESS" : "FAILURE"})`
        : `${rollType} check resolved.`,
      kind: "system",
      tone: success === null ? "neutral" : success ? "success" : "failure",
    });
  }

  if (safeResponse.energy_change && typeof safeResponse.energy_change === "object") {
    const appliedDelta = Number(safeResponse.energy_change.appliedDelta ?? safeResponse.energy_change.delta ?? 0);
    const before = Number(safeResponse.energy_change.before);
    const after = Number(safeResponse.energy_change.after);
    const hasBounds = Number.isFinite(before) && Number.isFinite(after);
    const reason = typeof safeResponse.energy_change.reason === "string" ? safeResponse.energy_change.reason : "";
    const effort = typeof safeResponse.energy_change.effort === "string" ? safeResponse.energy_change.effort : "unknown";
    const trend = appliedDelta < 0 ? "spent" : appliedDelta > 0 ? "recovered" : "unchanged";
    const amount = Math.abs(appliedDelta);

    list.push({
      speaker: "system",
      name: "Energy",
      text: hasBounds
        ? `Energy ${trend}: ${amount} (${before} -> ${after}). Effort: ${effort}.${reason ? ` ${reason}` : ""}`
        : `Energy ${trend}: ${amount}. Effort: ${effort}.${reason ? ` ${reason}` : ""}`,
      kind: "system",
      tone: appliedDelta < 0 ? "failure" : appliedDelta > 0 ? "success" : "neutral",
    });
  }

  if (Array.isArray(safeResponse.health_changes) && safeResponse.health_changes.length > 0) {
    safeResponse.health_changes.forEach((change) => {
      const target = String(change?.target || "").toLowerCase();
      const who = target === "player" ? "You" : toDisplayName(change?.name || "Companion");
      const delta = Number(change?.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      const before = Number(change?.before);
      const after = Number(change?.after);
      const reason = typeof change?.reason === "string" ? change.reason : "";
      const direction = delta < 0 ? "lost" : "recovered";
      const amount = Math.abs(delta);
      const rangeText = Number.isFinite(before) && Number.isFinite(after) ? ` (${before} -> ${after})` : "";

      list.push({
        speaker: "system",
        name: "Health",
        text: `${who} ${direction} ${amount} HP${rangeText}.${reason ? ` ${reason}` : ""}`,
        kind: "system",
        tone: delta < 0 ? "failure" : "success",
      });
    });
  }

  if (Array.isArray(safeResponse.companion_energy_changes) && safeResponse.companion_energy_changes.length > 0) {
    safeResponse.companion_energy_changes.forEach((change) => {
      const name = toDisplayName(change?.name || "Companion");
      const delta = Number(change?.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      const before = Number(change?.before);
      const after = Number(change?.after);
      const reason = typeof change?.reason === "string" ? change.reason : "";
      const direction = delta < 0 ? "spent" : "recovered";
      const amount = Math.abs(delta);
      const rangeText = Number.isFinite(before) && Number.isFinite(after) ? ` (${before} -> ${after})` : "";

      list.push({
        speaker: "system",
        name: "Companion Energy",
        text: `${name} ${direction} ${amount} energy${rangeText}.${reason ? ` ${reason}` : ""}`,
        kind: "system",
        tone: delta < 0 ? "failure" : "success",
      });
    });
  }

  if (Array.isArray(safeResponse.item_changes) && safeResponse.item_changes.length > 0) {
    safeResponse.item_changes.forEach((change) => {
      const name = String(change?.name || "").trim() || "item";
      const delta = Number(change?.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      const before = Number(change?.before);
      const after = Number(change?.after);
      const reason = typeof change?.reason === "string" ? change.reason : "";
      const direction = delta > 0 ? "gained" : "used";
      const amount = Math.abs(delta);
      const amountText = `${amount} ${name}`;
      const rangeText = Number.isFinite(before) && Number.isFinite(after) ? ` (${before} -> ${after})` : "";
      list.push({
        speaker: "system",
        name: "Items",
        text: `${direction === "gained" ? "Gained" : "Used"} ${amountText}${rangeText}.${reason ? ` ${reason}` : ""}`,
        kind: "system",
        tone: delta > 0 ? "success" : "failure",
      });
    });
  }

  list.push(...companionsPost);
  return list;
}

function historyToMessages(turnHistory, dmSpeaker = "dm") {
  if (!Array.isArray(turnHistory)) return [];

  return turnHistory.flatMap((entry) => {
    const items = [];
    const action = typeof entry?.action === "string" ? entry.action.trim() : "";

    if (action && !action.startsWith("__")) {
      items.push({ speaker: "you", name: "You", text: action, kind: "player" });
    }

    items.push(...asMessageList(entry?.response, dmSpeaker));
    return items;
  });
}

function buildFallbackOpeningResponse(gameState) {
  const dm = gameState?.campaign?.dm || "dm";
  const faction = gameState?.player?.faction || "hero";
  const role = FACTION_TITLE[faction] || "adventurer";

  return {
    dm_narration: `The island air is heavy with salt and tension. ${toDisplayName(dm)} steps in as your Dungeon Master and sets the scene: you are stranded on a dangerous beach with three companions, limited gear, and no safe way out yet.\n\nAll eyes turn to you.\n\nNow it's your move, ${role}. What do you do?`,
    companions_pre: [],
    companions_post: [],
  };
}

function trustLabel(value) {
  if (value >= 75) return "High";
  if (value >= 50) return "Medium";
  return "Low";
}

function trustBarClass(value) {
  if (value >= 75) return "bg-emerald-500";
  if (value >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function vitalsBarClass(value) {
  if (value >= 14) return "bg-emerald-500";
  if (value >= 7) return "bg-amber-500";
  return "bg-rose-500";
}

export default function GameScreenPage() {
  const { gameId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [actionInput, setActionInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const chatContainerRef = useRef(null);

  useEffect(() => {
    const openingResponse = location?.state?.openingResponse;
    if (openingResponse) {
      const dmSpeaker = location?.state?.dmChoice || "dm";
      setMessages(asMessageList(openingResponse, dmSpeaker));
    }
  }, [location?.state?.openingResponse, location?.state?.dmChoice]);

  useEffect(() => {
    async function loadGame() {
      try {
        const { data } = await api.get(`/api/game/${gameId}`);
        setGameState(data.gameState);
        const historyMessages = historyToMessages(data.turnHistory, data?.gameState?.campaign?.dm);
        setMessages((prev) => {
          if (historyMessages.length > 0) return historyMessages;
          if (prev.length > 0) return prev;
          return asMessageList(buildFallbackOpeningResponse(data.gameState), data?.gameState?.campaign?.dm);
        });
      } catch {
        setError("Game not found. Start a campaign first.");
        setTimeout(() => navigate("/create"), 1200);
      }
    }
    loadGame();
  }, [gameId, navigate]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const inventory = useMemo(
    () => normalizeInventoryList(gameState?.player?.inventory || []),
    [gameState?.player?.inventory]
  );
  const companionStatus = useMemo(() => gameState?.companionStatus || [], [gameState?.companionStatus]);

  async function submitAction(actionText) {
    const action = actionText.trim();
    if (!action) return;
    setError("");

    try {
      setIsSubmitting(true);
      const { data } = await api.post(`/api/game/${gameId}/turn`, { action });
      setGameState(data.updatedState);
      setMessages((prev) => [
        ...prev,
        { speaker: "you", name: "You", text: action, kind: "player" },
        ...asMessageList(data.response, gameState?.campaign?.dm),
      ]);
      setActionInput("");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to send action.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-900 text-gray-100">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-panelLight/95 px-4 py-3 backdrop-blur">
        <div className="text-sm text-gray-300">
          <span className="font-semibold text-indigo-300">Location:</span> {gameState?.location || "beach"}
        </div>
        <div className="text-sm text-gray-300">Quirk: {gameState?.player?.quirk || "quirkless"}</div>
        <div className="text-sm text-gray-300">HP: {gameState?.player?.hp ?? 20}/20</div>
        <div className="text-sm text-gray-300">Energy: {gameState?.player?.energy ?? 20}/20</div>
        <div className="text-sm text-gray-300">🥥: {gameState?.coconuts ?? 0}</div>
        <button
          onClick={() => navigate("/create")}
          className="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:border-indigo-300 hover:text-white"
        >
          Restart Campaign
        </button>
        <button
          onClick={() => navigate("/dev", { state: { gameId } })}
          className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-indigo-100"
        >
          Developer Mode
        </button>
      </header>

      <button
        onClick={() => setIsSidebarOpen((v) => !v)}
        className="fixed right-3 top-24 z-40 rounded-lg border border-indigo-400/40 bg-gray-900/95 px-3 py-2 text-xs font-semibold text-indigo-200 shadow-glow backdrop-blur transition hover:border-indigo-300 hover:bg-gray-800"
      >
        {isSidebarOpen ? "Hide Panels" : "Show Panels"}
      </button>

      <section className={`flex min-h-0 flex-1 ${isSidebarOpen ? "lg:pr-80" : ""}`}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={chatContainerRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-700 bg-panel p-4 text-sm text-gray-400">
                The scene is quiet. Choose a quick action or type your own command.
              </div>
            )}

            {messages.map((message, index) => (
              <article
                key={`${message.name}-${index}`}
                className={`message-enter rounded-xl border p-3 ${
                  message.kind === "dm"
                    ? `${SPEAKER_STYLES[message.speaker] || "border-indigo-400/60 bg-indigo-500/15"} text-base`
                    : message.kind === "player"
                    ? "border-sky-500/50 bg-sky-500/10"
                    : message.kind === "system"
                    ? "border-slate-500/40 bg-slate-500/10 text-sm"
                    : SPEAKER_STYLES[message.speaker] || "border-gray-700 bg-panel"
                }`}
              >
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">{message.name}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed sm:text-base">{message.text}</p>
              </article>
            ))}
          </div>

          <div className="border-t border-gray-800 bg-panelLight px-4 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => submitAction(action)}
                  disabled={isSubmitting}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm transition hover:border-indigo-400 hover:bg-gray-700 disabled:opacity-60"
                >
                  {action}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitAction(actionInput);
              }}
            >
              <textarea
                value={actionInput}
                onChange={(event) => setActionInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitAction(actionInput);
                  }
                }}
                placeholder="Describe your action..."
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-w-[92px] items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Sending
                  </span>
                ) : (
                  "Send"
                )}
              </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </div>
        </div>

      </section>

      {isSidebarOpen && (
        <div className="fixed right-3 top-36 z-40 flex w-72 flex-col gap-3">
          <aside className="max-h-[36vh] overflow-y-auto rounded-xl border border-gray-700 bg-panelLight/95 p-4 shadow-glow backdrop-blur">
            <h3 className="mb-2 text-sm font-semibold text-indigo-300">Inventory</h3>
            {inventory.length === 0 ? (
              <p className="text-sm text-gray-300">No items yet.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-200">
                {inventory.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="rounded border border-gray-700 bg-gray-800 px-2 py-1">
                    {item.quantity}x {toDisplayName(item.name)}
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <aside className="max-h-[42vh] overflow-y-auto rounded-xl border border-gray-700 bg-panelLight/95 p-4 shadow-glow backdrop-blur">
            <h3 className="mb-2 text-sm font-semibold text-indigo-300">Companions</h3>
            {companionStatus.length === 0 ? (
              <p className="text-sm text-gray-300">No companion data yet.</p>
            ) : (
              <div className="space-y-3">
                {companionStatus.map((companion) => (
                  <article key={companion.name} className="rounded-lg border border-gray-700 bg-gray-800/80 p-3">
                    <p className="text-sm font-semibold text-gray-100">{companion.name}</p>
                    <p className="mt-1 text-xs text-gray-300">Status: {companion.status}</p>
                    <p className="text-xs text-gray-300">Treatment: {companion.treatment}</p>
                    <p className="mt-1 text-xs text-gray-300">HP: {companion.hp ?? 20}/20</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-700">
                      <div
                        className={`h-full ${vitalsBarClass(companion.hp ?? 20)}`}
                        style={{ width: `${Math.max(0, Math.min(100, ((companion.hp ?? 20) / 20) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-300">Energy: {companion.energy ?? 20}/20</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-700">
                      <div
                        className={`h-full ${vitalsBarClass(companion.energy ?? 20)}`}
                        style={{ width: `${Math.max(0, Math.min(100, ((companion.energy ?? 20) / 20) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-300">
                      Trust: {companion.trust}/100 ({trustLabel(companion.trust)})
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-700">
                      <div
                        className={`h-full ${trustBarClass(companion.trust)}`}
                        style={{ width: `${Math.max(0, Math.min(100, companion.trust || 0))}%` }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
