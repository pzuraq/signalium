# Signalium

This library is an opinionated take on JavaScript Signals. It implements 4 key concepts:

- **Signals:** Root state values that can be reacted to
- **Reactive Functions:** Derived sync or async values based on root state
- **Relays:** Self-contained stateful values that create subscriptions when read, and destroy those subscriptions when no longer needed
- **Watchers:** External effects that watch the graph of signals and automatically pull on changes when they occur

These 4 concepts are all that is needed in order to manage all forms of reactive state in a modern web application in an efficient, intuitive manner. These concepts working together can be used to create state graphs which are _signal-pure_ - that is to say, they maintain the same properties as _pure functions_, so long as all _mutable state_ is contained within Signals.

> If a "pure" signal graph is given the same set of State signals, with the same values, it will always produce the same result

## Why Signals?

Signal-based applications have many similarities to functional programming paradigms and patterns. Side-effects are isolated and pushed toward the edges of the program, allowing developers to reason about systems without needing to worry about statefulness causing edge and corner cases. They also maintain a few advantages compared to functional frameworks:

- **Signals re-execute the minimal set of code required.** Signals don't require users to think about memoization or list dependencies. Instead, they wrap the reactive context up in a _monadic datastructure_ that contains everything necessary to read the updated state, react to it, and propagate any changes.
- **Signals are lazy by default.** Values are not evaluated unless they are used, and work is not done unless it is necessary. Propagation only happens if values actually changed, even intermediate values can stop propagating if the derived value did not update.
- **Signals manage resources based on usage.** With Relays, values are setup whenever they enter the signal graph and torn down when they are removed. This allows users to define sources within their state graph without needing to expose these details all the way up to the application lifecycle.
- **Signals are independent of frameworks and view layers.** Functional frameworks dominate JavaScript view layers, and provide composability similar to Signals. But data management solutions built on these frameworks become _deeply_ tied to the lifecycle of the view layer, which can be at odds with each other. Views need to rerender in order to manage lifecycle events, but query stores and services might run quietly in the background and react to a myriad of events - server responses, websocket messages, worker streams, and so on. Most data solutions, such as TanStack Query or Apollo-Client, use their own internal subscription-based systems which then require integration layers per-framework. Signals eliminate this need by allowing data libraries to build and expose their data with _reactive primitives_ that can be read directly by views, without needing integration.

Most importantly, writing Signals is _just like_ using plain JavaScript. You can write and use standard JS functions without any unusual paradigms. Functions don't need to be used with a special context, or pass around special getters or setters. Simply reading State values within any Computed will automatically link the two.

Just JavaScript. But Reactive.
