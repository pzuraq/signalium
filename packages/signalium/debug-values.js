import { setTracing, createTracerFromId, getMemoryExporter } from './dist/esm/debug.js';
import { state, reactive, watcher, SignalScope } from './dist/esm/index.js';

console.log('Debugging span values...\n');

setTracing(true);
const tracerId = 'Output-1';
const tracer = createTracerFromId(tracerId, true);
const scope = new SignalScope([]);

const count = state(0, { desc: 'count', tracer, scope });

// Test with a watcher that returns JSX-like content
const w = watcher(
  () => {
    const countValue = count.get();
    return `Standard hooks count: ${countValue}`;
  },
  {
    desc: 'Output',
    id: tracerId,
    tracer,
    scope,
    equals: false,
  },
);

const unsubscribe = w.addListener(() => {});

setTimeout(() => {
  count.set(5);

  setTimeout(() => {
    console.log('=== VALUE ANALYSIS ===\n');

    const spans = tracer.getSpans();

    spans.forEach((span, i) => {
      console.log(`--- Span ${i + 1} ---`);
      console.log(`Signal ID: ${span.attributes['signal.id']}`);
      console.log(`Value type: ${typeof span.attributes['signal.value']}`);
      console.log(`Value: ${span.attributes['signal.value']}`);
      console.log(`Value stringified: ${String(span.attributes['signal.value'])}`);
      console.log(`Value JSON: ${JSON.stringify(span.attributes['signal.value'])}`);
      console.log('');
    });

    unsubscribe();
  }, 100);
}, 100);
