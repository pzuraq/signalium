---
'signalium': major
---

Finalize API and release v1

Breaking changes:

- `reactive` replaces `computed` and `asyncComputed`
- Async has been unified around the ReactivePromise interface
- Simplified the forking behavior of contexts
- `subscription` now returns a subscription instance, not a factory function
- `task` now returns a ReactiveTask instance, not a factory function
- `ContextProvider` receives an array of context/value tuples, rather than a map

