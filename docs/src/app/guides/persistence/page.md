---
title: Persistence
nextjs:
  metadata:
    title: Persistence
    description: Persisting Signalium state across sessions
---

Signalium provides a built-in persistence mechanism that allows you to save and restore reactive state across browser sessions, app restarts, or page refreshes. This guide covers how to use the persistence APIs to create resilient applications that maintain state between sessions.

## Basic Persistence

To enable persistence, you first need to set up a persistence store and then configure your reactive functions to use it:

```tsx
import { reactive, setConfig } from 'signalium';

// Configure a persistence store
setConfig({
  persistenceStore: {
    get(key: string) {
      // Retrieve from localStorage, IndexedDB, etc.
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : undefined;
    },
    set(key: string, value: unknown) {
      // Save to localStorage, IndexedDB, etc.
      localStorage.setItem(key, JSON.stringify(value));
    },
  },
});

// Create a persisted reactive function
const getCounter = reactive(() => 0, {
  persist: {
    key: 'counter',
  },
});

// Now the value will be saved and restored across sessions
```

When you create a reactive function with the `persist` option, its value will be automatically saved whenever it changes and restored when your application starts.

## Hydration and Dehydration

For more control over how values are stored and loaded, you can provide custom hydration and dehydration functions:

```tsx
const getUserProfile = reactive(
  () => {
    return {
      name: 'John Doe',
      lastActive: new Date(),
      preferences: { theme: 'dark' },
    };
  },
  {
    persist: {
      key: 'user-profile',
      // Transform data before storing
      dehydrate: (profile) => {
        return {
          name: profile.name,
          lastActive: profile.lastActive.toISOString(),
          preferences: profile.preferences,
        };
      },
      // Transform data after loading
      hydrate: (stored) => {
        return {
          name: stored.name,
          lastActive: new Date(stored.lastActive),
          preferences: stored.preferences,
        };
      },
    },
  },
);
```

The `dehydrate` function is called when saving the value, allowing you to transform it into a format suitable for storage. The `hydrate` function is called when loading the value, allowing you to transform it back into the expected format. The only constraint on the format is that it must be serializable to JSON. The persistence layer itself should that serialization step, so it's ok return objects, arrays, or any other value that you are able to persist.

## Persistence with Parameters

Reactive functions that accept parameters will store different values for different parameter combinations:

```tsx
// This will persist different values for different user IDs
const getUserData = reactive(
  (userId: string) => {
    // Fetch user data...
    return { name: 'User ' + userId };
  },
  {
    persist: {
      key: 'user-data',
    },
  },
);

// Different calls store different values
const user1 = getUserData('user-1');
const user2 = getUserData('user-2');
```

## Persistence with Promises

Signalium also supports persisting the resolved values of asynchronous reactive functions:

```tsx
const fetchWeatherData = reactive(
  async (city: string) => {
    // Fetch weather data from API
    const response = await fetch(`/api/weather/${city}`);
    return await response.json();
  },
  {
    persist: {
      key: 'weather-data',
      // Optional transform during hydration
      hydrate: (stored) => {
        return {
          ...stored,
          lastFetched: new Date(),
        };
      },
    },
  },
);

// Weather data will be persisted once resolved
const weatherPromise = fetchWeatherData('New York');
```

When the promise resolves, the value will be persisted. When your application restarts, the persisted value will be immediately available without waiting for the async function to execute again.

## Server-Side Rendering (SSR) Hydration

The persistence API can also be used for hydrating initial state from server-side rendered responses. This is a powerful pattern for improving application performance and user experience.

### Hydrating Initial State from SSR

In a server-rendered application, you can use the persistence mechanism to transfer initial data from the server to the client:

```tsx
// On the server
import { reactive, setConfig } from 'signalium';

// Collect all the data that needs to be hydrated
const initialData = new Map();

// Create a server-side persistence store that collects data
setConfig({
  persistenceStore: {
    get: () => undefined, // Server doesn't need to read
    set: (key, value) => {
      initialData.set(key, value);
    },
  },
});

// Create and initialize your reactive functions
const getUserData = reactive(
  async (userId) => {
    // Server-side data fetching
    const data = await fetchUserDataFromDatabase(userId);
    return data;
  },
  {
    persist: {
      key: 'user-data',
    },
  },
);

// Pre-fetch and initialize all the data you need
await getUserData('current-user');

// Serialize the initial data to be sent to the client
const serializedData = JSON.stringify(Array.from(initialData.entries()));

// Include this data in your HTML response
const html = `
  <html>
    <body>
      <div id="app"><!-- App content --></div>
      <script>
        window.__INITIAL_DATA__ = ${serializedData};
      </script>
    </body>
  </html>
`;
```

Then, on the client side, you can use this pre-loaded data:

```tsx
// On the client
import { reactive, setConfig } from 'signalium';

// Set up a client-side persistence store that uses the hydrated data
const initialData = new Map(JSON.parse(window.__INITIAL_DATA__ || '[]'));

setConfig({
  persistenceStore: {
    get: (key) => {
      // First check for SSR data
      if (initialData.has(key)) {
        const value = initialData.get(key);
        initialData.delete(key); // Use it only once
        return value;
      }

      // Fall back to localStorage for subsequent loads
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : undefined;
    },
    set: (key, value) => {
      // Store in localStorage for future visits
      localStorage.setItem(key, JSON.stringify(value));
    },
  },
});

// Define the same reactive functions as on the server
const getUserData = reactive(
  async (userId) => {
    // In the client, this might not execute if data was hydrated
    const response = await fetch(`/api/users/${userId}`);
    return await response.json();
  },
  {
    persist: {
      key: 'user-data',
    },
  },
);

// This will use the pre-loaded data without making a network request
const userData = getUserData('current-user');
```

## Advanced: Dependency Tracking during Hydration

The `hydrate` function participates in reactive dependency tracking, allowing you to create dynamic hydration logic that responds to state changes:

```tsx
import { state, reactive } from 'signalium';

// A state that affects the hydration process
const currentUser = state('admin');

const getUserSettings = reactive(
  () => {
    // Fetch settings logic...
    return { theme: 'light', notifications: true };
  },
  {
    persist: {
      key: 'user-settings',
      hydrate: (stored) => {
        // This establishes a dependency on currentUser
        const user = currentUser.get();

        // Different hydration logic based on user
        if (user === 'admin') {
          return { ...stored, isAdmin: true };
        }
        return stored;
      },
    },
  },
);
```

## Creating a Custom Persistence Store

You can implement a custom persistence store by creating an object that conforms to the `PersistenceStore` interface:

```tsx
import { setConfig } from 'signalium';

// Create a custom persistence store
const customStore = {
  // Indexed DB implementation
  async get(key: string) {
    const db = await openDatabase();
    return await db.get('signalium', key);
  },

  async set(key: string, value: unknown) {
    const db = await openDatabase();
    await db.put('signalium', value, key);
  },
};

// Configure Signalium to use the custom store
setConfig({
  persistenceStore: customStore,
});
```

## Error Handling

Persistence operations are designed to be lossy and fail gracefully. If an error occurs during saving or loading, Signalium will silently continue execution without interrupting your application flow.

This makes persistence operations safe to use, but you should design your application to handle cases where persistence might fail or be unavailable (such as in private browsing).

## Best Practices

1. **Use unique keys**: Ensure your persistence keys are unique to avoid collisions between different reactive functions.

2. **Be mindful of storage limits**: Browser storage has limits, so avoid persisting large amounts of data.

3. **Consider privacy**: Don't persist sensitive information unless necessary, and consider providing options for users to clear persisted data.

4. **Handle migration**: When your data structures change, include version information and migration logic in your hydrate/dehydrate functions.

5. **Session vs. permanent storage**: Consider whether data should persist temporarily (sessionStorage) or permanently (localStorage/IndexedDB).

By implementing persistence, you can create applications that provide a seamless experience across user sessions, allowing them to pick up exactly where they left off.
