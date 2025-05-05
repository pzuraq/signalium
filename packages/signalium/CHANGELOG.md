# signalium

## 1.0.1

### Patch Changes

- 2d4db91: Bind run functions to promise instances so they can be destructured

## 1.0.0

### Major Changes

- 069c458: Finalize API and release v1

  Breaking changes:

  - `reactive` replaces `computed` and `asyncComputed`
  - Async has been unified around the ReactivePromise interface
  - Simplified the forking behavior of contexts
  - `subscription` now returns a subscription instance, not a factory function
  - `task` now returns a ReactiveTask instance, not a factory function
  - `ContextProvider` receives an array of context/value tuples, rather than a map

## 0.3.8

### Patch Changes

- e1101e6: Fix initialization location in React

## 0.3.7

### Patch Changes

- 4880c2c: Fix React integration with useSyncExternalStore

## 0.3.6

### Patch Changes

- 6248ad2: Fix Signals in tasks

## 0.3.5

### Patch Changes

- 1a28be9: Fix top-level bundling in legacy

## 0.3.4

### Patch Changes

- 5b5d6ea: Expose all types

## 0.3.3

### Patch Changes

- 0d75a20: Export async-task and fix types/refactor internals

## 0.3.2

### Patch Changes

- 17509b6: Add runtime task parameters

## 0.3.1

### Patch Changes

- aaa102b: Fix useContext outside of signals

## 0.3.0

### Minor Changes

- ca2c0f2: Add docs, tests, and deployment. Finalize public API, add some polish.

## 0.2.8

### Patch Changes

- 344b6cb: Add immediate option to watcher

## 0.2.7

### Patch Changes

- 2d6a0b6: Add CommonJS build for legacy interop

## 0.2.6

### Patch Changes

- 1bc41a1: Add config functions to public API

## 0.2.5

### Patch Changes

- 4ee723a: Add main entry to package.json

## 0.2.4

### Patch Changes

- c2af4d0: Refactor scheduling, add batching for React Native

## 0.2.3

### Patch Changes

- 0ba50a0: Remove linked-lists for deps and subs

## 0.2.2

### Patch Changes

- 0376187: Fix a circular ref and add logs to detect circular refs in dev

## 0.2.1

### Patch Changes

- e8aa91a: Fix async init values

## 0.2.0

### Minor Changes

- 4696d06: Refactor await and invalidate to make them more composable

## 0.1.1

### Patch Changes

- 033a814: Add await and invalidate to async signals

## 0.1.0

### Minor Changes

- 03b2d2b: Initial release

### Patch Changes

- a472569: Fix release and build, add linting
