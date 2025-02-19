import {
  scheduleTracer,
  Tracer,
  TRACER,
  TracerEventType,
  VisualizerNodeType,
} from 'signalium/debug'
import { stringifyArgs, watcher } from 'signalium'
import { useRef, useState as _useState, useEffect } from 'react'

let CURRENT_HOOK_ID: string | undefined
let STATE_COUNT: number | undefined

export function hook<T, Args extends unknown[]>(
  type: VisualizerNodeType,
  fn: (...args: Args) => T,
): (...args: Args) => T {
  return (...args: Args) => {
    const stringifiedArgs = stringifyArgs(args).slice(1, -1)
    const hookId = `${fn.name}(${stringifiedArgs})`
    const connectedId = useRef('')

    if (connectedId.current !== hookId) {
      connectedId.current = hookId
      TRACER?.emit({
        type: TracerEventType.Connected,
        id: CURRENT_HOOK_ID!,
        childId: hookId,
        nodeType: type,
        name: fn.name,
        params: stringifiedArgs,
      })
    }

    TRACER?.emit({
      type: TracerEventType.StartUpdate,
      id: hookId,
    })

    let PREV_HOOK_ID = CURRENT_HOOK_ID

    try {
      CURRENT_HOOK_ID = hookId

      const result = fn(...args)

      TRACER?.emit({
        type: TracerEventType.EndUpdate,
        id: hookId,
        value: result,
      })

      return result
    } finally {
      CURRENT_HOOK_ID = PREV_HOOK_ID
    }
  }
}

export const useState: typeof _useState = <T>(
  ...args: Parameters<typeof _useState<T>>
) => {
  const [state, _setState] = _useState<T>(...args)

  TRACER?.emit({
    type: TracerEventType.ConsumeState,
    id: CURRENT_HOOK_ID!,
    childId: `useState:${STATE_COUNT}`,
    value: state,
  })

  const setState = (value: T) => {
    _setState(value)
  }

  return [state, setState]
}

export const computedHook = <T, Args extends unknown[]>(
  fn: (...args: Args) => T,
): ((...args: Args) => T) => {
  return hook(VisualizerNodeType.Computed, fn)
}

export const asyncComputedHook = <T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
): ((...args: Args) => Promise<T>) => {
  return hook(VisualizerNodeType.AsyncComputed, fn)
}

export const subscriptionHook = <T, Args extends unknown[]>(
  fn: (...args: Args) => T,
): ((...args: Args) => T) => {
  return hook(VisualizerNodeType.Subscription, fn)
}

export const createHookWatcher = <T>(
  tracer: Tracer,
  fn: () => T,
  id: string,
  desc: string,
) => {
  const hookFn = () => {
    TRACER?.emit({
      type: TracerEventType.StartUpdate,
      id,
    })

    try {
      CURRENT_HOOK_ID = id
      STATE_COUNT = 0
      const result = fn()

      TRACER?.emit({
        type: TracerEventType.EndUpdate,
        id,
        value: result,
      })
    } finally {
      CURRENT_HOOK_ID = undefined
      STATE_COUNT = undefined
      scheduleTracer(tracer)
    }
  }

  return {
    run: () => {
      hookFn()
    },
  }
}
