import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { state, reactive, createContext, useContext } from 'signalium';
import { ContextProvider, setupReact, useScope } from '../index.js';
import React, { useState } from 'react';

setupReact();

describe('React > contexts', () => {
  test('useContext works inside computed with default value', async () => {
    const value = state('Hello');
    const context = createContext(value);

    const derived = reactive(() => `${useContext(context).get()}, World`);

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
      <ContextProvider contexts={[]}>
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

    const derived = reactive(() => `${useContext(context).get()}, World`);

    function Component(): React.ReactNode {
      return <div>{derived()}</div>;
    }

    const { getByText } = render(
      <ContextProvider contexts={[[context, override]]}>
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
      <ContextProvider contexts={[[context, override]]}>
        <Component />
      </ContextProvider>,
    );

    await expect.element(getByText('Hey, World')).toBeInTheDocument();

    override.set('Hi');

    await expect.element(getByText('Hi, World')).toBeInTheDocument();
  });

  test('useScope returns undefined outside of rendering context', async () => {
    // Direct call outside of rendering should return undefined
    expect(useScope()).toBeUndefined();

    // Inside a component during rendering, it should return the scope
    function TestComponent() {
      const scope = useScope();
      return <div data-testid="scope">{scope ? 'has-scope' : 'no-scope'}</div>;
    }

    const { getByTestId } = render(
      <ContextProvider contexts={[]}>
        <TestComponent />
      </ContextProvider>,
    );

    await expect.element(getByTestId('scope')).toHaveTextContent('has-scope');
  });
});
