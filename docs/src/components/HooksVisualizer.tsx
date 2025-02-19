import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SignalScope, watcher } from 'signalium'
import {
  createTracerFromId,
  scheduleTracer,
  setTracing,
  Tracer,
  VisualizerNode,
} from 'signalium/debug'
import { setupSignaliumReact } from '@signalium/react'
import clsx from 'clsx'

const item = {
  visible: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 20 },
  hideAgain: { opacity: 0, y: -20 },
}

function TrafficLightsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 42 10" fill="none" {...props}>
      <circle cx="5" cy="5" r="4.5" />
      <circle cx="21" cy="5" r="4.5" />
      <circle cx="37" cy="5" r="4.5" />
    </svg>
  )
}

setTracing(true)
setupSignaliumReact()

export const VisualizerNodeComponent = ({ node }: { node: VisualizerNode }) => {
  useSyncExternalStore(
    (onStoreChange) => {
      return node.subscribe(() => onStoreChange())
    },
    () => node.version,
  )

  const [overrideFlasher, setOverrideFlasher] = useState(false)

  useEffect(() => {
    setOverrideFlasher(true)

    setTimeout(() => {
      setOverrideFlasher(false)
    }, 300)
  }, [node.params, node.value])

  const showFlasher = node.updating || overrideFlasher

  return (
    <motion.div
      variants={item}
      initial="hidden"
      animate="visible"
      exit="hideAgain"
      layout="position"
      transition={{ duration: 1 }}
      className="grow-1 font-mono"
    >
      <div className="flex flex-row items-end justify-stretch gap-1 py-1 lg:gap-2 lg:px-4 lg:py-2">
        <AnimatePresence mode="sync" propagate={true}>
          {node.stateChildren.map((child) => (
            <VisualizerNodeComponent
              key={child.name ?? child.id}
              node={child}
            />
          ))}
          {node.children.map((child) => (
            <VisualizerNodeComponent
              key={child.node.name ?? child.node.id}
              node={child.node}
            />
          ))}
        </AnimatePresence>
      </div>
      <motion.div
        layout="position"
        transition={{ duration: 0.3 }}
        className="relative min-w-0 items-center overflow-hidden rounded-2xl bg-indigo-400/10 px-2 py-1 text-[0.7rem] font-medium text-indigo-400 ring-1 ring-indigo-400/30 ring-inset lg:rounded-3xl lg:px-4 lg:py-2 lg:text-xs"
      >
        <AnimatePresence>
          {showFlasher && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-blue-500 opacity-20"
            />
          )}
        </AnimatePresence>
        <span className="block min-w-fit whitespace-nowrap lg:pr-4">
          {node.name ?? node.id}
        </span>

        {node.showParams && node.params && (
          <div className="relative hidden py-1.5 lg:block">
            <span className="absolute top-0 left-0 w-full overflow-hidden text-[0.85em] leading-[1.25] text-ellipsis whitespace-nowrap">
              args:&nbsp;{node.params}
            </span>
          </div>
        )}

        {node.showValue && (
          <div className="relative hidden py-1.5 lg:block">
            <span className="whitespace-nowraps absolute top-0 left-0 w-full overflow-hidden text-[0.85em] leading-[1.25] text-ellipsis">
              val:&nbsp;{String(node.value)}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

type WatcherProxy = {
  run?: () => void
  unsub?: () => void
}

type createWatcher = (
  tracer: Tracer,
  fn: () => React.ReactNode,
  id: string,
  desc: string,
  scope: SignalScope,
) => WatcherProxy

const createSignalWatcher: createWatcher = (tracer, fn, id, desc, scope) => {
  const w = watcher(fn, {
    id,
    desc,
    scope,
  })

  const originalCheck = (w as any)._check

  ;(w as any)._check = function (...args: any[]) {
    const result = originalCheck.call(this, ...args)
    scheduleTracer(tracer)
    return result
  }

  const unsub = w.addListener(() => {}, { immediate: true })

  return {
    unsub,
  }
}

export function RootVisualizerNode({ tracer }: { tracer: Tracer }) {
  const [showFlasher, setShowFlasher] = useState(false)

  const rendered = useSyncExternalStore(
    (onStoreChange) => {
      const unsubTracer = tracer.addListener(() => {
        onStoreChange()
      })

      return () => {
        unsubTracer()
      }
    },
    () => tracer.rootNode.value as React.ReactNode,
  )

  useEffect(() => {
    setShowFlasher(true)

    setTimeout(() => {
      setShowFlasher(false)
    }, 300)
  }, [rendered])

  const tabs = [
    { name: 'Output', isActive: true },
    { name: 'Code', isActive: false },
  ]

  return (
    <div>
      {tracer.rootNode.children.map((child) => (
        <VisualizerNodeComponent
          key={child.node.name ?? child.node.id}
          node={child.node}
        />
      ))}
      <div className="relative lg:mt-2">
        <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-purple-300 via-purple-300/70 to-violet-300 opacity-10 blur-lg" />
        <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-purple-300 via-purple-300/70 to-violet-300 opacity-10" />
        <div className="relative overflow-hidden rounded-2xl bg-[#17143B]/80 ring-1 ring-white/10 backdrop-blur-sm">
          <AnimatePresence>
            {showFlasher && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 bg-blue-500 opacity-60"
              />
            )}
          </AnimatePresence>

          <div className="absolute -top-px right-11 left-20 h-px bg-linear-to-r from-purple-300/0 via-purple-300/70 to-purple-300/0" />
          <div className="absolute right-20 -bottom-px left-11 h-px bg-linear-to-r from-violet-400/0 via-violet-400 to-violet-400/0" />
          <div className="p-4">
            <div className="flex items-center space-x-2 text-xs">
              <div className="mr-4">
                <TrafficLightsIcon className="h-2.5 w-auto stroke-slate-500/30" />
              </div>
              {tabs.map((tab) => (
                <button
                  key={tab.name}
                  className={clsx(
                    'group flex h-6 rounded-full p-px',
                    tab.isActive
                      ? 'bg-linear-to-r from-purple-400/30 via-purple-400 to-purple-400/30 font-medium text-purple-300'
                      : 'text-slate-500 transition-all hover:cursor-pointer hover:bg-linear-to-r hover:from-purple-400/30 hover:via-purple-400 hover:to-purple-400/30 hover:text-purple-300',
                  )}
                >
                  <div
                    className={clsx(
                      'flex items-center rounded-full px-2.5',
                      tab.isActive
                        ? 'bg-slate-800'
                        : 'group-hover:bg-slate-800',
                    )}
                  >
                    {tab.name}
                  </div>
                </button>
              ))}
            </div>
            {rendered}
          </div>
        </div>
      </div>
    </div>
  )
}

let WATCHER_ID = 0

export function HooksVisualizer({
  children,
  createWatcher = createSignalWatcher,
  showParams = true,
  showValue = true,
}: {
  children: () => React.ReactNode
  createWatcher?: createWatcher
  showParams?: boolean
  showValue?: boolean
}) {
  const ref = useRef<
    | {
        watcher: WatcherProxy
        tracer: Tracer
      }
    | undefined
  >(undefined)

  if (ref.current === undefined) {
    const scope = new SignalScope({})

    const id = `Output-${WATCHER_ID++}`

    const tracer = createTracerFromId(id)

    tracer.showParams = showParams
    tracer.showValue = showValue

    const w = createWatcher(tracer, children, id, 'Output', scope)

    ref.current = {
      watcher: w,
      tracer,
    }
  }

  ref.current!.watcher.run?.()

  useEffect(() => {
    return ref.current!.watcher.unsub
  })

  return <RootVisualizerNode tracer={ref.current!.tracer} />
}
