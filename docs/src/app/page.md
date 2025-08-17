---
title: Getting started
---

Signalium is a framework-agnostic reactivity system designed to provide fine-grained updates, predictable state management, and seamless asynchronous operations.

## Quick Start Guide

### 1. Install the library

```bash
# Using npm
npm install signalium

# Using yarn
yarn add signalium

# Using pnpm
pnpm add signalium
```

### 2. Setup the Babel transform

Signalium requires a Babel transform to enable async reactivity for the time being. Upcoming features in JavaScript will make this unnecessary in the future, but for now it's necessary if you want to track dependencies during the execution of async functions.

#### For Vite + React projects:

Add the babel plugin to your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { signaliumAsyncTransform } from 'signalium/transform';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [signaliumAsyncTransform()],
      },
    }),
  ],
});
```

#### For projects with babel.config.js:

Add the plugin to your `babel.config.js`:

```js
import { signaliumAsyncTransform } from 'signalium/transform';

module.exports = {
  presets: [
    '@babel/preset-env',
    '@babel/preset-react',
    '@babel/preset-typescript',
  ],
  plugins: [signaliumAsyncTransform()],
};
```

### 3. Setup React integration

If you're using React, you'll need to setup the React integration:

```tsx
import { setupReact } from 'signalium/react';

// Call this once at the root of your app
setupReact();
```

### 4. Add your first reactive function

Create a simple counter component:

```jsx
import { reactive } from 'signalium';
import { setupReact, useStateSignal } from '@signalium/react';

// Create a reactive function outside your component
const doubled = reactive(() => count.value * 2);

function Counter() {
  // Create a state signal inside your component
  const count = useStateSignal(0);

  return (
    <div>
      <h1>Counter: {count.value}</h1>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}

export default Counter;
```

## Learn More

{% quick-links %}

{% quick-link title="Explore core concepts" icon="presets" href="/core/reactive-functions-and-state" description="Learn the core components of Signalium-based reactivity" /%}

{% quick-link title="React integration" icon="plugins" href="/guides/react" description="Learn how to use Signalium with React" /%}

{% quick-link title="Read the theory" icon="installation" href="/signals-deep-dive" description="Take a deep dive into the thinking behind Signals and Signalium" /%}

{% quick-link title="API reference" icon="theming" href="/api" description="Check out the API docs" /%}

{% /quick-links %}

## Key Features

- **Fine-grained reactivity**: Only re-render what actually changed
- **Framework-agnostic**: Works with React, Svelte, Vue, or without a framework
- **First-class async**: Seamless handling of promises, tasks, and relays
- **Predictable state**: Signal-based state management with clear dependencies
- **Type-safe**: Full TypeScript support with excellent DX
