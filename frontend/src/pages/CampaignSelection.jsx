import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const DM_OPTIONS = {
  hero: [
    {
      id: "aizawa",
      name: "Aizawa",
      fullName: "Shota Aizawa",
      archetype: "The Tired Mentor",
      dmStyle: "Sarcastic, practical, and straight to the point.",
      description:
        "A seasoned combat instructor with a no-nonsense approach. Gruff but strategic, he expects you to think for yourself and keeps things efficient.",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/1888/7379/files/45SUuxh3_400x400_36722686-9da4-4cf0-8668-648a2a270ab8.jpg?v=1571937384",
    },
    {
      id: "iida",
      name: "Iida",
      fullName: "Tenya Iida",
      archetype: "The Rule-Obsessed Strategist",
      dmStyle: "By-the-book, detailed, and protocol-heavy.",
      description:
        "Formal and disciplined, he treats every mission like an official operation. He explains procedures in detail and emphasizes safety and teamwork.",
      imageUrl:
        "https://static.wikia.nocookie.net/bokunoheroacademia/images/e/ed/Tenya_reassures_Izuku.png/revision/latest?cb=20251013034039",
    },
    {
      id: "bakugo",
      name: "Bakugo",
      fullName: "Katsuki Bakugo",
      archetype: "The Aggressive Competitor",
      dmStyle: "Fast-paced, intense, and direct (clean language).",
      description:
        "An elite fighter with relentless energy and sharp tactics. He pushes the team hard, calls out weak plans, and keeps pressure high without profanity.",
      imageUrl:
        "https://preview.redd.it/why-is-anyone-bakugos-friend-v0-3gulxu634pne1.jpg?width=640&crop=smart&auto=webp&s=c73554b18cdcf4c535e93d50c5a364bc486d7527",
    },
    {
      id: "midoriya",
      name: "Midoriya",
      fullName: "Izuku Midoriya",
      archetype: "The Analytical Overthinker",
      dmStyle: "Thorough, encouraging, and analytical.",
      description:
        "A tactical thinker who carefully breaks down each scenario. He explains why things work, supports clever ideas, and helps players improve.",
      imageUrl:
        "https://a1cf74336522e87f135f-2f21ace9a6cf0052456644b80fa06d4f.ssl.cf2.rackcdn.com/images/characters/large/800/Midoriya-Izuku.My-Hero-Academia.webp",
    },
  ],
  // villain: [
  //   {
  //     id: "afo",
  //     name: "AFO",
  //     fullName: "All For One",
  //     archetype: "Mastermind",
  //     dmStyle: "Strategic and menacing.",
  //     description: "Calculating villain storyteller focused on long-term plans.",
  //     imageUrl: "",
  //   },
  //   {
  //     id: "shigaraki",
  //     name: "Shigaraki",
  //     fullName: "Tomura Shigaraki",
  //     archetype: "Chaos Engine",
  //     dmStyle: "Unpredictable and dangerous.",
  //     description: "Escalates tension quickly and rewards high-risk decisions.",
  //     imageUrl: "",
  //   },
  //   {
  //     id: "toga",
  //     name: "Toga",
  //     fullName: "Himiko Toga",
  //     archetype: "Wild Card",
  //     dmStyle: "Playful but unsettling.",
  //     description: "Unstable tone shifts with emotional and dramatic narration.",
  //     imageUrl: "",
  //   },
  //   {
  //     id: "twice",
  //     name: "Twice",
  //     fullName: "Jin Bubaigawara",
  //     archetype: "Conflicted Loyalist",
  //     dmStyle: "Erratic and dramatic.",
  //     description: "Balances humor, chaos, and team loyalty in villain scenes.",
  //     imageUrl: "",
  //   },
  // ],
};

function readStoredCharacter() {
  const raw = localStorage.getItem("rpg_character");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function initials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function CampaignSelectionPage() {
  const navigate = useNavigate();
  const [selectedDm, setSelectedDm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const characterId = localStorage.getItem("rpg_characterId");
  const character = readStoredCharacter();
  const selectedQuirk = localStorage.getItem("rpg_selectedQuirk") || character?.quirk || "";
  const options = DM_OPTIONS.hero;

  async function handleSelectCampaign() {
    setError("");

    if (!characterId) {
      setError("No character found. Please create one first.");
      return;
    }

    if (!selectedDm) {
      setError("Select a DM to continue.");
      return;
    }
    if (!selectedQuirk) {
      setError("Select your quirk first.");
      return;
    }

    const finalCampaign = "hero";

    try {
      setLoading(true);
      const { data } = await api.post("/api/campaign/select", {
        characterId,
        campaign: finalCampaign,
        dmChoice: selectedDm,
      });
      localStorage.setItem("rpg_gameId", data.gameId);
      navigate(`/game/${data.gameId}`, {
        state: { openingResponse: data.openingResponse, dmChoice: selectedDm },
      });
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to start campaign.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="rounded-2xl border border-gray-700 bg-panel p-6 shadow-glow sm:p-8">
        <h1 className="text-2xl font-bold text-indigo-300">Campaign Selection</h1>
        <p className="mt-2 text-sm text-gray-400">
          Choose your DM. The other 3 will be your companions for this mission.
        </p>
        {!selectedQuirk && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Quirk not selected yet. Go back and pick a quirk before starting.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {options.map((dm) => (
            <button
              key={dm.id}
              onClick={() => setSelectedDm(dm.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selectedDm === dm.id
                  ? "border-indigo-500 bg-indigo-500/20"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500"
              }`}
            >
              {dm.imageUrl ? (
                <img
                  src={dm.imageUrl}
                  alt={dm.fullName || dm.name}
                  className="mb-3 h-36 w-full rounded-lg border border-gray-700 bg-gray-900 object-contain p-1"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-xl font-bold text-indigo-200">
                  {initials(dm.name)}
                </div>
              )}

              <p className="font-semibold">{dm.name}</p>
              <p className="text-xs text-indigo-300">{dm.archetype}</p>
              <p className="mt-2 text-xs text-gray-300">{dm.description}</p>
              <p className="mt-2 text-xs text-gray-400">DM style: {dm.dmStyle}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/quirk")}
            className="rounded-lg border border-gray-600 bg-gray-800 px-5 py-3 font-semibold text-gray-200 transition hover:border-indigo-300 hover:text-white"
          >
            Back
          </button>
          <button
            onClick={handleSelectCampaign}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Starting..." : "Start Campaign"}
          </button>
        </div>
      </section>
    </main>
  );
}
