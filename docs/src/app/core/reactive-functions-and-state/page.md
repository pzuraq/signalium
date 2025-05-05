---
title: Reactive Functions and State
nextjs:
  metadata:
    title: Reactive Functions and State
    description: Understanding state management and reactivity in Signalium
---

At it's core, Signalium is a framework for defining both _reactive functions_ and _mutable state_. Reactive functions are functions that consume some amount of mutable state, and produce some output _derived_ from that state. Importantly, when the state updates, the result of that function _also_ updates.

One metaphor that is often used to describe this structure is spreadsheets. You can think of a reactive function as a _formula cell_ in a spreadsheet. It references other cells and then derives a value from them, perhaps summing up a number of cells to get the total. Whenever we update one of those cells, the formula cell _automatically_ updates with the latest value.

Reactive functions work the same way - they update whenever the state they consume updates.

## Reactive Functions

Creating a reactive function is as simple as wrapping your function definition with `reactive()`:

```ts
import { reactive } from 'signalium';

const useAdd = reactive((a, b) => {
  return a + b;
});
```

You can then use your function just like any other function:

```ts
const ret = useAdd(1, 2); // 3
```

Under the hood, the `useAdd` function gets wrapped in a signal which memoizes the value, so it's only called again if the parameters passed to it (or the state accessed _by_ it, more on that later) change.

```ts
const useLog = reactive((val) => {
  console.log(val);
});

useLog(1); // 1
useLog(1); //

useLog(2); // 2
```

These signals are stored weakly, so if they are no longer in use they will be automatically cleaned up. Parameters are also diffed _semi-deeply_ - plain objects, arrays, and primitive values are deeply compared, but any kind of class instance that is not a plain object is compared via reference. This allows more complex parameters to be passed and cached, while avoiding the complexity of serializing class instances which may contain private data, circular references, and many other nuances that are hard to capture.

```ts
class Foo {
  val = 1;
}

const useLog = reactive((obj) => {
  console.log(obj.val);
});

useLog({ val: 1 }); // 1
useLog({ val: 1 }); //

useLog(new Foo()); // 1
useLog(new Foo()); // 1
```

{% callout title="Additional Info" %}

{% /callout %}

### Composition

Reactive functions can be called by other reactive functions and composed just like plain functions:

```ts
const useDivide = reactive((a, b) => a / b);

const useFloor = reactive((a) => Math.floor(a));

const useQuotient = reactive((a, b) => {
  return useFloor(useDivide(a, b));
});
```

However, you can also use plain functions inside reactive functions, and you generally should prefer to do this if the value you are deriving doesn't _need_ to be cached. These examples are fairly trivial and could all be plain functions, but the power of reactive functions really starts to shine when we start computing expensive values and/or reactive values.

### Conditional usage

Reactive functions can be called _conditionally_. They are not dependent on the runtime order remaining static, so if it changes based on some value, it will still work:

```ts
const useLeftValue = reactive(() => {
  /* */
});
const useRightValue = reactive(() => {
  /* */
});

const useQuotient = reactive((useLeft) => {
  return useLeft ? useLeftValue() : useRightValue();
});
```

This remains true even when we introduce mutable state, and even for other utilities such as `useContext` which are covered later in this guide.

### Parameter Equality

To extend the parameter diffing, you can use the `registerCustomHash` utility function. This allows you to assign a custom hashing function to a class. This function should return a unique number that represents that specific value - it can be an id, or the combined hash of several properties, or your own unique schema. The important thing is that if the returned value of the function is the same, then the two values are considered equal.

```js
import { registerCustomHash, hashValue } from 'signalium';

class Foo {
  a = 1;
  b = 2;
}

registerCustomHash(Foo, (foo) => {
  return hashValue([foo.a, foo.b]);
});

const useLog = reactive((obj) => {
  console.log(obj.val);
});

useLog(new Foo()); // 1
useLog(new Foo()); //
```

If you want to have more fine grained control over parameter equality, you can pass a `paramKey` function to the reactive function definition. This function should generate a _unique string key_ for the parameters it receives, but other than that has no constraints.

```js
class Foo {
  a = 1;
  b = 2;
}

const useLog = reactive(
  (obj) => {
    console.log(obj.a);
  },
  {
    paramKey(foo) {
      return String(foo.a) + String(foo.b);
    },
  },
);

useLog(new Foo()); // 1
useLog(new Foo()); //
```

And that wraps up all of the basic reactive functionality. To summarize:

- Use `reactive()` to define reactive functions
- Recative functions are cached based on their parameters and state
- Parameters are compared semi-deeply (POJOs, arrays, and primitives, not classes)
- Reactive functions can be called in any order, conditionally or otherwise

Ok, now lets move on to _state_.

## Mutable State

You can create a state signal using the `state` function, and access its value via the `get` and `set` methods:

```ts
const num = state(1);

console.log(num.get()); // 1

num.set(2);

console.log(num.get()); // 2
```

State signals represent _mutable root state_ in your application. Whern you access these signals inside of a reactive function, the function will be _entangled_ with that state. Whenever the state updates, the function will be invalidated and rerun the _next time_ it is used.

```ts
const useLog = reactive((signal) => {
  // we get the value of the signal, entangling it with `useLog`
  console.log(signal.get());
});

const num = state(1);

useLog(num); // 1
useLog(num); //

// updating the state causes useLog to rerun, even though we passed
// the same parameters
num.set(2);
useLog(num); // 2
```

You can pass signal values as parameters, or you can access them directly if they're in scope. The reactive function will update when the value changes, either way.

```ts
const num = state(1);

const useLog = reactive(() => {
  // we reference the state directly here rather than as a parameter
  console.log(num.get());
});

useLog(); // 1
useLog(); //

// updating the state causes useLog to rerun
num.set(2);
useLog(); // 2
```

One thing worth noting here is that we can set the state and then immediately call reactive functions that use that state, and they will update. This is generally true about Signalium - derived state and root state always reflect the latest version of state, as soon as you set it. Reactive functions won't _run_ until the next time you access them, but when you do, they will run immediately and you won't see an older version of the state.

### Signal purity

Now that we have the main pieces, we can introduce the concept of _signal-purity_. Pure signals are similar to [pure functions](https://en.wikipedia.org/wiki/Pure_function) in terms of the guarantees they give. More formally:

{% callout title="Definition: Signal-Pure" %}
We can say that a reactive function is _signal-pure_ IFF:

1. All mutable state used within the function is contained within state signals, AND
2. Given the same parameters and state signals (with the same values), it always returns the same result.

{% /callout %}

Signal purity is what allows us to reuse memoized signal values in many different places based solely on the parameters passed to them, minimizing work and maximizing flexibility.

### Indirect access

Signals can be accessed _anywhere_ inside of a reactive function. This means that you can access them directly OR indirectly, for instance by calling another function.

```ts
const num = state(1);

function logState() {
  // even though we access the state inside this plain function, `useLog`
  // will still track that it was used.
  console.log(num.get());
}

const useLog = reactive(() => {
  logState();
});
```

We call this _auto-tracking_, and this implicit entanglement it allows you to use _plain functions_ more often without having to make them "signal-aware". Consider the following example:

```js
class User {
  firstName = state('Tony');
  lastName = state('Stark');
}

const user = new User();

const useFullName = reactive(() => {
  return `${user.firstName.get()} ${user.lastName.get()}`;
});
```

In an alternative design, we could instead pass a `get` function in to `reactive()` and use that to access the value, which would make it somewhat clearer when we are consuming the values:

```js
class User {
  firstName = state('Tony');
  lastName = state('Stark');
}

const user = new User();

const useFullName = reactive((get) => {
  return `${get(user.firstName)} ${get(user.lastName)}`;
});
```

Now, we might have multiple contexts where we want to read and format a user's full name, such as on the server or in event handlers, etc. And sometimes they may or may not need reactivity. This applies to many types of functions and much business logic in apps, and it's one of the main reasons why Hooks were so effective - they preserved the ability to use _plain functions_, without needing to worry about drilling the details down or making multiple versions of the same method.

With Signalium's tracking semantics, we can also preserve this by leveraging indirect access.

```js
class User {
  _firstName = state('Tony');
  _lastName = state('Stark');

  get firstName() {
    return this._firstName.get();
  }

  set firstName(v) {
    this._firstName.set(v);
  }

  get lastName() {
    return this._lastName.get();
  }

  set lastName(v) {
    this._lastName.set(v);
  }
}

const user = new User();

const useFullName = reactive((get) => {
  return `${user.firstName} ${user.lastName}`;
});
```

In this example, the `User` class hides the details of the state signals behind getters and setters, making them appear and behave just like normal properties. However, when we call `fullName` inside of a reactive function, those states will be tracked as dependencies, and any updates to them will bust the cache.

What's important here is that `fullName` does not need to _know_ about these details. We could update our implementation to add or remove reactive properties without having to make any changes to the functions that use them. Or, we could make non-reactive versions of classes and interfaces and use them interchangeably.

```js
class ReadOnlyUser {
  firstName = 'Carol';
  lastName = 'Danvers';
}
```

This generally reduces overall boilerplate and glue code, and encourages more shared utility functions and plain-old functional JavaScript. And importantly, it means less of your code is tied to a _specific_ reactivity model, making it portable and easier to reuse with different tools.

### Laziness

Reactive functions are _lazy_ by default. They will not rerun until the next use (unless it is actively watched, covered later on). This also means that the reactive function may _not_ rerun if it was called conditionally:

```ts
// Left branch
const left = state(1);

const useLogLeft = reactive(() => {
  console.log(left.get());
});

// Right branch
const right = state(2);

const useLogRight = reactive(() => {
  console.log(right.get());
});

const logLeft = state(true);

// Function with conditional logic
const useLogConditional = reactive(() => {
  return logLeft.get() ? useLogLeft() : useLogRight();
});

// The left value is logged by default
useLogConditional(); // 1
useLogConditional(); //

// Updating the left state but not the condition,
// the left value is logged again
left.set(123);
useLogConditional(); // 123

// Updating both the condition and the state,
// the left value is _not_ logged despite being
// updated. Instead, the right value is logged
left.set(456);
logLeft.set(false);
useLogConditional(); // 2
```

This laziness allows you to avoid unnecessary work in many cases. If a value is no longer needed and no longer accessed, it does not need to be updated.

### Nested Order

In addition to laziness, reactive functions propagate updates intelligently from _inner_ to _outer_ functions. If a function recomputes but returns the _same value_, then the other functions that called it will _not_ be called again.

Consider this example that uses vanilla React hooks:

```js
const useIsGreaterThan2 = () => {
  const [value, setValue] = useState(0);
  return value > 2;
};

const useMiddleHook = () => useIsGreaterThan2();

export const useOuterHook = () => useMiddleHook();
```

Every time we call `setValue` in this example it would cause the entire function to rerun, from `useOuterHook` all the way through to `useIsGreaterThan2`. You can see this execution order by incrementing the value of the state in this visualizer. Note how the whole thing reruns each time _even when_ the value of `useIsGreaterThan2` is the same as it was before.

```js {% visualize=true wrapOutput=true reactHooks=true showCode=false %}
const useIsGreaterThan2 = () => {
  const [value, setValue] = useState(0);
  return value > 2;
};

const useMiddleHook = () => useIsGreaterThan2();

export const useOuterHook = () => useMiddleHook();
```

Reactive functions, by contrast, run in standard order the _first_ time only. For each subsequent run, they start from the _state_ that updated, and move from the innermost function toward the outermost function that consumed said state.

```js {% visualize=true wrapOutput=true %}
const value = state(0);

const useIsGreaterThan2 = reactive(() => {
  return value.get() > 2;
});

const useMiddleHook = reactive(() => useIsGreaterThan2());

export const useOuterHook = reactive(() => useMiddleHook());
```

This ensures that we are not rerunning more code than is needed on any given change. One major benefit of this behavior is that, unlike hooks, there is a _reduced_ need utilities like for `useRef` or `useCallback` since values will not be recreated _unless_ the function has actually changed.

### Minimal Re-execution

You might be wondering how we can both:

1. Guarantee that we only rerun a function if some of its child functions have changed
2. Also only rerun a function lazily if it is needed, even conditionally

For example, in this hook:

```js
const useLeftValue = reactive(() => {
  /**/
});
const useRightValue = reactive(() => {
  /**/
});
const useCurrentDirection = reactive(() => {
  /**/
});

const useValue = reactive(() => {
  return useCurrentDirection() === 'left' ? useLeftValue() : useRightValue();
});
```

You would expect the first pass to cache both `useValue` and `useLeftValue` (assuming the initial direction is `'left'`). Now let's say we made both of these changes at the same time:

1. Update `useCurrentDirection()` to `'right'`
2. Update `useLeftValue()` to any new value

Following our algorithm, you might think that both `useCurrentDirection()` and `useLeftValue()` would need to re-execute before we could rerun `useValue()`. However, this is not the case because of one last nuance: We always rerun dirty children in the _same_ order that they were cached in.

So, when we go to check `useValue()`, it first checks `useCurrentDirection()` to see if it has changed. If it _has_, then we know that our function needs to be checked, so we immediately stop checking children and we rerun `useValue()`. Because `useCurrentDirection()` has changed, we no longer execute the branch that calls `useLeftValue()`, and it does not rerun.

Now, let's start over and say that we trigger an update `useCurrentDirection()` such that it still needs to rerun, but it ends up returning `'left'` again. In this case, we know it is safe to move on and check `useLeftValue()` because:

1. All mutable state used within the reactive should be contained within a state signal.
2. Therefore, we _know_ that anything that could affect outcome of the conditional would have been called and tracked prior to `useLeftValue()`.
3. If all prior values have stayed the same, then the conditional could not have changed and `useLeftValue()` would be called again if we were to rerun the function.

Thus, `useLeftValue()` and other conditional reactives are only ever rerun if they _absolutely_ need to, ensuring maximum efficiency and minimal re-execution complexity.

### Custom equality

Both state and reactives can receive a custom `equals` function, which allows you more fine-grained control over whether or not a value is considered the same.

```js
class Foo {
  val = 123;
}

// custom equality on the state
const foo = state(new Foo(), {
  equals(a, b) {
    return a.val === b.val;
  },
});

// or on the reactive
const useFoo = reactive(
  () => {
    return foo.get();
  },
  {
    equals(a, b) {
      return a.val === b.val;
    },
  },
);
```

You can also pass `false` to say that a value should _never_ be considered equal. This can be useful if you need a reactive to run more often for some integrations or legacy compatibility, but should generally be avoided.

```js {% visualize=true wrapOutput=true %}
const value = state(0);

const useIsGreaterThan2 = reactive(
  () => {
    return value.get() > 2;
  },
  {
    equals: false,
  },
);

const useMiddleHook = reactive(() => useIsGreaterThan2(), {
  equals: false,
});

export const useOuterHook = reactive(() => useMiddleHook(), {
  equals: false,
});
```

{% callout type="warning" title="Note" %}
Passing `equals: false` does _not_ mean that any time the reactive is checked, it will rerun (e.g. it's not a "volatile" value). It just means that _if_ the reactive reruns, it will always tell its parents that it has changed. There is not a way to always rerun reactives, and there currently no plans to add one (but if you have a compelling use case, please [open an issue](https://github.com/pzuraq/signalium/) and we'll consider it!)
{% /callout %}

## Common questions

### Where does state live?

A major difference between React Hooks and Signalium is that in React, state is created by `useState` _within_ hooks. In other words, hooks can declare and manage _local_ state.

```ts
const useCustomHook = () => {
  // This creates a new variable every time we run `useCustomHook`
  const [value, setValue] = useState(0);

  // do something...
};
```

This local state is often managed with a `useEffect` or through user input via event handlers, and it is the root cause of a lot of the _complexity_ of hooks. By adding mutable state to our functions, they are no longer _pure_ functions, and we weaken the guarantees that we can make about how they will behave.

In Signalium, there is no way to declare local state inside of reactive functions. Instead, the idea is that all mutable state should live in one of 4 possible locations:

1. **In Parameters.** State can be passed to reactive functions via parameters, as we discussed above, and ultimately this means that the state will live _at the usage site_ of the reactive. In React, for instance, this would be in the _component_ that is invoking the hook (and indeed, `@signalium/react` provides `useStateSignal()` for creating these states).

   ```ts
   const useCustomHook = reactive((value) => {
     const v = value.get();

     // do something...
   });

   // In component
   const myValue = useStateSignal(123);

   const processed = useCustomHook(myValue);
   ```

2. **In Contexts.** Contexts in Signalium work much like contexts in React, and we can think of these as _implicit parameters_. If a context value changes, then the reactives that consume that context will also update and return the same output for the same input, preserving functional purity.

   ```ts
   const MyContext = createContext();

   const useCustomHook = reactive(() => {
     const v = useContext(MyContext).get();

     // do something...
   });

   const processed = withContext({ [MyContext]: state(123) }, () => {
     return useCustomHook();
   });
   ```

3. **In Subscriptions.** Subscriptions are a unique concept in Signalium, and they are covered in more depth later. For now though, you can think of a subscription as equivalent to a `useState` and `useEffect` paired together, which covers the remaining cases where state is generally needed to manage certain types of side-effecting values.

   ```ts
   const useCounter = subscription(
     (state, ms) => {
       const id = setInterval(() => state.set(state.get() + 1), ms);

       return () => clearInterval(id);
     },
     { initValue: 123 },
   );

   const useCustomHook = reactive(() => {
     const v = useCounter(1000);

     // do something...
   });
   ```

4. **Global/Module Scope.** Sometimes you need the power of a contexts for things like test isolation, providing different implementations in different scenarios, or differentiating trees. But sometimes, a value is just a global value, like a global flag or setting. In those cases it's perfectly ok for the state to live directly in a module.

   ```ts
   const value = state(123);

   const useCustomHook = reactive(() => {
     const v = state.get();

     // do something...
   });
   ```

{% callout type="warning" title="Note" %}
It is worth calling out that it is _possible_ to create state with a reactive function directly and then pass that state along to other reactive functions. However, that state will be recreated each time the reactive is rerun because there is no general purpose way to create _persistent_ state.

As we discussed before, however, reactives also rerun much _less often_ in Signalium since they only rerun if a dependency actually changed, and thus states will only be recreated when deps change. This behavior may actually be desirable in some uncommon use cases, and the pattern should not be _completely_ avoided, but it should be used with caution as it adds a fair amount of non-trivial timing complexity to a reactive.
{% /callout %}

### Can I mutate state in a reactive function?

While generally frowned upon, it is still a not an uncommon pattern in Hooks to mutate some state during the runtime of a hook. It might be in a managed `useRef` value, or via an effect that writes and propagates an update immediately. There are cases where this is necessary, but much of the time it arises due to poor data architecture or as a quick hack to get around an issue. In any case, it is problematic because it can make your code as a whole less _predictable_, it can cause infinite rerendering, and it can lead to [spooky action at a distance](<https://en.wikipedia.org/wiki/Action_at_a_distance_(computer_programming)>). But one example of when this might be useful is when you need to reset state in response to another state change:

```ts
const useCustomHook = ({ value }) => {
  const [counter, setCounter] = useState(0);

  useEffect(() => setCounter(0), [value]);
};
```

This is not the [recommended way of resetting state in React](https://react.dev/learn/preserving-and-resetting-state#resetting-state-at-the-same-position), but there are cases where it's _difficult_ to avoid for a variety of reasons.

In Signalium, this is also something that should generally be **avoided** in reactive functions for the same reasons. If you are mutating state in a reactive, consider:

1. Mutating both pieces of state in the same callback or user action (if you're here, you probably already thought about that and it's not really realistic in your use case, but it's always good to be sure).
2. "Lifting" that state to a shared context or parent component and passing it down so that everything downstream of that reactive can derive directly from it.
3. If you are resetting state whenever a value changes, leveraging the _caching_ semantics of reactive function (discussed in the previous section) to reset it by _recreating it_ instead.

That said, there is no blanket prohibition on mutating state _anywhere_ (i.e. it will not throw an assertion if you choose to do so). While strongly recommended against, if you're sure it's the best (or only) way, then nothing prevents you from doing it.

### Will Signalium ever add local state?

This is not completely out of the question! Signalium's development philosophy is to _start small_ and add primitives only when we're absolutely sure they're necessary.

Like when React first introduced Hooks, or when functional programming patterns were first being adopted by object-oriented trained developers and communities, an issue here is going to be that we find ourselves reaching for familiar patterns and tools we're used to having. Oftentimes, though, the approach you might have taken with Hooks actually has better alternatives within Signalium, and there will be an adjustment period of learning to "think in signals."

That said, if you run into a case where you are sure you need local state, and that does not have an ergonomic alternative, please [open an issue](https://github.com/pzuraq/signalium/) on the repo to discuss it in more depth! If compelling cases arise, they could make the case for adding this any other features.

## Summary

Reactive functions and state are the two most core primitives in Signalium, and together they cover almost all _synchronous_ computation. To summarize what we learned:

- Reactive Functions
  - Are cached JS functions that work just like standard functions (e.g. they can receive parameters and return values, and they're indistinguishable from a normal function from the outside).
  - Only rerun if the _parameters_ they receive are different, OR if any _state_ they access has been updated.
  - Rerun _lazily_ when they are accessed, and don't rerun if they are no longer used.
  - Rerun from _innermost_ to _outermost_ function when state has changed.
- State
  - Is created with `state('initial value')`
  - Accessed via `signal.get()`
  - Updated via `signal.set()`
  - Should live in components, contexts, subscriptions, and global/module scope.

Next, let's discuss _reactive promises_.
