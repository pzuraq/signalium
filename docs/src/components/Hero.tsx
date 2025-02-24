import { Fragment, useEffect, useRef } from 'react';
import Image from 'next/image';

import { Button } from '@/components/Button';
import blurCyanImage from '@/images/blur-cyan.png';
import blurIndigoImage from '@/images/blur-indigo.png';
import { HooksVisualizer } from './HooksVisualizer';

export function Hero() {
  return (
    <div className="mt-[-6.5rem] overflow-hidden bg-primary-950 pt-[6.5rem]">
      <div className="pb-8 sm:px-2 lg:relative lg:px-0">
        <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-x-8 gap-y-8 px-4 pb-10 md:grid-cols-2 lg:min-h-[calc(100vh-10rem)] lg:max-w-8xl lg:gap-x-12 lg:px-8 xl:grid-cols-[2fr_3fr] xl:gap-x-16 xl:px-12">
          <div className="order-0 text-center md:hidden">
            <p className="bg-linear-to-r from-pink-200 via-purple-300/80 to-violet-200 bg-clip-text pt-2 font-display text-[28px] tracking-tight text-transparent md:text-5xl">
              Reactivity. <br className="hidden md:block" /> Beyond React.
            </p>
            <p className="mt-1 text-base leading-snug tracking-tight text-secondary-300 md:text-2xl">
              Functional, performant, signal-based hooks
            </p>
          </div>
          <div className="relative z-10 order-2 flex items-center justify-center max-md:min-h-screen md:order-0">
            <Image
              className="absolute right-full bottom-full -mr-72 -mb-56 opacity-50"
              src={blurCyanImage}
              alt=""
              width={530}
              height={530}
              unoptimized
              priority
            />

            <div className="relative">
              <p className="inline bg-linear-to-r from-pink-200 via-purple-300/80 to-violet-200 bg-clip-text font-display text-[28px] tracking-tight text-transparent max-md:hidden md:text-5xl">
                Reactivity. <br className="hidden md:block" /> Beyond React.
              </p>
              <p className="mt-3 text-lg leading-snug tracking-tight text-secondary-300 max-md:hidden md:text-2xl">
                Functional, performant, signal-based hooks
              </p>
              <div className="max-w-xl py-8 text-left md:py-8">
                <p className="pb-4 md:pb-6">
                  In 2018, React revolutionized the frontend world with Hooks,
                  fundamentally shifting how we approached functional
                  reactivity.
                </p>

                <p className="pb-4 md:pb-6">
                  However, time has revealed some significant problems. Endless
                  dependency lists, performance issues, and complex side-effects
                  plague applications at scale, with even the most disciplined
                  developers struggling to avoid common pitfalls.
                </p>

                <p className="pb-4 md:pb-6">What if there was an easier way?</p>
                <p>
                  With <strong>Signalium</strong>, you get the ergonomics of
                  Hooks without the complexity. And it works everywhere.
                </p>
              </div>
              <div className="flex justify-center gap-4 lg:justify-start">
                <Button href="/introduction">Get started</Button>
                <Button
                  href="https://github.com/pzuraq/signalium"
                  variant="secondary"
                >
                  View on GitHub
                </Button>
              </div>
            </div>
          </div>
          <div className="relative grid grid-cols-1 items-start gap-x-8 gap-y-8 max-md:-my-2 max-md:scale-95 max-md:transform lg:static xl:gap-x-16">
            <Image
              className="absolute -top-64 -right-64"
              src={blurCyanImage}
              alt=""
              width={530}
              height={530}
              unoptimized
              priority
            />
            <Image
              className="absolute -right-44 bottom-0"
              src={blurIndigoImage}
              alt=""
              width={567}
              height={567}
              unoptimized
              priority
            />

            <HooksVisualizer
              reactHooks={true}
              showParams={false}
              showValue={false}
              showCode="tab"
              initialized={true}
              interactive={false}
              showGradients={true}
              source={`
                const useCounter = (ms) => {
                  const [count, setCount] = useState(0);

                  useEffect(() => {
                    const id = setInterval(() => {
                      setCount((count) => count + 1);
                    }, ms);

                    return () => clearInterval(id);
                  }, [ms]);

                  return count;
                };

                const useDivide = (value, divideBy) => value / divideBy;

                const useFloor = (value) => Math.floor(value);

                const useQuotient = (value, divideBy) =>
                  useFloor(useDivide(value, divideBy));

                const useFloorCounter = () => useQuotient(useCounter(5000), 3);

                let renderCount = 0;
                export default function Component() {
                  const value = useFloorCounter();

                  return (
                    <div className="flex flex-col px-4 md:py-12 text-center md:text-lg">
                      <p className="text-xl md:text-2xl">Standard hooks count: {value}.</p>
                      <p>Rendered {++renderCount} times.</p>
                    </div>
                  )
                }
              `}
            />

            <HooksVisualizer
              showParams={false}
              showValue={false}
              showCode="tab"
              initialized={true}
              interactive={false}
              showGradients={true}
              source={`
                const useCounter = subscription((state, ms) => {
                  const id = setInterval(() => state.set(state.get() + 1), ms)

                  return () => clearInterval(id)
                }, { initValue: 0 });

                const useDivide = computed((value, divideBy) =>
                  value / divideBy
                );

                const useFloor = computed((value) => Math.floor(value));

                const useQuotient = computed((value, divideBy) =>
                  useFloor(useDivide(value, divideBy))
                );

                const useFloorCounter = computed(() =>
                  useQuotient(useCounter(5000), 3)
                );

                let renderCount = 0;
                export default function Component() {
                  const value = useFloorCounter();

                  return (
                    <div className="flex flex-col px-4 md:py-12 text-center md:text-lg">
                      <p className="text-xl md:text-2xl">Signal hooks count: {value}.</p>
                      <p>Rendered {++renderCount} times.</p>
                    </div>
                  )
                }
              `}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
