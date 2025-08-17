import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { signal, reactive } from 'signalium';
import { setupReact, useReactive, useSignal } from '../index.js';
import React, { useState } from 'react';
import { userEvent } from '@vitest/browser/context';

setupReact();

describe('React > basic', () => {
  test('basic state usage works', async () => {
    const value = signal('Hello');

    function Component(): React.ReactNode {
      return <div>{useReactive(value)}</div>;
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello')).toBeInTheDocument();

    value.value = 'World';

    await expect.element(getByText('World')).toBeInTheDocument();
  });

  test('useSignal works', async () => {
    function Component(): React.ReactNode {
      const value = useSignal('Hello');

      return (
        <div>
          {useReactive(value)}
          <button onClick={() => (value.value = 'World')}>Toggle</button>
        </div>
      );
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello')).toBeInTheDocument();

    await userEvent.click(getByText('Toggle'));

    await expect.element(getByText('World')).toBeInTheDocument();
  });

  test('basic computed usage works', async () => {
    const value = signal('Hello');

    const derived = reactive(() => `${useReactive(value)}, World`);

    function Component(): React.ReactNode {
      return <div>{useReactive(derived)}</div>;
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello, World')).toBeInTheDocument();

    value.value = 'Hey';

    await expect.element(getByText('Hey, World')).toBeInTheDocument();
  });

  test('computed updates when params change', async () => {
    const value = signal('Hello');

    const derived = reactive((universe: boolean) => `${useReactive(value)}, ${universe ? 'Universe' : 'World'}`);

    function Component(): React.ReactNode {
      const [universe, setUniverse] = useState(true);

      return (
        <div>
          {useReactive(derived, universe)}
          <button onClick={() => setUniverse(!universe)}>Toggle Universe</button>
        </div>
      );
    }

    const { getByText } = render(<Component />);

    await expect.element(getByText('Hello, Universe')).toBeInTheDocument();

    value.value = 'Hey';

    await expect.element(getByText('Hey, Universe')).toBeInTheDocument();

    await userEvent.click(getByText('Toggle Universe'));

    await expect.element(getByText('Hey, World')).toBeInTheDocument();
  });
});
