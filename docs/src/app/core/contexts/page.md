---
title: Contexts
nextjs:
  metadata:
    title: Contexts
    description: Understanding contextual parameters in Signalium
---

Contexts are a mainstay not just of React, but of most major frameworks these days. They make a lot of sense in the world of components and DOM - provide some value for all of the children in this part of the tree. It falls naturally out of the tree-oriented data structure backing everything.

Signalium includes a notion of contexts that works much like these. A basic example looks like:

```js
import { createContext, withContexts, computed } from 'signalium';

const ApiPrefixContext = createContext('/api/');

const useUsersUrl = computed(() => {
  const prefix = useContext(ApiPrefixContext);

  return `${prefix}users`;
});

// '/api/users'
const usersUrl = useUsersUrl();

// '/api-v2/users'
const usersV2Url = withContexts({ [ApiPrefixContext]: '/api-v2/' }, () => {
  return useUsersUrl();
});
```

However, Signalium is also designed to work in many places _without_ the DOM - it can be used on the server, in background tasks and webworkers, in Node apps, and so on. Really, it can be used anywhere that you can use _plain JavaScript functions_, just making them reactive instead of a single function call.

So, how do we think of these values if we're thinking beyond the DOM tree?

## Contexts as implicits

Just like the DOM, function execution forms a tree, where each function call is a node, and its children are the functions that _it_ calls. We'll call this the callstack tree.

In this mental model, contexts can be thought of as _implicit parameters_ that are in scope for all functions below a certain part of the callstack tree. These are essentially like [contextual parameters in Scala](https://docs.scala-lang.org/tour/implicit-parameters.html) and similar functional languages.

Going all the way back to [signal purity](/core/computeds-and-state#signal-purity), we said that given the same parameters and the same signal state, a signal-pure computed is guaranteed to return the same result. In this model, contexts are simply _extra parameters_ that are accessed lazily, and so our statement about parameters also applies to them. If we run a signal in two different contexts, the results _could_ be different. But if the context is the same, then the value will be the same and we can reuse the computed instance.

Signalium manages this forking intelligently under the hood, tracking what contexts are used by a given computed directly or indirectly and ensuring it is forked if a used context is overridden.

```js
import { createContext, withContexts, computed } from 'signalium';

const LogContext = createContext('root');

const useLog = computed(() => {
  console.log(useContext(LogContext));
});

useLog(); // logs 'root'
useLog(); // does not log

withContexts({ [LogContext]: 'child' }, () => {
  useLog(); // logs 'child'
  useLog(); // does not log
});
```

## Contexts and mutable state

Contexts themselves are considered _immutable_. Like parameters, when you call a computed with a different context value, it will always create a new instance of that computed and call its function again. There's no way to update the contextual value and rerun the _same_ computed.

However, you _can_ pass signals around on contexts and used in your computeds.

```js
import { createContext, withContexts, computed, state } from 'signalium';

const apiPrefix = state('/');
const ApiPrefixContext = createContext();

const useUsersUrl = computed(() => {
  const prefix = useContext(ApiPrefixContext).get();

  return `${prefix}users`;
});

// '/api/users'
const usersUrl = useUsersUrl();

apiPrefix.set('/api-v2/');

// '/api-v2/users'
const usersUrlV2 = useUsersUrl();
```

## Summary

And that's all there is to know about contexts. Contexts are invaluable for accessing semi-global state, such as an api or database client, so while they are not _technically_ a core part of the _signals_ powering Signalium, they are a crucial component for writing signal-based apps ergonomically, and that's why they're included.
