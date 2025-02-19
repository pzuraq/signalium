import { Fragment, useEffect, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { Highlight } from 'prism-react-renderer'

import { Button } from '@/components/Button'
import { HeroBackground } from '@/components/HeroBackground'
import blurCyanImage from '@/images/blur-cyan.png'
import blurIndigoImage from '@/images/blur-indigo.png'
import { FlashingDiv } from './FlashingDiv'
import { HooksVisualizer } from './HooksVisualizer'
import { computed, createState, subscription } from 'signalium'
import {
  useState,
  computedHook,
  createHookWatcher,
  subscriptionHook,
} from '@/lib/hooks-tracer'

const useCounter = subscription(
  function useCounter(state, ms: number) {
    const id = setInterval(() => {
      state.set(state.get() + 1)
    }, ms)

    return () => clearInterval(id)
  },
  {
    initValue: 0,
  },
)

const useDivide = computed(function useDivide(value: number, divideBy: number) {
  return value / divideBy
})

const useFloor = computed(function useFloor(value: number) {
  return Math.floor(value)
})

const useQuotient = computed(function useQuotient(
  value: number,
  divideBy: number,
) {
  return useFloor(useDivide(value, divideBy))
})

const useInnerCounter = computed(function useInnerCounter() {
  return useQuotient(useCounter(5000), 3)
})

const useWaterfall = computed(function useWaterfall() {
  return useInnerCounter()
})

////////////////////////////////////////////////////////////

const useCounter2 = subscriptionHook(function useCounter(ms: number) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setCount((count) => count + 1)
    }, ms)

    return () => clearInterval(id)
  }, [ms])

  return count
})

const useDivide2 = computedHook(function useDivide(
  value: number,
  divideBy: number,
) {
  return value / divideBy
})

const useFloor2 = computedHook(function useFloor(value: number) {
  return Math.floor(value)
})

const useQuotient2 = computedHook(function useQuotient(
  value: number,
  divideBy: number,
) {
  return useFloor2(useDivide2(value, divideBy))
})

const useInnerCounter2 = computedHook(function useInnerCounter() {
  return useQuotient2(useCounter2(5000), 3)
})

const useWaterfall2 = computedHook(function useWaterfall() {
  return useInnerCounter2()
})

export function Hero() {
  const hookRenderCount = useRef(0)
  const signalRenderCount = useRef(0)

  return (
    <div className="mt-[-6.5rem] -mb-32 overflow-x-hidden bg-indigo-950 pt-[6.5rem] pb-32">
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-x-8 gap-y-8 px-4 lg:max-w-8xl lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative z-10 flex items-center justify-center md:text-center lg:text-left">
            <Image
              className="absolute right-full bottom-full -mr-72 -mb-56 opacity-50"
              src={blurCyanImage}
              alt=""
              width={530}
              height={530}
              unoptimized
              priority
            />
            <div className="relative text-center">
              <p className="inline bg-linear-to-r from-pink-200 via-purple-300/80 to-violet-200 bg-clip-text font-display text-5xl tracking-tight text-transparent">
                Reactivity. Beyond React.
              </p>
              <p className="mt-3 text-2xl leading-8 tracking-tight text-purple-300">
                Functional, performant, signal-based hooks for the <br />
                browser, the server, and anywhere else you need it.
              </p>
              <div className="mt-8 flex gap-4 md:justify-center lg:justify-center">
                <Button href="/">Get started</Button>
                <Button href="/" variant="secondary">
                  View on GitHub
                </Button>
              </div>
            </div>
          </div>
          <div className="relative grid grid-cols-1 items-center gap-x-8 gap-y-8 md:grid-cols-2 lg:static xl:gap-x-16">
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
              className="absolute -right-44 -bottom-40"
              src={blurIndigoImage}
              alt=""
              width={567}
              height={567}
              unoptimized
              priority
            />

            <HooksVisualizer
              createWatcher={createHookWatcher}
              showParams={false}
              showValue={false}
            >
              {() => {
                hookRenderCount.current++

                // eslint-disable-next-line react-hooks/rules-of-hooks
                const value = useWaterfall2()

                return (
                  <div className="flex flex-col px-4 py-16 text-center text-lg">
                    <p className="text-2xl">Standard hooks count: {value}.</p>
                    <p>Rendered {hookRenderCount.current} times.</p>
                  </div>
                )
              }}
            </HooksVisualizer>

            <HooksVisualizer showParams={false} showValue={false}>
              {() => {
                console.log('signal render')
                signalRenderCount.current++

                // eslint-disable-next-line react-hooks/rules-of-hooks
                const value = useWaterfall()

                return (
                  <div className="flex flex-col px-4 py-16 text-center text-lg">
                    <p className="text-2xl">Signal hooks count: {value}.</p>
                    <p>Rendered {signalRenderCount.current} times.</p>
                  </div>
                )
              }}
            </HooksVisualizer>
          </div>
        </div>
      </div>
    </div>
  )
}
