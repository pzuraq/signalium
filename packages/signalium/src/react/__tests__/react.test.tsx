import { beforeEach, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { state, asyncComputed, computed, createContext, useContext } from '../../index.js';
import { ContextProvider, setupReact, useStateSignal } from '../index.js';
import React, { useState } from 'react';
import { userEvent } from '@vitest/browser/context';
import { sleep } from '../../__tests__/utils/async.js';

describe('React', () => {
  beforeEach(() => {
    setupReact();
  });

  test('basic state usage works', async () => {
    const value = state('Hello');

    function Component(): React.ReactNode {
      return <div>{value.get()}</div>;
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello')).toBeInTheDocument();

    value.set('World');

    await expect.element(getByText('World')).toBeInTheDocument();
  });

  test('useStateSignal works', async () => {
    function Component(): React.ReactNode {
      const value = useStateSignal('Hello');

      return (
        <div>
          {value.get()}
          <button onClick={() => value.set('World')}>Toggle</button>
        </div>
      );
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello')).toBeInTheDocument();

    await userEvent.click(getByText('Toggle'));

    await expect.element(getByText('World')).toBeInTheDocument();
  });

  test('basic computed usage works', async () => {
    const value = state('Hello');

    const derived = computed(() => `${value.get()}, World`);

    function Component(): React.ReactNode {
      return <div>{derived()}</div>;
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello, World')).toBeInTheDocument();

    value.set('Hey');

    await expect.element(getByText('Hey, World')).toBeInTheDocument();
  });

  test('computed updates when params change', async () => {
    const value = state('Hello');

    const derived = computed((universe: boolean) => `${value.get()}, ${universe ? 'Universe' : 'World'}`);

    function Component(): React.ReactNode {
      const [universe, setUniverse] = useState(true);

      return (
        <div>
          {derived(universe)}
          <button onClick={() => setUniverse(!universe)}>Toggle Universe</button>
        </div>
      );
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello, Universe')).toBeInTheDocument();

    value.set('Hey');

    await expect.element(getByText('Hey, Universe')).toBeInTheDocument();

    await userEvent.click(getByText('Toggle Universe'));

    await expect.element(getByText('Hey, World')).toBeInTheDocument();
  });

  test('works with async computed', async () => {
    const value = state('Hello');

    const derived = asyncComputed(async (universe: boolean) => {
      const v = value.get();
      await sleep(100);
      return `${v}, ${universe ? 'Universe' : 'World'}`;
    });

    function Component(): React.ReactNode {
      const [universe, setUniverse] = useState(true);

      const d = derived(universe);

      return (
        <div>
          {d.isSuccess ? d.result : 'Loading...'}
          <button onClick={() => setUniverse(!universe)}>Toggle Universe</button>
        </div>
      );
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Loading...')).toBeInTheDocument();
    await expect.element(getByText('Hello, Universe')).toBeInTheDocument();

    value.set('Hey');

    await expect.element(getByText('Loading...')).toBeInTheDocument();
    await expect.element(getByText('Hey, Universe')).toBeInTheDocument();

    await userEvent.click(getByText('Toggle Universe'));

    await expect.element(getByText('Loading...')).toBeInTheDocument();
    await expect.element(getByText('Hey, World')).toBeInTheDocument();
  });

  describe('contexts', () => {
    test('useContext works inside computed with default value', async () => {
      const value = state('Hello');
      const context = createContext(value);

      const derived = computed(() => `${useContext(context).get()}, World`);

      function Component(): React.ReactNode {
        return <div>{derived()}</div>;
      }

      const { getByText } = render(<Component />);

      await expect.element(getByText('Hello, World')).toBeInTheDocument();

      value.set('Hey');

      await expect.element(getByText('Hey, World')).toBeInTheDocument();
    });

    test('useContext works at root level with default value', async () => {
      const value = state('Hello');
      const context = createContext(value);

      function Component(): React.ReactNode {
        const v = useContext(context);

        return <div>{v.get()}, World</div>;
      }

      const { getByText } = render(
        <ContextProvider contexts={{}}>
          <Component />
        </ContextProvider>,
      );

      await expect.element(getByText('Hello, World')).toBeInTheDocument();

      value.set('Hey');

      await expect.element(getByText('Hey, World')).toBeInTheDocument();
    });

    test('useContext works inside computed value passed via context provider', async () => {
      const value = state('Hello');
      const override = state('Hey');
      const context = createContext(value);

      const derived = computed(() => `${useContext(context).get()}, World`);

      function Component(): React.ReactNode {
        return <div>{derived()}</div>;
      }

      const { getByText } = render(
        <ContextProvider contexts={{ [context]: override }}>
          <Component />
        </ContextProvider>,
      );

      await expect.element(getByText('Hey, World')).toBeInTheDocument();

      override.set('Hi');

      await expect.element(getByText('Hi, World')).toBeInTheDocument();
    });

    test('useContext works at root level with default value', async () => {
      const value = state('Hello');
      const override = state('Hey');
      const context = createContext(value);

      function Component(): React.ReactNode {
        const v = useContext(context);

        return <div>{v.get()}, World</div>;
      }

      const { getByText } = render(
        <ContextProvider contexts={{ [context]: override }}>
          <Component />
        </ContextProvider>,
      );

      await expect.element(getByText('Hey, World')).toBeInTheDocument();

      override.set('Hi');

      await expect.element(getByText('Hi, World')).toBeInTheDocument();
    });
  });
});
