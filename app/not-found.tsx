import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="surface max-w-md p-8 text-center">
        <p className="text-sm font-semibold text-emerald-300">404</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          This route does not exist.
        </h1>
        <Link className="secondary-button mt-6" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
