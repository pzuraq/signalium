---
title: Async Computeds and Tasks
nextjs:
  metadata:
    title: Async Computeds and Tasks
    description: Working with asynchronous computed values in Signalium
---

If JavaScript was a completely synchronous language, then we would be able to get away with _just_ normal computeds. But alas, we do need to handle all kinds of async tasks. Data fetching is the most common one, but there are others - waiting for animations to finish, waiting for the DOM to render, waiting for the operating system to finish a task, and so on.

Signalium provides a way to handle asynchronous operations out of the box with _async computeds_ and _tasks_.

## Async Computeds

To understand async computeds, the first thing to consider is: what does it mean to _react_ to a promise?

Promises are based on an _imperative_ mental model. "Do _this_, wait, _then_ do this." The imperative way of thinking about loading data would be something like:

1. Update the UI to show a loading spinner
2. Fetch the data and wait for it to return
3. Update the UI to hide the loading spinner and display the data

However, we want a _declarative_ way of representing this data, one that derives directly from our state. This way of thinking looks more like:

1. When we are loading data, show the loading spinner
2. When we have data, show the rendered data

The way Signalium handles this is by exposing the various states of promises as an `AsyncResult` object:

```ts
interface AsyncResult<T> {
  result: T | undefined;
  error: unknown;
  isPending: boolean;
  isReady: boolean;
  isError: boolean;
  isSuccess: boolean;
  didResolve: boolean;

  invalidate(): void;
  await(): T;
}
```

This is returned from async computeds, like so:

```js {% visualize=true %}
import { state, asyncComputed } from 'signalium';

let value = state(0);

const useLoader = asyncComputed(async () => {
  const v = value.get(0);
  await sleep(3000);

  return v;
});

export const useText = computed(() => {
  const { isPending, result } = useLoader();

  return isPending ? 'Loading...' : result;
});
```

The properties and flags represent the following states:

- `result`: The most recent result of the async computed. This will remain the latest result until the next successful rerun of the computed, allowing you to show the previous state while the next state is loading.
- `isPending`: True when the async computed is currently running (e.g. the promise has not yet resolved).
- `isReady`: True when the async computed has a value. Is always true if you pass an `initValue` in when creating the computed, and otherwise becomes true the first time it gets a value.
- `isError`: True when the async computed finished with an error.
- `isSuccess`: True when the async computed finished successfully.
- `didResolve`: True if the async computed has resolved at least _once_. This will not be true if the value was set via an `initValue` or if the operation was not async.

This mirrors popular libraries such as [TanStack Query](https://tanstack.com/query/latest), [SWR](https://github.com/vercel/swr), and [ember-concurrency](https://ember-concurrency.com/docs/introduction/) among many others. However, async computeds have some additional niceties.

### Awaiting results

You can _await_ results in async computeds by using the `.await()` method, like so:

```js {% visualize=true %}
let value = state(0);

const useInnerLoader = asyncComputed(async () => {
  const v = value.get();
  await sleep(3000);
  return v;
});

const useOuterLoader = asyncComputed(async () => {
  return useInnerLoader().await() + 1;
});

export const useText = computed(() => {
  const { isPending, result } = useOuterLoader();

  return isPending ? 'Loading...' : result;
});
```

Await unwraps the result and returns it, so it's guaranteed to have a value. The function stops execution at that point, and resumes it again once it's resolved.

When you await values like this, it also _stops propagation_ of changes until every async request has resolved. This allows your fetch to fully resolve _before_ notifying the view layer, meaning fewer rerenders and more performant behavior by default.

{% callout title="Additional Info" %}
This `result.await()` behavior is a bit weird! The way it works under the hood is that we _throw an exception_, which halts execution of the current function, and we then catch that and setup our async handlers. That may sound strange, but it's actually the way that [React Suspense works under the hood as well](https://github.com/facebook/react/blob/a84862dbdc8dada08a9d1df1c72144cd767704b6/packages/react-reconciler/src/ReactFiberThenable.js#L249)!

The key difference is that rather than re-executing the entire component up to the `Suspense` boundary, we only re-execute the _immediate_ async computed. In the near future, this means that we'll be able to switch to standard async/await syntax when [AsyncContext](https://github.com/tc39/proposal-async-context) lands, and we also won't have to worry about the tracking constraints mentioned in the next section any longer.
{% /callout %}

### Tracking constraints

Currently there is not a way to preserve a tracking context _across_ an async boundary. What that means is that when you run an async computed, it will only track values that are accessed _before_ the first `await` statement.

```js
// 🚫 Bad
const useFetch = asyncComputed(async () => {
  const res = await fetch(url.get());

  // This will not entangle, and useFetch will not
  // rerun when `format` updates.
  return process(data, format.get());
});

// ✅ Good
const useAsyncValue = asyncComputed(async () => {
  // This will work because `format` was accessed before
  // we awaited anything.
  const currentFormat = format.get();
  const res = await fetch(url.get());

  return process(data, currentformat);
});
```

This is also true of the `result.await()` helper, all results must be awaited _before_ the first real `await`. Other logic can happen in between, as long as its synchronous.

```js
// 🚫 Bad
const useAsyncValue = asyncComputed(async () => {
  const res = useFetch(url.get()).await();

  const json = await res.json();

  // This will not properly update when `useProcess` finishes because
  // it hasn't entangled and it's after the `await`
  const processed = useProcess(json).await();

  // ...
});

// ✅ Good
const useAsyncValue = asyncComputed(async () => {
  // Instead, have the `useFetch` hook parse the value and then return it
  // so that all async operations are wrapped in a computed
  const res = useFetch(url.get(), 'json').await();
  const processed = useProcess(json).await();

  // ...
});
```

As is mentioned above, these constraints will be removed in the near future as `AsyncContext` becomes available.

### Manual invalidation

Sometimes you may need to rerun an async computed even though its inputs haven't changed. For instance, you might have a manual refresh button to let users get the latest data. You can call `invalidate` on a result to force the computed to rerun.

```js
const useAsyncValue = asyncComputed(async () => {
  // ...
});

const result = useAsyncValue();

// Later...
result.invalidate(); // Forces the fetch to rerun
```

## Async Tasks

Async computeds are meant to represent _data_, values fetched or generated based on some input (e.g. a URL). In many cases, however, we have an _asynchronous task_ which triggers based on some action or event. For example, you might have a save button that sends a `PATCH` request to the server. You _could_ just handle that in an event handler and not bother with hooks or signals, but the issue is that you likely also want to show _some_ indication to the user about what's happening. A loading spinner, or some other UI affordance.

This is what _tasks_ are for. Tasks do not compute a value, they just run a given async operation and update their state as it is running.

```js
import { asyncTask } from 'signalium';

const useSendFriendRequest = asyncTask((userId: string) => {
  return fetch(`/api/requests/${userId}`, { method: 'POST' });
});

// ...usage
const sendFriendRequest = useSendFriendRequest(userId);

// runs the request, returns a promise of the result
sendFriendRequest.run();

// The same properties on async computeds
sendFriendRequest.isLoading;
```

The signature for an `AsyncTask` is:

```ts
export interface AsyncTask<T, Args extends unknown[] = unknown[]> {
  result: T | undefined;
  error: unknown;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isReady: boolean;

  run(...args: Args): Promise<T>;
}
```

These mirror the properties on async computed results and their behaviors, allowing you to read the state of a given task \_declaratively.

Like with computeds, async tasks are _deduped_ based on the arguments that are passed to them. If you pass the same arguments, you will get the same task instance, which will also return the same state of the request. Unlike computeds however, no part of async tasks reruns automatically based on mutable state. They are write-only.

### Anti-pattern: Running tasks reactively

One temptation for tasks is to run them _in response_ to some other data changing. For instance, you might try to set up something like this:

```js
const useFetch = asyncTask((url) => {
  // ...
});

const useCustomComputed = computed(() => {
  const analytics = analyticsUrl.get();

  // Track something whenever this computed reruns
  useFetch(url).run();
});
```

Tasks are meant to represent a "write" operation of some sort, effectively updating some state elsewhere. And, like [mutating state in a computed](/core/computeds-and-state#can-i-mutate-state-in-a-computed), running mutations as a side effect of running a computed is generally an antipattern. If you're considering doing this, some alternatives might be:

1. Running the task in an event or user input handler (though if your here, you've likely considered this already and it's not realistic)
2. Converting the task to an async computed and deriving from the value instead (again, likely something you've considered, but it's worth checking!)
3. If the task whose _state_ has no impact on the UI, consider making it a plain async function instead of a task. For instance, in the `analytics` example above, there usually isn't a loading spinner or anything like that shown when we're sending analytics data, so there's no reason for that to be a task over a plain function. Likely it would also batch events together and then manage them all in one place, and that could be a global or a contextual value, but there's no reason for it to be a _reactive_ value as well.

Like with updating state, there is no blanked prohibition on running tasks in your computeds, but it can lead to unexpected and difficult to reason about behavior and _should be avoided_.

## Summary

Async computeds and tasks are the go-to solutions when dealing with standard, promise based async in Signalium. To sum up the main points:

- Async Computeds
  - Used for fetching data or reading the result of another async operation
  - Return a result object that represents the _current state_ of the request
  - React to updates in state, refetching when one of their inputs change
  - Only propagate changes when they are fully resolved
  - Can be awaited when nested
  - Should access all tracked and awaited values _before_ using native `await` or promise chaining
- Async Task
  - Used for running an async operation on command
  - Exposes the same state properties as async computeds
  - Should not be used _reactively_ (e.g. in response to changes in other signals)

Between async computeds and tasks, most common data fetching and mutation operations should be covered. This is because _most_ async in JavaScript is _symmetric_ - you send one request, you receive one response.

What do we do, however, when we have to deal with _asymmetric_ async? This brings us to the final core types of signals: Subscriptions and Watchers.
