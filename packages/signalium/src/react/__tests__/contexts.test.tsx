import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { state, reactive, createContext, useContext, setRootContexts } from '../../index.js';
import { ContextProvider, setupReact, useReactive, useScope } from '../index.js';
import React, { useState } from 'react';

setupReact();

describe('React > contexts', () => {
  test('useContext works inside computed with default value', async () => {
    const value = state('Hello');
    const context = createContext(value);

    const derived = reactive(() => `${useContext(context).get()}, World`);

    function Component(): React.ReactNode {
      return <div>{useReactive(derived)}</div>;
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

      return <div>{useReactive(v)}, World</div>;
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

  test('provider inherits from root scope', async () => {
    const defaultValue1 = state('default1');
    const defaultValue2 = state('default2');
    const ctx1 = createContext(defaultValue1);
    const ctx2 = createContext(defaultValue2);
    const rootOverride1 = state('root1');
    const rootOverride2 = state('root2');

    // Set root contexts
    setRootContexts([
      [ctx1, rootOverride1],
      [ctx2, rootOverride2],
    ]);

    // Component that uses both contexts
    function Component({ testId }: { testId: string }): React.ReactNode {
      const value1 = useContext(ctx1);
      const value2 = useContext(ctx2);
      const derived = reactive(() => `${value1.get()}-${value2.get()}`);
      return <div data-testid={testId}>{useReactive(derived)}</div>;
    }
    const localOverride1 = state('local1');
    const localOverride2 = state('local2');

    // Should inherit from root scope when no local overrides
    const { getByTestId } = render(
      <>
        <ContextProvider contexts={[]}>
          <Component testId="result" />
        </ContextProvider>
        <ContextProvider contexts={[[ctx1, localOverride1]]}>
          <Component testId="result2" />
        </ContextProvider>
        <ContextProvider
          contexts={[
            [ctx1, localOverride1],
            [ctx2, localOverride2],
          ]}
        >
          <Component testId="result3" />
        </ContextProvider>
      </>,
    );

    await expect.element(getByTestId('result')).toHaveTextContent('root1-root2');

    // Should inherit from root scope for unoverridden contexts
    await expect.element(getByTestId('result2')).toHaveTextContent('local1-root2');

    // Should use local overrides when provided
    await expect.element(getByTestId('result3')).toHaveTextContent('local1-local2');

    // Changes to root contexts should be reflected in inherited contexts
    rootOverride1.set('updated-root1');
    rootOverride2.set('updated-root2');

    await expect.element(getByTestId('result')).toHaveTextContent('updated-root1-updated-root2');

    // Local overrides should remain unaffected by root context changes
    await expect.element(getByTestId('result2')).toHaveTextContent('local1-updated-root2');
    await expect.element(getByTestId('result3')).toHaveTextContent('local1-local2');
  });

  test('useContext works inside computed value passed via context provider', async () => {
    const value = state('Hello');
    const override = state('Hey');
    const context = createContext(value);

    const derived = reactive(() => `${useContext(context).get()}, World`);

    function Component(): React.ReactNode {
      return <div>{useReactive(derived)}</div>;
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

      return <div>{useReactive(v)}, World</div>;
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
