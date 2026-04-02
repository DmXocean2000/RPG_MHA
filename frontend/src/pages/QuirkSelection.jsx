import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const QUIRK_OPTIONS = [
  {
    id: "hardening",
    name: "Hardening",
    owner: "Kirishima",
    description: "Hardens your skin into a rock-like armor, making you durable against physical threats.",
    benefits: [
      "Greatly reduces injury from attacks, falls, wildlife, and hazards",
      "Can break through obstacles or protect allies",
      "Excellent front-line combat durability",
    ],
    downsides: [
      "Reduced speed and agility while active",
      "Stamina drain with prolonged use",
      "Poor fine motor control while hardened",
    ],
    imageUrl:
      "https://i.redd.it/how-powerful-durable-would-muscular-be-if-afo-successfully-v0-wh0np9ynv32g1.jpg?width=2400&format=pjpg&auto=webp&s=21b3767bc587638042a6805f28698717fef2f7f6",
  },
  {
    id: "half_cold_half_hot",
    name: "Half-Cold Half-Hot",
    owner: "Todoroki",
    description: "Control ice with one side and fire with the other for versatile elemental utility.",
    benefits: [
      "Fire supports heat, cooking, signaling, and defense",
      "Ice supports water creation, preservation, cooling, and control",
      "Strong two-element problem solving in varied situations",
    ],
    downsides: [
      "High friendly-fire risk under pressure",
      "Requires control or you can endanger teammates",
      "Overusing one side risks self-injury and environmental damage",
    ],
    imageUrl:
      "https://static.wikia.nocookie.net/bokunoheroacademia/images/1/13/Half-Cold_Half-Hot.png/revision/latest/scale-to-width-down/1200?cb=20250627024855",
  },
  {
    id: "fiber_master",
    name: "Fiber Master",
    owner: "Best Jeanist",
    description: "Manipulate fabric and fibers into tools, restraints, and survival constructs.",
    benefits: [
      "Efficiently craft rope, nets, shelters, and bandages",
      "Repair and reinforce gear and clothing",
      "Create traps and restraints from available fibers",
    ],
    downsides: [
      "Needs existing fiber materials nearby",
      "Concentration-heavy and error-prone under stress",
      "Can be physically draining over long use",
    ],
    imageUrl:
      "https://static.wikia.nocookie.net/bokunoheroacademia/images/2/26/Fiber_Master.png/revision/latest?cb=20250715033540",
  },
  {
    id: "quirkless",
    name: "Quirkless",
    owner: "",
    description: "No superhuman ability. You rely purely on skill, planning, and determination.",
    benefits: ["None"],
    downsides: ["None"],
    imageUrl:
      "https://static.wikia.nocookie.net/megamitensei/images/6/60/P5R_Makoto.png/revision/latest?cb=20190816155833",
  },
];

export default function QuirkSelectionPage() {
  const navigate = useNavigate();
  const [selectedQuirk, setSelectedQuirk] = useState(localStorage.getItem("rpg_selectedQuirk") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const characterId = localStorage.getItem("rpg_characterId");
  const selected = useMemo(() => QUIRK_OPTIONS.find((q) => q.id === selectedQuirk) || null, [selectedQuirk]);

  async function handleContinue() {
    setError("");

    if (!characterId) {
      setError("No character found. Please create one first.");
      return;
    }
    if (!selectedQuirk) {
      setError("Select a quirk to continue.");
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.patch(`/api/character/${characterId}/quirk`, { quirk: selectedQuirk });
      localStorage.setItem("rpg_selectedQuirk", selectedQuirk);
      localStorage.setItem("rpg_character", JSON.stringify(data.character));
      navigate("/campaign");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to save quirk selection.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10">
      <section className="rounded-2xl border border-gray-700 bg-panel p-6 shadow-glow sm:p-8">
        <h1 className="text-2xl font-bold text-indigo-300">Quirk Selection</h1>
        <p className="mt-2 text-sm text-gray-400">Choose your player quirk before selecting your Dungeon Master.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {QUIRK_OPTIONS.map((quirk) => (
            <button
              key={quirk.id}
              onClick={() => setSelectedQuirk(quirk.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selectedQuirk === quirk.id
                  ? "border-indigo-500 bg-indigo-500/20"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500"
              }`}
            >
              <img
                src={quirk.imageUrl}
                alt={quirk.name}
                className={`mb-3 h-44 w-full rounded-lg border border-gray-700 bg-gray-900 ${
                  quirk.id === "quirkless" ? "object-contain p-2" : "object-cover"
                }`}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <p className="text-lg font-semibold text-gray-100">{quirk.name}</p>
              {quirk.owner && <p className="text-xs text-indigo-300">{quirk.owner}</p>}
              <p className="mt-2 text-sm text-gray-300">{quirk.description}</p>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Benefits</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-200">
                  {quirk.benefits.map((item) => (
                    <li key={`${quirk.id}-benefit-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Downsides</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-200">
                  {quirk.downsides.map((item) => (
                    <li key={`${quirk.id}-downside-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <p className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
            Selected quirk: <span className="font-semibold">{selected.name}</span>
          </p>
        )}

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate("/create")}
            className="rounded-lg border border-gray-600 bg-gray-800 px-5 py-3 font-semibold text-gray-200 transition hover:border-indigo-300 hover:text-white"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Continue to DM Selection"}
          </button>
        </div>
      </section>
    </main>
  );
}
