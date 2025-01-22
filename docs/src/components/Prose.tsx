import clsx from 'clsx';

export function Prose<T extends React.ElementType = 'div'>({
  as,
  className,
  ...props
}: React.ComponentPropsWithoutRef<T> & {
  as?: T;
}) {
  let Component = as ?? 'div';

  return (
    <Component
      className={clsx(
        className,
        'prose max-w-none text-slate-200 prose-slate dark:prose-invert',
        // headings
        'prose-headings:scroll-mt-28 prose-headings:font-display prose-headings:font-normal lg:prose-headings:scroll-mt-[8.5rem]',
        // lead
        'prose-lead:text-slate-300',
        // links
        'prose-a:font-semibold prose-a:text-secondary-300 prose-a:transition-all prose-a:hover:text-secondary-950',
        // link underline
        '[--tw-prose-background:var(--color-indigo-950)] prose-a:no-underline prose-a:shadow-[inset_0_calc(-1*var(--tw-prose-underline-size,2px))_0_0_var(--tw-prose-underline,var(--color-secondary-400))] prose-a:transition-all prose-a:hover:[--tw-prose-underline-size:1.5em]',
        // pre
        'prose-pre:rounded-xl prose-pre:border prose-pre:border-divider prose-pre:bg-primary-1000 prose-pre:shadow-none',
        // hr
        'prose-hr:border-primary-900',
      )}
      {...props}
    />
  );
}
