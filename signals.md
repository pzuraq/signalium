React Hooks revolutionized the frontend world, fundamentally shifting how we approached reactive code in component-oriented view layers. However, time has shown that they also have significant drawbacks, particularly around emergent complexity that arises as applications grow in scale and the number of hooks per-component rises. The root cause of this complexity is that Hooks fundamentally do not capture enough of the _reactive context_ surrounding derived values, which leads to overly redundant and fundamentally less predictable code execution.

Signals are an alternative reactivity primitive that have been gaining momentum in the JavaScript ecosystem, and that offer an alternative to the Hooks model. Unlike Hooks, Signals are monadic and capture the full context required to efficiently re-execute the _minimum set of functions_ required to correctly update any application in response to state changes.

This essay seeks to:

1. Review both the value of and the issues with Hooks,
2. Diagnose these issues and contextualize them, and
3. Demonstrate the ways in which Signals resolve these issues

I also introduce a new library, [Signal Hooks], which combines the reactivity benefits of Signals with the ergonomics of Hooks. This library is framework agnostic, and its ultimate goal is to show that reactivity primitives such as Signals can be generalized not just for view-layer frameworks, but potentially at the _language_ level for any functional programming language.

## But first, a retrospective...

When Hooks first hit the frontend world back in [2018](https://www.youtube.com/watch?v=dpw9EHDh2bM), I was, like many others, pretty immediately enamored with them. React had already proven out the benefits of component-oriented view layers, and the benefits of functional programming were finally becoming accepted in the industry after decades of dominance by object-oriented programming. I was skeptical that the _entire_ view layer could be pushed into a "pure" functional style, but I was also curious, because at the time I was working on a very similar set of problems.

Back then, we were working on overhauling the Ember.js programming model holistically around an [early version] of what would today be recognized as [Signals] (a process that, in my opinion, ultimately failed to come together in a timely enough matter for the framework to maintain relevance, but that's a story for another time), and one core issue we kept coming back to was _loading data_. Much like React pre-hooks, Ember components that wanted to load data outside of the framework's router had to rely on a variety of lifecycle hooks, and managing this dance of managing state and dynamically loading data was, to say the least, _very tricky_.

Hooks, with early utilities like [SWC] and [React-Query], showed a different path toward solving this problem. One which looked a lot cleaner and easier to understand, which made the whole process of managing that state _self-contained_ in a way that wasn't really possible before. They essentially extended _reactivity_ beyond components and into the world of data loading, DOM mutation, and general side-effect management as a whole.

But in the years since their release, there have been more and more complications with the Hooks programming model. It's not uncommon these days for React devs to decry Hooks and the complexity that they add, and there have been more and more experiments with alternatives such as [Zustand] or [Jotai] in the wider ecosystem. The React team has been attempting to solve these issues with an [experimental compiler] that purports to automatically add calls to `useMemo`, `useCallback`, and `React.memo`, reducing the cognitive overhead that plagues hooks usages - but I don't think that this is going to work, for the simple reason that adding an additional layer of compiler magic which _further_ obfuscates the usage of hooks seems like it ultimately will add more fuel to the ongoing firestorm of emergent complexity.

Meanwhile, on the other end of the JavaScript ecosystem, there has been an ongoing effort to standardize a new reactivity system built around Signals. Essentially every major frontend framework besides React - Angular, Vue, Svelte, Preact, Solid, and more - have more or less _independently_ arrived at Signals fairly independently. Even Jotai and MobX in the React world are, essentially, Signals flavors in their own ways. There is enough independent discovery here that it really does suggest that we've _found_ something interesting, at the least.

Still, it seemed like Signals and Hooks were somewhat diametrically opposed, or at the least solving very different problems. But as I started working more with React over the years, and as I got deeper into the design of Signals, I kept coming back to that magic that Hooks had first shown me all those years ago. They felt _so close_, like each had something the other was missing.

And after pondering this question for the last 7-odd years, I think I've figured out what it is.

Famous last words, I know. I'm afraid I'm about to make it a _bit_ worse. Stick with me here.

It turns out that Signals are a _reactive monad_, where Hooks are not.

I know, I know, [what even is a monad???] It's one of those weird academic-type terms that people like to throw around and that make the rest of us feel a bit dumber (no shade to people _do_ use it, also, it's a very useful term, especially now that I finally _get it_). I promise not to get _too_ into the weeds on this, but it's important because it really is the _crux_ of the issues we have with Hooks. My hypothesis is that the _vast_ majority of the complexity in Hooks-based code comes from this core issue - that they are fundamentally non-monadic.

However, despite having these issues, Hooks still have a _more intuitive_, and I would also say _more powerful_, API. Hooks provide not just root state with `useState` and derived state with `useMemo`, but also the ability to access implicit values via `useContext`, and the ability to manage external effects and libraries via `useEffect`/`useLayoutEffect`/`useSyncExternalStore`. I've [written previously] about my perspective that managed effects need to be able to exist in Signal graphs, and this is the reason for the somewhat controversial `watched`/`unwatched` API in the Signals proposal, but not every Signals implementation has come around to this perspective yet.

I've been playing around with these ideas for some time now, and either I've finally managed to resolve these core differences, OR, I've birthed some unholy combination that will haunt us even more than Hooks in the coming years. But I've been honing this core set of ideas for over 7 years now, and I _think_ we're finally there.

> I also want to take a moment to acknowledge the many, many other devs who have all been working on Signals and Hooks for years. I don't pretend to have done all of this thinking on my own (I don't believe that's how scientific or technological advancement really works in the first place) and I wouldn't have gotten to this point without the help of many others, particularly my mentors on the Ember core team, the React team and all of their work that I watched from afar, the Svelte authors and community (I learned a lot from my time digging into Svelte apps and Runes), and everyone involved with the Signals proposal as a whole.

So, without further ado, allow me to introduce [Signal Hooks](): a general-purpose reactivity layer that focuses solely on making plain-old-JavaScript code _reactive_, in the same way that Promises made plain-old-JavaScript code _async_.

## Plain Old (Reactive) JavaScript

To explain what I mean here, we do need to get back to the "what is a monad" thing, so let's get that out of the way. I had a computer science professor in college who taught us Haskell and had a whole section on monads, and we even implemented a `semicolon` monad to sequence things like an imperative language (which honestly just felt like trolling at that point), but I still couldn't really _grasp_ it. When I first started my career and was learning Scala, one of my coworkers told me that a monad was "anything that implemented `map` and `flapMap`", which was also not really helpful. Over time I learned about more things that were monads, like `Result` and `Option`, and that helped a bit more as I started to dig into Rust and such.

But where it really finally hit me was with Futures, and by extension, Promises (and to be clear, I'm aware that [Promises are not really monads](https://stackoverflow.com/questions/45712106/why-are-promises-monads), but they are _close enough_ in purpose and, more importantly, they're familiar enough to every JavaScript dev that they provide a great reference point).

So, let's consider some code with Promises.

```ts
function loadAndProcessData(query) {
  return fetch(query)
    .then(response => response.json())
    .then(data => processData(data));
}
```

This code is pretty simple, but stepping back, let's think about what has to happen under the hood to make it all work.

1. First, we call the `loadAndProcessData` function, which then calls `fetch`, which returns a promise.
2. Then, we _yield_ back to the JavaScript event loop. So, the main JS thread is going to keep on executing other tasks and doing things while we wait on the `fetch` to return.
3. In order to make that work, we need to store the _current state_ of the function, including:
   1. The current variables in scope, so that we can restore them
   2. The line of code we're waiting on, so that we know which line to execute next
   3. The external promise returned by `loadAndProcessData`, so we can resolve it once all steps have been completed
4. All of these values are stored _somewhere_, and then when we return, we restore those values to the callstack and start executing again on the next line.

The exact details of how and where those values are stored don't really matter, because externally we don't really need to worry about them. That's all handled by the Promise (and JavaScript's closure/scope semantics).

Monads are essentially like a box that contains some _context_, and that box comes with a function that let's you take that context and transform it into _another_ box with the _next_ context in the sequence. In the case of Options or Results, you're transforming the result of an operation (`Some`/`None` or `Ok`/`Err`) into whatever you were planning on doing next with those values, and handling the edge cases if there was _no_ value or an error instead. In the case of Futures and Promises, the box has all of that context around the async operation, and `Promise.then` is the function that carries us on to the next step.

But the magic of monads is not just in what they are, but also how often they fit into an existing, perhaps just _slightly_ tweaked, syntax. With `async`/`await` syntax we can restructure our original Promise-based function to look much more like plain-old-JavaScript:

```ts
async function loadAndProcessData(query) {
  const response = await fetch(query);
  const data = await response.json();

  return processData(data);
}
```

This reads like synchronous code, but does all of the same async sequencing and transformations as our first example. Similar syntax exists for Options or Results in (more) functional languages like Rust and, of course, Haskell, and if we think about this it should be maybe a bit obvious _why_ this works so well - after all, programming languages are inherently about _linguistically sequencing_ things, either via imperative steps (turned out that `semicolon` lesson _was_ useful after all), nested function calls, declarative dependencies, or some other means.

So, what does a _reactive_ monad look like?

And more importantly, how do we incorporate it in a way that is _fluid_ and _natural_ in our syntax?

## The Hooks Version

Let's consider what the above might look like using hooks:

```ts
function useLoadAndProcessData(query) {
  const response = use(fetch(query));
  const data = use(response.json());

  return processData(data);
}
```

```ts
const loadAndProcessData = createAsyncComputed(query => {
  const { result: response, isLoading } = useFetch(query);
  const data = useJson(response).await();

  return processData(data);
});
```

This actually looks very similar overall to our `async`/`await` syntax, which is a great sign! Compare this to, say, Observables (another monad that is used for reactivity):

```ts
function createLoadAndProcessDataObservable(query: Observable<string>) {
  return query
    .map(query => fetch(query))
    .map(async res => (await res).json())
    .map(async data => processData(await data));
}
```

This is a bit contrived (that _could_ just be a single `map` statement, or better libraries that handle the details of sequentially awaiting piped promise values), but you can see how as we break down each individual step, we start to introduce a lot of _complexity_ with Observables. It starts to look less and less like _plain_ JavaScript, and Hooks are looking a lot better in this regard.

The issue with the Hooks version, however, is what it's doing under the hood to work.

As we know, Hooks rerun whenever there _might_ be an update. This is why we have constantly pass in our dependencies to every hook, and why all of the operations of hooks have to idempotent for the given set of arguments. What is happening, in effect, in our hooks example of this is that we are rerunning all of the steps of the `useLoadAndProcessData` function that we _already ran_ in order to rebuild the previous state of the world, and we are _then_ advancing to the next step.

And it's not just that hook that we're rerunning - we're also rerunning _every_ other hook above it in the call stack, all the way up to the nearest component. This is where the complexity comes from. And this is why hooks are not _monadic_.

Imagine if this were the way that `async`/`await` syntax worked. We rerun the _entire_ function leading up to the currently active `await` statement. If all of those steps were fully idempotent and non-stateful, then that would _technically_ work. We could do that each time, and not really worry about capturing and restoring context fully in the Promise.

That may sound far-fetched to you, but going back to the days _before_ promises, maybe that would be a bit more appealing.

```ts
function useLoadAndProcessData(query, callback) {
  fetchCallback(query, response => {
    parseJson(response, () => {
      callback(processData);
    });
  });
}
```

It took me a good moment to dredge that syntax back up and think it through, and this has _so much_ extra complexity going on here. Imagine if we're trying to refactor a synchronous version of this function to make it more performant, and we suddenly need to refactor everything to use this `callback` pattern. And it's not just here - you would need to add that `callback` argument to _every_ non-async function that calls this one!

Detractors would note that this _also_ applies to Promises and `async`/`await`. If you make a function async, you now need to go and make every function that uses it async as well. But there is a _crucial_ difference here: It's a _lot_ harder to mess `async`/`await` up, because fewer lines of code need to change, and there is less "wiring" that has to occur.

With the `callback` pattern, you now need to:

1. Separate all of the code that comes _before_ the async operation from the code that comes _after_ it,
2. Ensure that the callback is called at the correct time to execute the function _above_ us in the call-stack,
3. Ensure that no code is accidentally left _after_ we schedule the callback in our function (because it could keep running and do more things in the meantime) AND after we call the callback in _our_ callback (oh boy, this is getting to be a lot).

And that last part is doubly tricky because lots of clever devs _do_ want to make use of it from time to time. Yes, let's schedule something async _and_ keep on doing things! Or call the callback and get its return value and then do something else! Maybe we call the callback _twice_, or _three_ times!

You have much more _power_ with callbacks, is the point. And 99% of the time, you don't _need_ that power - it just makes it harder to rebuild and refactor and understand a codebase, in the end. This is why Promises (and later, `async`/`await`) were so successful in reducing complexity in async. It's not that they eliminated _all_ of the overhead or complexity, but they reduced _most_ of it in the common case.

But we've digressed, back to our thought experiment! We could _imagine_ that rather than using callbacks _or_ promises, we could do the same thing that React's `use` function does here - we could `throw` and halt execution:

```ts
const responses = new Map();
const parsed = new Map();

function useFetch(query) {
  if (responses.has(query)) {
    return responses.get(query);
  } else {
    fetchCallback(query, response => {
      responses.set(query, response);

      // Re-run the program after the async operation is done
      rerunProgram();
    });

    throw WAIT_FOR_ASYNC_EXCEPTION;
  }
}

function useParseJson(response) {
  if (parsed.has(response)) {
    return parsed.get(response);
  } else {
    parseJson(response, json => {
      parsed.set(response, json);

      // Re-run the program after the async operation is done
      rerunProgram();
    });

    throw WAIT_FOR_ASYNC_EXCEPTION;
  }
}

function useLoadAndProcessData(query) {
  const response = useFetch(query);
  const data = useParseJson(response);

  return processData(data);
}
```

You can see that we end up with a pretty similar looking high-level API, but we also know that the underlying code is rerunning _constantly_, each time a related async operation calls its callback. Again, in theory this is completely ok, because all of the operations that are called are idempotent and "pure". But, we can also see how easy that would be to mistake.

For instance, let's say we decide to start integrating a telemetry library to gather performance information, and we want to get the total number of times we call `useLoadAndProcessData` so we can determine if it should be reduced. A naive implementation might look like:

```ts
function useLoadAndProcessData(query) {
  incrementCounter('fetching-data');
  const response = useFetch(query);
  const data = useParseJson(response);

  return processData(data);
}
```

But once we realize that this function will be called repeatedly, we can see that the `incrementCounter` method needs to deduplicate itself somehow. This is not as much of an issue with `async`/`await`:

```ts
async function loadAndProcessData(query) {
  incrementCounter('fetching-data');
  const response = await fetch(query);
  const data = await response.json();

  return processData(data);
}
```

This will only call `incrementCounter` once per-promise, by default, which is more of what we would expect if we can into this situation without any prior knowledge. You might point out that the hooks example also _deduplicates_ query calls, so it's more efficient overall though! And I would say yes, that's true, but it may or may not be the desired effect in some cases, and regardless, that would be _very easy_ to add to the async version as well:

```ts
const loadAndProcessData = memoize(async query => {
  incrementCounter('fetching-data');
  const response = await fetch(query);
  const data = await response.json();

  return processData(data);
});
```

Overall, if Promises worked more like Hooks, we can see that it would only add increased complexity and many gotchas and foot-guns that are currently avoided. As applications using that model grew, they would also start to experience a lot of the same emergent complexity we see from Hooks in general: Infinite rerender bugs caused by forgetting to memoize a callback, performance issues caused by calling plain functions without `useMemo`, and even code and infrastructure that becomes _reliant_ on the fact that we're constantly re-executing the entire call-stack each time an async value resolves, because if there's one thing we know, it's that timing semantics _always_ eventually become part of your public API.

## Uno Reverso

So the question becomes: How do we do the reverse? How do we make Hooks work more like Promises and other monads? Is that even possible?

This is the core problem that the Signals proposal has been trying to solve, and I do believe that at this point, we _have_ solved it (at least mostly. Kinda like how Promises mostly solved async, but Futures are like, the _real_, fully monadic solution... maybe JavaScript is just always cursed to be like this?). Let's dig into it.

I'm going to break this down into two parts.

1. First, I'm going to talk about how Signals themselves _work_, at the primitive layer. We'll discuss the different types of Signals and what they're for, the guarantees Signals have, and the complexity and overhead that they _do_ add (because everything adds some amount of overhead, that part is unescapable).
2. After that, I'll dig into the SignalHooks library and explain how the React-Hooks style API is layered on top of Signals. We'll show how this layer operates more like "plain-old-JavaScript" functions, how it can integrate in general with view layers, and explore how it could even become a language feature someday (purely and _highly_ speculative, but always a good sign that your abstraction is solid!)

So, first up: How do Signals work?

## The Primitives

All Signals implementations have at their core at least two signal types:

- **State Signals**: These are signals that contain the _root state_ of your application. They are readable and writable, and can contain any value.
- **Computed Signals**: These are signals that contain _derived_ values. Computed signals at the minimum just need to be readable, though some implementations also allow for a setter.

In Signalium (the Signals implementation used in Signal Hooks), these are implemented using the following interfaces:

```ts
interface Signal<T> {
  get(): T;
}

interface StateSignal<T> extends Signal<T> {
  set(val: T): void;
}
```

And a basic example of them looks like the following:

```ts
const a = state(1);
const b = state(2);

const c = computed(() => a.get() + b.get());

console.log(c.get()); // 3
console.log(c.get()); // 3 (from cache)

a.set(2);

console.log(c.get()); // 4
```

The computed in this example only recomputes when the state signals it used are updated, otherwise it serves the previous value from cache. You'll also notice that we aren't doing any sort of manual wiring from these state signals to the computed. Instead the computed is _autotracking_ these values while it runs and saving them as dependencies. Autotracking works in nested function calls as well, so you can call functions and access signals within them:

```ts
function addSignals(first, second) {
  return first.get() + second.get();
}

const a = state(1);
const b = state(2);

const c = computed(() => addSignals(a, b));
```

And computeds can also be accessed within other computeds, and are tracked as dependencies as well:

```ts
const a = state(1);
const b = state(2);

const c = computed(() => a.get() + b.get());
const d = computed(() => c.get() + b.get());
```

These interdependencies end up forming a _graph_, with signals as the nodes and dependencies the edges. The graph is directed and acyclic (because _cycles_ would generally cause stack overflows, outside of async). We can also say that signals are _pure_ if they return the same result given the same signal dependencies with the same values, similar to pure functions. In practice, what this means is that signals are guaranteed to be pure as long as all mutable state they access, directly or indirectly, is held in a state signal.

Lastly, we need to discuss _propagation_ through that graph, because this is how Signals differ most significantly from other reactivity primitives such as Hooks or Observables.

Signals do not eagerly push changes through the graph. Instead, propagation starts the next time you read a computed. If one of its upstream dependencies has been updated, we walk the graph from the signal we're reading to that dependency, and then we check each computed in _reverse order_ - from the state back up.

```ts
const a = state(1);
const b = state(2);

const c = computed(() => {
  console.log('compute c');

  return a.get() + b.get();
});

const d = computed(() => {
  console.log('compute d');

  return c.get();
});

const e = computed(() => {
  console.log('compute e');

  return d.get();
});

// Initial computation runs in standard order, logs:
//   compute e
//   compute d
//   compute c
e.get();

a.set(2);

// Recompute, runs in reverse order as we check updates from `a` to `e`:
//   compute c
//   compute d
//   compute e
e.get();
```

And if, along the way, we find that the value of the affected computeds has _not_ changed, we stop propagation.

```ts
const a = state(1);
const b = state(2);

const c = computed(() => {
  console.log('compute c');

  return a.get() + b.get();
});

const d = computed(() => {
  console.log('compute d');

  return c.get();
});

const e = computed(() => {
  console.log('compute e');

  return d.get();
});

// Initial computation runs in standard order, logs:
//   compute e
//   compute d
//   compute c
e.get();

a.set(2);
b.set(1);

// Recompute, stops propagating after we check `c` because
// it returns the same value:
//   compute c
e.get();
```

We know this is correct as long as all of the signals involved are pure, because if a signals value has not changed then none of its consumers should have changed either. This remains true even if signals are accessed conditionally or dynamically in branching logic - if the branch would change, then the state that caused that change should also be contained within a signal (and signals are checked in original run order, ensuring we don't check a value that may not be necessary). Consider this example:

```ts
const num1 = state(2);
const num2 = state(2);
const num3 = state(2);

const condition = computed(() => {
  return num1.get() < 3;
});

const inner = computed(() => {
  return num1.get() + num2.get();
});

const outer = computed(() => {
  return condition.get() ? inner.get() : num3.get();
});

// On the first compute, `outer` tracks `condition`, which is true,
// and `inner` because that's the branch we go down. `num3` is not tracked.
outer.get(); // 4

num1.set(1);

// On the first recompute, we first check `condition` before
// anything else. We find that `condition` is still true, so then we
// check `inner`, which has updated, and last we run `outer` again.
// `outer` ends up with the same dependencies and a new result.
outer.get(); // 3

num1.set(3);

// On the second recompute, we check `condition` and now see that it's
// false. We know that something may have changed in the execution of
// `outer` at this point, so we don't need to check `inner`. We re-execute
// `outer`, and chooses the other branch and tracks `num3` instead.
// `inner` does not rerun.
outer.get(); // 2
```

So, I want to visualize this for a moment. Let's say that this is a representation of a reactive function's call-tree, where bars represent function calls, circles represent state, and the purple state is state that has been updated:

![[Screenshot 2025-01-28 at 9.15.17 PM.png]]

With the Hooks model, we would be re-executing the entire callstack from the top, skipping `useMemo` instances but otherwise rerunning every node in between.

![[Screenshot 2025-01-28 at 9.17.40 PM.png]]

With the Signals model, we rerun the _minimum set of nodes in the graph_ to propagate the update. The main function may never be called twice, if it is not needed.

![[Screenshot 2025-01-28 at 9.18.23 PM.png]]

This is an improvement in not just performance, but also ergonomics, because it means that we can use the rules of standard variables and JavaScript function scopes without having to worry about idempotency as much.

So far, this is a complete system for writing reactive code, if that code is _synchronous_. Let's talk about async code next.

### Handling Async

As a forewarning, this is the place where most Signal implementations diverge, and there is a lot of ongoing active design work in the community. We all know that we need to handle async _somehow_, but exactly how is the hard part.

Signalium takes an opinionated approach here based on three main observations:

1. All async operations are effectively _managed side-effects_.
2. These effects are either _symmetric_ or _asymmetric_:
   - Symmetric async is essentially anything that can fit into a Promise - fetching data, reading a file, waiting for a value to render, etc. Essentially, we are sending out a single request and getting exactly _one_ response.
   - Asymmetric async covers everything else, where you may send zero-or-more messages and receive zero-or-more responses. Examples include subscribing to a topic on a message bus, communicating to a background process, or sending and receiving WebSocket messages.
3. In either case, the important thing is that we are ultimately sending data _out_ of the graph in some form, and receiving data _back_ in some form in almost all cases.

One of the trickiest things about `useEffect` is that it is _very_ powerful. You can create effects that can manage state, write to the DOM, send requests, manage subscriptions, and so on. And importantly, `useEffect` can quickly become more than _single purpose_, which starts to lead to leaky abstractions and buggy code. Yet `useEffect` is ultimately the only way to handle a lot of async (though `use` and Suspense have made some of it easier, there are still a lot of cases where `useEffect` is still necessary.)

Signalium instead focuses on _containing_ effects, so that they are tightly scoped to a single node in the dependency graph. These nodes:

1. Have state flow into them
2. Send that state out of the graph via an effect, and finally
3. Receive the response(s) and sets their _own_ value for other nodes to read. For consumers of async signals, all they see is a fully synchronous value that updates a little bit after the effect is triggered - a \*blip\* in the execution of the graph as it were.

There are two types of async signals: **AsyncComputed** for symmetric async, and **Subscriptions** for asymmetric async.

### AsyncComputeds

AsyncComputeds receive an async function, and they expose the full state of that function as a _result_ object with the following signature:

```ts
interface AsyncResult<T> {
  result: T | undefined;
  error: unknown | undefined;
  isPending: boolean;
  isReady: boolean;
  isSuccess: boolean;
  isError: boolean;
  didResolve: boolean;

  // manual invalidation for e.g. refetching
  invalidate(): void;

  // used for "awaiting" in nested computeds (more on this next)
  await(): T;
}
```

The idea here is that we're exposing all of the various states that a Promise can have _declaratively_, so you don't have to actually `await` the Promise. Instead, you can handle each of the states by checking values like `isPending` to see if you should show a loading spinner, `isError` to see if it failed, and so on. This is a common pattern in the Hooks and Signals worlds, with libraries like [Tanstack-Query](https://tanstack.com/query/latest) demonstrating its value.

One extra piece of functionality that AsyncComputeds have though is the ability to _compose_ with each other gracefully and update reactively in doing so. They can do this with the `await()` helper on the result:

```ts
const a = asyncComputed(async () => {
  await sleep(1000);

  return 1;
});

const b = asyncComputed(() => {
  const val = a.get().await();

  return val + 1;
});

b.get(); // { result: undefined, isPending: true, ... }

// wait 1 second

b.get(); // { result: 2, isPending: false, ... }
```

Under the hood, this uses the same `throw` trick we learned earlier to track the dependency on `a` and then halt operation of `b` until `a` has returned. Externally, `b` will show as pending during that time, and it will rerun every time `a` changes either way. The key difference is that this `throw` trick does _not_ re-execute the entire callstack, just the local function.

> As a sidenote, we'll be able to fix this and use true `await` syntax if the [AsyncContext](https://github.com/tc39/proposal-async-context) proposal goes through, the main issue is that we can't use promises because it breaks autotracking after the first `await` and AsyncContext would provide a way for us to maintain autotracking across that boundary.

### Subscriptions

Subscriptions are a little more nuanced than AsyncComputeds, because they come in many more shapes and sizes. Really, you can think of the call-response of a Promise as just a single-use Subscription that happens to cover 90% of things you need to do asynchronously. But that last 10% includes a long tail of additional patterns.

For instance, let's say we want to write a message bus Subscription. We need to:

1. Start listening to messages on the bus when the subscription is _actively used_.
2. Expose the incoming messages externally to the rest of the graph. We could either expose the latest message, the last-n messages, the entire history of messages, or a reduction across all messages potentially.
3. When the subscription is no longer needed, we need to _stop_ listening to messages on the bus so we no longer consume system resources. This becomes more important if you start to have dynamic topics or multiple buses, and need to make sure that you're always cleaning up or else you'll leak memory and eventually slow your app to a crawl.

The `subscription()` API let's us do this with an initialization function that can return `update` and `unsubscribe` functions:

```ts
const eventName = state('topic');

const busReader = subscription((get, set) => {
  const listener = message => {
    const currentValue = get() ?? 0;

    // Get the current value and add the next message
    // to it, accumulating all of the values over time
    set(currentValue + Number(message));
  };

  // Setup the initial listener and unsubscribe function.
  // `eventName` gets tracked here and when it changes, the
  // `update` function below will be called.
  let removeListener = MessageBus.listen(eventName.get(), listener);

  return {
    update() {
      // Unsubscribe from the previous topic
      removeListener();

      // Subscribe to the next topic
      removeListener = MessageBus.listen(eventName.get(), listener);
    },

    unsubscribe() {
      // Unsubscribe from the current topic and
      // stop the subscription entirely.
      removeListener();
    },
  };
});
```

These lifecycle hooks allow us to setup and handle any type of general subscription-like pattern, including integrating with other reactivity systems (e.g. Observables, Tanstack Query, Apollo, and so on).

There's just one last missing ingredient: How do we know when a Subscription needs to initialize itself, and when does it need to tear itself down?

### Watchers

Watchers are the last major concept in Signals, and they have two main purposes:

1. Watchers sit at the edge of a Signal graph and act as a _sink_. State updates flow to them, and whenever the values they watch change they notify external subscribers (e.g. letting React know it needs to rerender, or writing updates directly to the DOM).
2. Watchers determine whether a Subscription signal is _active_ or _inactive_. When a Subscription signal connects to a Watcher, it activates and runs its initialization function, and when that signal disconnects from _all_ watchers and is no longer in use, it calls the `unsubscribe` function and tears itself down.

When Subscriptions are inactive, they stop updating entirely. You can still read them from other computeds or in callbacks and so on, but if those computeds are not connected to a watcher, the subscription will never update. This behavior ensures that subscriptions are not held onto for too long, and that they don't leak memory.

Watchers in Signalium are similar to computeds, they receive a function that they run and autotrack:

```ts
const a = state();

const w = watcher(() => {
  a.get();
});
```

The key difference is that this computed will be checked automatically whenever anything it consumes changes until we call `disconnect`.

```ts
w.disconnect();
```

### Primitives Summary

That's really all there is to it! There are 5 main abstractions in 4 categories:

- State
- Computeds
- Async
  - AsyncComputed
  - Subscriptions
- Watchers

Between all of these we have all of the components we need to build reactive apps, but the main issue that remains is the ergonomics are a little bit off here compared to plain pure functions or hooks.

So, let's get into the last layer on top of this: Signal Hooks.

## Signal Hooks

Ok, we're _finally_ here. Hopefully you made it through the rest of this novel-length-guide, but if you skipped ahead no worries, this is the best part.

There are two main things that are missing from Signals that we use a _lot_ in Hooks: **Arguments** and **Contexts**.

Let's start with arguments because they're pretty straightforward. In the Hooks API, the idea is that hooks are "just functions", and like any other function in JS they receive arguments. This is what gives hooks so much power, you can easily create new "instances" of them by just calling them with different arguments:

```ts
function useFetch(url) {
  const [data, setData] = useState();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(async () => {
    const res = await fetch();
    const json = await res.json();

    setData(json);
    setIsLoading(false);
  });
});

export function useLoadData() {
  const users = useFetch('/api/users');
  const comments = useFetch('/api/users/comments');

  return {
    users: users.data,
    comments: comments.data,
    isLoading: users.isLoading ?? comments.isLoading,
  }
}
```

This example shows how we can create and then reuse the custom `useFetch` hook twice with different urls easily, and that let's us _compose_ these hooks together really naturally.

By contrast, let's try to do the same thing with Signals:

```ts
function createFetchSignal(url) {
  return asyncComputed(async () => {
    const res = await fetch(url);
    const json = await res.json();

    return json;
  });
}

const usersSignal = createFetchSignal('/api/users');
const commentsSignal = createFetchSignal('/api/users/comments');

export const data = computed(async () => {
  const users = usersSignal.get();
  const comments = commentsSignal.get();

  return {
    users: users.data,
    comments: comments.data,
    isLoading: users.isPending ?? comments.isPending,
  };
});
```

Yeesh, that looks just a _bit_ more convoluted. What happened?

The core of the issue here is that unlike plain pure functions, reactive functions need to access some amount of shared state between function executions. This is why Hooks have things like `useState` and `useRef`, because those essentially access the nth stateful value and restore it behind the scenes. That way, you aren't actually kicking off an extra fetch request every time you call the same hook in the same component.

Signals, on their own, don't have a way to reference the previous value like hooks do, so we instead create the signals in a shared higher scope, and we reference them directly in our function. This obscures the nature of our functions, however, and places the complexity of managing these different signal instances on the developer.

So, how do we resolve these issues?

Going back a few sections, you might remember that we established that signals, like functions, can be _pure_. We can leverage this fact to create an API that maps signals to arguments, returning a single instance of a signal given the same arguments. With Signal Hooks, this ends up looking like:

```ts
const useFetch = createAsyncComputed(async url => {
  const res = await fetch(url);
  const json = await res.json();

  return json;
});

export const useLoadData = createComputed(() => {
  const users = useFetch('/api/users');
  const comments = useFetch('/api/users/comments');

  return {
    users: users.data,
    comments: comments.data,
    isLoading: users.isLoading ?? comments.isLoading,
  };
});
```

Under the hood, `useFetch` checks a map to see if an instance of the async computed exists for the given URL, and if so it uses that. Otherwise, it creates a new one for that URL. These referenced values are kept using `WeakRef`s, so they are garbage collected and efficiently disposed of once they're no longer needed.

So, that leads us to one last question - where do we store the map?

### Contexts

Contexts may seem like more of a view layer concern, but they have been explored on a language level as well in languages such as Scala, which has a notion of [implicit parameters](https://docs.scala-lang.org/tour/implicit-parameters.html) in functions. We can think of context values in Signal Hooks like implicit variables as well, and these variables don't impact our guarantees around purity because, as we noted before, signals are pure as long as all mutable state they access is contained in state signals.

At the root of the application, there is a global context without any values in it. This allows you to use these hooks _anywhere_ in JavaScript, not just in the view layer. You can use them in callbacks, in the root of modules, in backends and in frontends, etc. They have _zero_ ties to anything in the view layer, but they have the same API as hooks.

```ts
export const useFetch = createAsyncComputed(url => {
  const res = await fetch(url);
  const json = await res.json();

  return json;
});

// This works
export const users = useFetch('/api/users');

// We could also do this
document.addEventListener('click', () => {
  // And this instance of `users` will be the _same_ instance as above
  const users = useFetch('/api/users');
});
```

We can also add add values to the current context for computeds to reference with `useContext`:

```ts
const ApiUrlContext = createContext();

export const useApiFetch = createAsyncComputed(url => {
  const apiUrl = useContext(ApiUrlContext);

  const res = await fetch(`${apiUrl}${url}`);
  const json = await res.json();

  return json;
});

export const users = withContext([ApiUrlContext, '/api'], () => {
  return useApiFetch('/users');
});
```

`withContext` can be nested, so context values can be overridden for different parts of the call-tree. Context usage is tracked for each computed alongside arguments, which allows us to intelligently fork the store when contexts are overridden for a given subtree. Signals that never accessed the overridden contexts get the parent value, but signals that _did_ are recreated with the new context.

## And that's it

That's basically everything there is. Signals and Signal Hooks are a very powerful abstraction, but they're also very _simple_, in the end. The total API surface is just 4 functions:

- `createComputed`
- `createAsyncComputed`
- `createSubscription`
- `watcher`

And these abstractions work anywhere you need them, no longer tied to the render cycle. You can use these hooks in React as long as you import the `@signalium/react` package and call its setup function, and you get all of their benefits with more efficient rerenders and deduplicated work and so on. But you can also run these in your backend, for an in memory data store or a message bus consumer. You can use them in a background script or web worker. The potential applications are much more broad.

And I bet some folks out there are reading this and thinking "who, on Earth, would want hooks everywhere? They're bad enough in just React!"

My _hope_ is that the frustrations we've encountered with hooks in React have mostly been due to the issues I've outlined in this essay, and that Signal Hooks provide an iteration on that structure with fixes all of these core issues. You may not have noticed, but there is one central React hook that does not exist in Signal Hooks: `useState`.

This is very intentional, because after all, state is the enemy, state is the mind killer. And so far with these abstractions I have not really encountered a _need_ for local state that needs to be stable like this. Arguments can also themselves be signals, so components can pass reactive values deeply into computed hook trees but maintain ownership and control of those values. And outside of component state, there's really just contextual and global state, and both of those can be easily accessed with `useContext` or just directly importing signals stored in modules. The last little bit of statefulness is really just the various transitory states of handling async, which are handled by AsyncComputed or Subscriptions.

So yes, so far, I have not needed `useState`. And it has really been quite _refreshing_, if I do say so myself.
