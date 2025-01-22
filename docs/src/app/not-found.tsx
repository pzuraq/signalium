import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-2xl min-w-0 flex-auto px-4 py-16 lg:max-w-none lg:pr-0 lg:pl-8 xl:px-16">
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="font-display text-sm font-medium text-white">404</p>
        <h1 className="mt-3 font-display text-3xl tracking-tight text-white">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Sorry, we couldn’t find the page you’re looking for.
        </p>
        <Link href="/" className="mt-8 text-sm font-medium text-white">
          Go back home
        </Link>
      </div>
    </div>
  );
}
