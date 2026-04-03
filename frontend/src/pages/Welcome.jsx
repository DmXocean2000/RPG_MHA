import { Link } from "react-router-dom";

export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-indigo-700/40 bg-panel p-6 shadow-glow sm:p-8">
        <h1 className="text-3xl font-bold text-indigo-300">Welcome to MHA D&D Island RPG</h1>
        <p className="mt-3 text-gray-300">
          This is a Dungeons & Dragons inspired roleplaying adventure set in the My Hero Academia world.
          You create your character, choose your path, and make turn-by-turn decisions while iconic MHA
          companions react to your choices.
        </p>
        <p className="mt-3 text-gray-400">
          You do not need to memorize every rule. Think of it as collaborative storytelling with choices,
          risk, and consequences.
        </p>
        <p className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100">
          Transparency note: this experience is powered by AI using Grok for narration and turn outcomes.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            to="/create"
            className="rounded-lg bg-indigo-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-indigo-500"
          >
            Start Character Creation
          </Link>
          <Link
            to="/basics"
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center font-semibold text-gray-200 transition hover:border-gray-500"
          >
            Wait, I’ve Never Played D&D
          </Link>
        </div>
      </section>
    </main>
  );
}
