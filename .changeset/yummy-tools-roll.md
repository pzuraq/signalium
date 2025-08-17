---
'signalium': major
---

Breaking API changes:

- `state` -> `signal`
- `useStateSignal` -> `useSignal`
- `Subscription` -> `Relay`
- All `ReactiveX` types are now `XSignal`, reflecting the fact that functions are reactive and values are signals

See https://github.com/pzuraq/signalium/issues/72 for more details
