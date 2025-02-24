---
title: Subscriptions and Watchers
nextjs:
  metadata:
    title: Subscriptions and Watchers
    description: Understanding reactive subscriptions and watchers in Signalium
---

We covered how Signalium handles symmetric (call-response) style operations in the last section, but what about _asymmetric async_?

And before we answer that, what even _is_ asymmetric async?

Asymmetric async refers to any async operation where you may send _one or more requests_ and receive _one or more responses_. Some common examples include:

- Subscribing to a topic on a message bus
- Sending messages back and forth between separate threads
- Adding a listener to an external library, like Tanstack Query
- Setting up a regular polling job or other interval based task

**Subscriptions** are a type of signal that specifically handles these sorts of operations. When combined with **Watchers**, they allow you to setup and manage the full lifecycle of long-live effects and resources.

---

## What are subscriptions?

The core idea for subscriptions comes from the observation that the following combination of hooks in React is a very common pattern:

```js
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
```

What we have here is an _effect_ paired with some _state_, and in such a way where that effect and _only_ that effect manages this state. To callers of `useCounter`, this is a completely opaque process. They just get the latest count, and they rerun when the count updates.

This is notable because it preserves functional purity for everything _outside_ of `useCounter`. While `useCounter` is managing and mutating state regularly, any hook calling it is just getting the latest value and using it to derive the result. It could be a static value _or_ a dynamic one, and the code would be the same.

Subscriptions formalize this pattern by combining a managed-effect with a slot for state that _by design_ is only accessible internally, within that effect. From the perspective of the rest of the dependency graph, however, that subscription node is just like any other computed or state, and functional purity is maintained.

### Creating subscriptions

Subscriptions are defined much like computeds, by decorating a top-level function definition.

```js {% visualize=true %}
import { subscription, computed, state } from 'signalium';

const speed = state(5);

const useCounter = subscription(
  (state) => {
    const id = setInterval(
      () => state.set(state.get() + 1),
      speed.get() * 1000,
    );

    return () => clearInterval(id);
  },
  { initValue: 0 },
);

const useInnerCounterWrapper = computed(() => {
  return useCounter();
});

export const useOuterCounterWrapper = computed(() => {
  return useInnerCounterWrapper();
});
```

The function receives a `state` object with `get` and `set` values, along with the arguments the subscription was passed if any. The function should setup a side-effect, and can optionally return a destructor function. Like with computeds, any reactive state that is used during this setup function will become a dependency of the subscription, and if that state updates, then the destructor function will be called and the subscription will be recreated with its new state.

### Fine-grained updates

Subscriptions can also return an object with the following signature:

```ts
interface SignalSubscription {
  update?(): void;
  unsubscribe?(): void;
}
```

This form of subscription is for cases where you may want more fine-grained control over how the subscription is updated. For instance, it might be fairly expensive to teardown a subscription and recreate it each time, and there might be a cheaper way to update it.

```js
const currentTopic = state('foo');

const useMessageBus = subscription((state) => {
  const id = bus.subscribe(currentTopic.get(), (msg) => state.set(msg));

  return {
    update() {
      bus.update(id, currentTopic.get());
    },

    unsubscribe() {
      bus.unsubscribe(id);
    },
  };
});
```

One thing to note about this form is that it tracks the initial construction function, then tracks the `update` function on each update. Tracking is based on the _last update_ only, so if you access something in subscribe but not in updates, it will not trigger again.

This covers the ways that subscriptions can update _reactively_ when in use. However, we also need to setup subscriptions when they are first accessed, and tear them down when they're no longer needed. For that, we need to introduce _watchers_.

## Watchers

With **watchers**, you listen to updates from signals _externally_. This is how signals are ultimately consumed by your framework of choice, and by your larger application.

```js
const value = state(0);

const plusOne = computed(() => {
  return value.get() + 1;
});

const w = watcher(() => {
  return plusOne();
});

const removeListener = w.addListener((val) => {
  console.log(val);
});
// logs 1 after timeout

value.set(5);
// logs 6 after timeout

removeListener();

value.set(10);
// no longer logs
```

Watchers are _typically_ handled by the framework integration that you are using. For instance, `@signalium/react` automatically detects if you are using a computed inside of another computed, or inside of a React component, and sets up a watcher if needed.

```jsx
const value = state(0);

const plusOne = computed(() => {
  return value.get() + 1;
});

const plusTwo = computed(() => {
  // plusOne() is called inside another computed,
  // does not setup a watcher
  return plusOne() + 1;
});

export function Component() {
  // plusTwo() is called inside a React component,
  // sets up a watcher and synchronizes it with React
  // state so it rerenders whenever the watcher updates.
  const valuePlusTwo = plusTwo();

  return <div>{valuePlusTwo}</div>;
}
```

In general, you shouldn't need to worry about managing watchers yourself because of this, but they are very important _conceptually_ which is why they are included in the core concepts. In addition, they'll be necessary if you ever _do_ need to create your own integration of some kind.

{% callout type="warning" title="Note" %}
Watchers should never be created or managed _inside_ computeds or subscriptions. They are meant to be _terminal nodes_ that pull on the graph of dependencies and make it live. Subscriptions can be nested, along with computeds, and generally work like "internal watchers" (i.e. they will also update automatically while they're live), so there should never be a reason to create a watcher inside of one.

This is a very strong recommendation; Any current behavior is considered undefined, and it is not guaranteed or covered under semver.
{% /callout %}

### Watcher scheduling

Watchers have to run at some point, but for performance and consistency they do _not_ run immediately after a change. Instead, they get scheduled to run later at some point. When exactly is globally configurable, but defaults to the next macro task (e.g. `setTimeout(flush, 0)`).

Scheduled watchers essentially act like if you manually ran a computed and read its value, only later. You can imagine it as something like this:

```js
const myComputed = computed(() => {
  // ...
}):

function handleClickEvent() {
  // change some state

  setTimeout(() => myComputed(), 0);
}
```

Only when we flush watchers, we do them together in the same task, and in a way that minimizes the number of scheduled tasks and any thrashing that might occur. And we automatically schedule them if they have any listeners, and if any value in the computed's dependency tree has changed.

That said, the call order for watchers is still from _changed state upward_, toward the watcher. This means that the watcher will only rerun if any of its direct dependencies have _also_ changed, following the same rules discussed in the [Computeds and State](/core/computeds-and-state#computeds-and-state) section. In addition, listeners added with `addListener` will not run if the value returned from the watcher itself has not updated.

### Timing, caching, and immediacy

On occasion, you might want to write to a state signal and then immediately read from a computed that consumed that signal. As noted in the previous section on computeds and state, this is perfectly valid and will work.

```js
const valueSignal = state(0);

const useDerived = computed(() => {
  return valueSignal.get() + 1;
});

function updateValue(value) {
  valueSignal.set(value);

  useDerived(); // value + 1
}
```

Watcher scheduling does not affect this behavior. Scheduled watchers do pull automatically at some point later, and if nothing else reads a modified computed, it _will_ run when the watcher flushes. BUT, if the value is read earlier, it will run on-demand and cache the result, which will then be read by the watcher. In effect, watchers act as a guarantee that the computeds will rerun automatically _eventually_, but if you need to speed that process up, you can at any time!

### An example integration

An example of how watchers can be used with a framework is the React integration itself.

```ts
export function useSignalValue<T>(fn: () => T): T {
  const [, setVersion] = useState(0);
  const scope = useContext(ScopeContext);
  const ref = useRef<{
    value: T | undefined;
    unsub: (() => void) | undefined;
    initialized: boolean;
  }>({
    value: undefined,
    unsub: undefined,
    initialized: false,
  });

  if (!ref.current.initialized) {
    const w = watcher(fn, { scope: scope });

    ref.current.unsub = w.addListener(
      (value) => {
        ref.current.value = value;

        // Trigger an update to the component
        if (ref.current.initialized) {
          setVersion((v) => v + 1);
        }

        ref.current.initialized = true;
      },
      {
        immediate: true,
      },
    );
  }

  useEffect(() => ref.current.unsub, []);

  return ref.current.value!;
}
```

Breaking this down:

- `fn` is the function to watch. It presumably accesses a signal at some point, which will then entangle with the watcher.
- `scope` is the current signal scope, which is where we store the memoized instances of each computed (memoization described in the [section on computeds](/core/computeds-and-state#basic-computeds)). This defaults to a global root scope if none is provided.
- We use a ref to store the watcher instance, because only one needs to exist and we want to manage it manually
- We also use the `immediate` option to run the listener for this watcher sychronously when it is first added. This activates the watcher and any subscriptions, then gets the latest value, which lets us return get the most up-to-date value on the first render. In many instances you can wait for the watcher to bootstrap separately later on, but this helps us avoid multiple render passes in React.
- We call `useEffect` just to add the unsubscribe function here. If we didn't need to run immediately, the watcher could have been setup inside effect itself, but for now we just need it to run the destructor when its removed.
- Lastly, we use an incrementing `useState` to notify when the watcher does update.

This is a fairly complex integration with a lot of nuanced details re: timing. The good thing, however, is that you don't generally need to worry about these details that often, you can either use an existing integration or write one once and use it everywhere.

Now that we understand watchers, let's move onto _liveness_ and how it interacts with watchers and subscriptions.

## Active Watchers and Subscriptions

By default, without introducing watchers, subscriptions are _inert_. If you access a subscription it will not subscribe and start updating, it will just return its current value.

```js
import { subscription, computed, state } from 'signalium';

const useSub = subscription(
  () => {
    console.log('subscribed');

    return () => console.log('unsubscribed');
  },
  { initValue: 0 },
);

useCounter(); // logs nothing, returns 0
```

This value will still be tracked by any computeds that use it, but it will never activate. The reason for this comes down to _resource management_ - that is to say, we want to only consume system resources when we need them, and we want to free them up when they're no longer needed.

With standard and even async computeds, this is not really an issue because they _mostly_ use memory, and that will _mostly_ naturally be cleaned up by garbage collection (ignoring promise lifecycle, abort signals, etc. for simplicity here). Most types of subscriptions, however, necessarily consume resources until they are _manually torn down_. Background threads, websockets, polling - all things that need some external signal that says they are no longer needed.

Watchers conceptually represent the parts of the app that are _active_, that is to say, are in use and consuming resources. These are the exit points where your signals are writing actively to _something_ external, and that something is what is driving the lifecycle of your signal graph.

This leads us to _active status_. Watchers become **active** when 1 or more event listeners are added to them. When a node (a state, computed, or subscription) is connected directly or indirectly to an active watcher, it also becomes active. It remains active until it is disconnected from _all_ active consumers, at which point it is said to be **inactive**. Essentially, if you're connected to a watcher, you are active, and if you're not then you're inactive.

And last but not least, a subscriptions _lifecycle_ is tied directly to whether or not its _active_. They run their setup upon activating, and run their unsubscribe function upon deactivating.

{% callout title="Additional Info" %}
This whole setup might seem a bit convoluted - why do we need to do this dance with watchers and subscriptions? Why not just expose an `unsubscribe` method on subscriptions and call that when they're no longer needed?

There are two main reasons for this. One is that this would leak some of the statefulness of subscriptions. Remember, one of the main benefits of subscriptions is that they are indistinguishable from standard values. If these implementation details were exposed, you would need to manage it, and drill that management deeply from your components through the computed graph to every place it was used.

The other is related, but more conceptual. It comes back to what we want to do here - activate subscriptions if they are in use, and deactivate them if they are no longer needed. "In use" is doing a lot of the heavy lifting here, how do we determine that?

Signalium posits that a value is "in use" IFF it is connected to an active graph. This is important because the shape of that graph is _dynamic_ with signals, because we can [use values conditionally](/core/computeds-and-state#conditional-usage). So you might connect to a websocket initially in some part of a computed tree, but then disconnect on the next update.

This dynamism makes manual subscription management intractably hard. You would need to maintain references to all previous computeds that had subscriptions, track whether or not they were reused, and call the destructors if not, all manually, at every layer of computed. This would be a pervasive pattern and would quickly infect an entire codebase and add mountains of complexity. It doesn't help that subscription data sources tend to be _leaves_ that could be deeply nested in layers of computeds.

For all these reasons, subscription management and active status is considered a _core part_ of signal lifecycle in Signalium. You can't have subscriptions without active status, and you can't have asymmetric async without subscriptions.
{% /callout %}

## Summary

And that covers the last major types of signals in Signalium! To summarize:

- Subscriptions
  - Manage side-effects in a single, self-contained node with its own state
  - Implementation details are hidden, externally it works just like any other state
  - Primarily used for _asymmetric async_ (think UDP vs TCP).
  - Activate when _connected_ to an active watcher, and deactivate when _disconnected_ from all active watchers
- Watchers
  - Represent the active parts of the app
  - How state gets read from Signalium to external consumers
  - Schedules and "pulls" asynchronously
  - Activates when listener added with `addListener`

Now we just have one last core feature left: Contexts.
