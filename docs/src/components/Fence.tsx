'use client';

import { Fragment } from 'react';
import { Highlight } from 'prism-react-renderer';
import { HooksVisualizer } from './HooksVisualizer';
import clsx from 'clsx';

export function CodeFence({
  children,
  language,
  className: customClassName,
}: {
  children: string;
  language: string;
  className?: string;
}) {
  return (
    <Highlight
      code={children.trimEnd()}
      language={language}
      theme={{ plain: {}, styles: [] }}
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre className={clsx(className, customClassName)} style={style}>
          <code>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token })} />
                  ))}
                {'\n'}
              </Fragment>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

export function Fence({
  children,
  language,
  visualize,
  showCode,
  showParams,
  showValue,
  reactHooks,
  wrapOutput,
  initialized,
}: {
  children: string;
  language: string;
  visualize?: boolean;
  showCode?: 'before' | 'after' | 'tab';
  showParams?: boolean;
  showValue?: boolean;
  reactHooks?: boolean;
  wrapOutput?: boolean;
  initialized?: boolean;
}) {
  if (visualize) {
    return (
      <HooksVisualizer
        source={children}
        showCode={showCode}
        showParams={showParams}
        showValue={showValue}
        wrapOutput={wrapOutput || language === 'js'}
        reactHooks={reactHooks}
        initialized={initialized}
      />
    );
  }

  return <CodeFence language={language}>{children}</CodeFence>;
}
