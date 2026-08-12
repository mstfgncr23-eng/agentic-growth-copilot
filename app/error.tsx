"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="surface max-w-md p-8 text-center">
        <p className="text-sm font-semibold text-rose-300">
          Unexpected application error
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          This view could not be loaded.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Your run state is stored separately and has not been discarded.
        </p>
        <button className="primary-button mt-6" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
