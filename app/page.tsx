import Link from "next/link";
import { ArrowRight, Orbit } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="surface w-full max-w-3xl p-8 sm:p-12">
        <div className="eyebrow">
          <Orbit aria-hidden="true" size={15} />
          Durable agent workspace
        </div>
        <h1 className="mt-7 max-w-2xl text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
          Turn growth questions into approved action plans.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
          Structured tools, visible execution, human approval, and resumable
          runs—without hiding the operational state behind a chat bubble.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="primary-button" href="/workspace">
            Open workspace
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="secondary-button" href="/internal/runs">
            View operations
          </Link>
        </div>
      </section>
    </main>
  );
}
