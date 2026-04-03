import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";

const FACTIONS = ["hero", "villain", "civilian"];
const PLACEHOLDER_BY_FACTION = {
  hero: "Enter your hero name",
  villain: "Enter your villain name",
  civilian: "Enter your civilian name",
};
const FACTION_DETAILS = {
  hero: {
    label: "Hero",
    overview: "Balanced start with steadier team trust and fewer social penalties.",
    pros: [
      "Higher starting trust with companions compared to villain.",
      "Companion tone is generally more cooperative and less hostile.",
      "Good all-around pick for stable teamwork and planning.",
    ],
    cons: [
      "No villain endurance bonus to reduce stamina loss.",
      "No villain resilience bonus to soften incoming damage.",
    ],
  },
  villain: {
    label: "Villain",
    overview: "Riskier social start, but tougher survival performance in hard turns.",
    pros: [
      "Endurance bonus reduces energy loss on costly actions.",
      "Resilience can reduce incoming player damage from negative outcomes.",
      "Companions are instructed to obey direct orders more often.",
    ],
    cons: [
      "Lower starting companion trust and colder reactions.",
      "More friction in dialogue and group dynamics early on.",
    ],
  },
  civilian: {
    label: "Civilian",
    overview: "Safer social tone with protective companions, but no combat-endurance perks.",
    pros: [
      "Companions start more protective and safety-focused.",
      "Solid trust baseline for cooperative survival play.",
      "Good for cautious, story-first decision making.",
    ],
    cons: [
      "No villain endurance or damage-mitigation bonuses.",
      "Less aggressive pressure tools than a villain-style run.",
    ],
  },
};

export default function CharacterCreationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [faction, setFaction] = useState("hero");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedFactionDetails = FACTION_DETAILS[faction];

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a player name.");
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.post("/api/character/create", {
        name: name.trim(),
        faction,
      });

      localStorage.setItem("rpg_character", JSON.stringify(data.character));
      localStorage.setItem("rpg_characterId", data.characterId);
      navigate("/quirk");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to create character.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-indigo-700/40 bg-panel p-6 shadow-glow sm:p-8">
        <h1 className="text-2xl font-bold text-indigo-300">Character Creation</h1>
        <p className="mt-2 text-sm text-gray-400">Forge your identity before the campaign begins.</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Link to="/" className="text-xs text-indigo-300 hover:text-indigo-200">
            Back to Welcome
          </Link>
          <Link to="/basics" className="text-xs text-indigo-300 hover:text-indigo-200">
            What is D&D?
          </Link>
          <Link to="/dev" className="text-xs text-indigo-300 hover:text-indigo-200">
            Developer Mode
          </Link>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-300">
              Player Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 outline-none transition focus:border-indigo-500"
              placeholder={PLACEHOLDER_BY_FACTION[faction]}
              maxLength={32}
            />
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-gray-300">Faction</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {FACTIONS.map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border px-3 py-3 text-center capitalize transition ${
                    faction === value
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-200"
                      : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  <input
                    type="radio"
                    value={value}
                    checked={faction === value}
                    onChange={() => setFaction(value)}
                    className="sr-only"
                  />
                  {value}
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/70 p-4">
              <p className="text-sm font-semibold text-indigo-200">
                {selectedFactionDetails.label} - Pros & Cons
              </p>
              <p className="mt-1 text-sm text-gray-300">{selectedFactionDetails.overview}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Pros</p>
                  <ul className="mt-1 space-y-1 text-sm text-gray-300">
                    {selectedFactionDetails.pros.map((pro) => (
                      <li key={pro}>+ {pro}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Cons</p>
                  <ul className="mt-1 space-y-1 text-sm text-gray-300">
                    {selectedFactionDetails.cons.map((con) => (
                      <li key={con}>- {con}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </fieldset>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Continue to Quirk Selection"}
          </button>
        </form>
      </section>
    </main>
  );
}
