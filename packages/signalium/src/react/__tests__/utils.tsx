import React from 'react';

export interface RenderCounter<Props extends Record<string, unknown>> {
  (props: Props): React.ReactNode;
  testId: number;
  renderCount: number;
}

let CURRENT_ID = 0;

export type ComponentType<P = any> = (props: P) => React.ReactNode;
export type HOC<InProps = any, OutProps = InProps> = (Component: ComponentType<InProps>) => ComponentType<OutProps>;

/**
 * The wrapper passed to createRenderCounter is a HOC that will wrap the component
 * with additional functionality. The reason we don't pass a component directly is
 * because introducing additional components would mess with the real render counts.
 */
const EmptyWrapper: HOC = Component => props => Component(props);

export function createRenderCounter<Props extends Record<string, unknown>>(
  Component: (props: Props) => React.ReactNode,
  wrapper: HOC<Props> = EmptyWrapper,
): RenderCounter<Props> {
  const id = CURRENT_ID++;

  const RenderCounterComponent = wrapper((props: Props) => {
    RenderCounterComponent.renderCount++;

    // Call the component manually so it's not a separate React component
    const children = Component(props);

    return <div data-testid={id}>{children}</div>;
  }) as RenderCounter<Props>;

  RenderCounterComponent.testId = id;
  RenderCounterComponent.renderCount = 0;

  return RenderCounterComponent;
}
