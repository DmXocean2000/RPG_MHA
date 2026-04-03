import { Link } from "react-router-dom";

const BASICS = [
  {
    title: "What is Dungeons & Dragons?",
    text: "D&D is a cooperative story game. You describe what your character tries to do, and the Dungeon Master narrates what happens next.",
  },
  {
    title: "What do I do in this game?",
    text: "Each turn, type your action. Example: scout the beach, build shelter, calm your companions, or attempt an escape plan.",
  },
  {
    title: "Why are there dice rolls?",
    text: "Risky actions may trigger a roll. High results usually mean better outcomes. Low results still move the story forward, just with complications.",
  },
  {
    title: "What are HP, Energy, and Trust?",
    text: "HP is health. Energy is stamina for actions. Trust reflects how companions react to your leadership and choices.",
  },
  {
    title: "How should I think about choices?",
    text: "Play to strengths, manage resources, and consider team dynamics. Smart planning can be better than brute force.",
  },
  {
    title: "Can I choose an Iconic Character as my DM?",
    text: "Yes! You can choose an Iconic Character as your DM, such as Katsuki Bakugo, This will give you a unique experience and a different perspective on the game.",
  },
  {
    title: "What is a DM?",
    text: "A DM is a Dungeon Master. They are the ones who run the game and make the outcomes of your actions. They also resolve arguments between you and your companions. They are the ones who will be your guide through the game.",
  },
  {
    title: "What is a faction?",
    text: "A faction is a group of characters that share a common goal. You can choose to be a hero, villain, or civilian. Each faction has its own unique abilities and abilities.",
  },
  {
    title: "What is a quirk?",
    text: "A quirk is a unique ability that your character has. Think of it like super powers. You can choose to be a quirkless character, or a character with a quirk. Each quirk has its own unique abilities and abilities.",
  },
  {
    title: "Can I do anything I want?",
    text: "Yes! You can do anything you want. The game is yours to shape. You can choose to be a hero, villain, civilian, or a quirkless character. You can choose to be a hero, villain, civilian, or a quirkless character. You can choose to be a hero, villain, civilian, or a quirkless character. You can also choose any actions you want, Your DM will handle the rest.",
  },
  {
    title: "Can I be DM?",
    text: "At the moment no, The beta testing of this we have Grok set up as the DM with a character you choose. IE bakugo, midoriya, etc. "
  }
];

export default function DnDBasicsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-indigo-700/40 bg-panel p-6 shadow-glow sm:p-8">
        <h1 className="text-3xl font-bold text-indigo-300">New to D&D? Start Here</h1>
        <p className="mt-3 text-gray-300">
          No worries. You can jump in with zero tabletop experience. This page covers the essentials so
          you can start playing right away.
        </p>

        <div className="mt-6 space-y-4">
          {BASICS.map((section) => (
            <article key={section.title} className="rounded-lg border border-gray-700 bg-gray-800/70 p-4">
              <h2 className="text-lg font-semibold text-indigo-200">{section.title}</h2>
              <p className="mt-1 text-sm text-gray-300">{section.text}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            to="/"
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center font-semibold text-gray-200 transition hover:border-gray-500"
          >
            Back to Welcome
          </Link>
          <Link
            to="/create"
            className="rounded-lg bg-indigo-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-indigo-500"
          >
            I’m Ready — Create Character
          </Link>
        </div>
      </section>
    </main>
  );
}
