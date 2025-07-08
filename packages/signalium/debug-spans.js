import { setTracing, createTracerFromId, getMemoryExporter } from './dist/esm/debug.js';
import { state, reactive, watcher, SignalScope } from './dist/esm/index.js';

console.log('Debugging span structure...\n');

setTracing(true);
const tracerId = 'Output-1';
const tracer = createTracerFromId(tracerId, true);
const scope = new SignalScope([]);

const count = state(0, { desc: 'count', tracer, scope });
const doubled = reactive(() => count.get() * 2, { desc: 'doubled', tracer, scope });
const w = watcher(() => doubled(), { desc: 'Output', id: tracerId, tracer, scope, equals: false });

const unsubscribe = w.addListener(() => {});

setTimeout(() => {
  count.set(5);

  setTimeout(() => {
    console.log('=== DETAILED SPAN ANALYSIS ===\n');

    const spans = tracer.getSpans();

    spans.forEach((span, i) => {
      console.log(`--- Span ${i + 1} ---`);
      console.log(`Name: ${span.name}`);
      console.log(`Start time: ${span.startTime}`);
      console.log(`End time: ${span.endTime}`);
      console.log(`Status: ${JSON.stringify(span.status)}`);
      console.log(`Kind: ${span.kind}`);

      console.log(`Attributes:`);
      Object.entries(span.attributes).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });

      console.log(`Events (${span.events.length}):`);
      span.events.forEach((event, j) => {
        console.log(`  Event ${j + 1}: ${event.name}`);
        console.log(`    Time: ${event.time}`);
        if (event.attributes) {
          console.log(`    Attributes:`);
          Object.entries(event.attributes).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
          });
        }
      });

      console.log('');
    });

    unsubscribe();
  }, 100);
}, 100);
