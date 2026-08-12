"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="surface max-w-md p-8 text-center">
            <h1 className="text-2xl font-semibold text-white">
              The workspace is unavailable.
            </h1>
            <button
              className="primary-button mt-6"
              onClick={reset}
              type="button"
            >
              Reload workspace
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
