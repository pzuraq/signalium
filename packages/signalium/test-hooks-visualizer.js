import { setTracing, createTracerFromId, getMemoryExporter } from './dist/esm/debug.js';
import { state, reactive, watcher, SignalScope } from './dist/esm/index.js';

console.log('Testing HooksVisualizer pattern with OpenTelemetry...\n');

// Enable tracing like HooksVisualizer does
setTracing(true);
console.log('✓ Tracing enabled');

// Create a tracer exactly like HooksVisualizer does
const tracerId = 'Output-1';
const tracer = createTracerFromId(tracerId, true);
console.log(`✓ Created tracer with ID: ${tracerId}`);

// Set up a signal scope like HooksVisualizer does
const scope = new SignalScope([]);

// Create signals with the tracer like in the compiled HooksVisualizer code
console.log('\nCreating signals like HooksVisualizer...');

const count = state(0, { desc: 'count', tracer, scope });
console.log('✓ Created count state');

const doubled = reactive(
  () => {
    console.log('  Computing doubled...');
    return count.get() * 2;
  },
  { desc: 'doubled', tracer, scope },
);
console.log('✓ Created doubled reactive');

// Create a watcher like HooksVisualizer does for its main component
const w = watcher(
  () => {
    console.log('  Watcher running, accessing doubled...');
    const value = doubled();
    console.log(`  Doubled value: ${value}`);
    return `Doubled: ${value}`;
  },
  {
    desc: 'Output',
    id: tracerId,
    tracer,
    scope,
    equals: false,
  },
);
console.log('✓ Created main watcher');

// Start listening like HooksVisualizer does
console.log('\nStarting watcher (like HooksVisualizer component mount)...');

// First start the watcher
const watcherUnsub = w.addListener(() => {
  console.log('  Watcher notified!');
});

// Then subscribe to the tracer like RootVisualizerNode does
console.log('Subscribing to tracer like RootVisualizerNode...');
const tracerUnsub = tracer.addListener(() => {
  console.log('  Tracer notified!');
});

const unsubscribe = () => {
  watcherUnsub();
  tracerUnsub();
};

// Give it a moment to establish connections
setTimeout(() => {
  console.log('\nTriggering state update...');
  count.set(5);

  // Check results after another moment
  setTimeout(() => {
    console.log('\n--- Checking Results ---');

    const spans = tracer.getSpans();
    const allSpans = getMemoryExporter()?.getFinishedSpans() || [];

    console.log(`Spans from tracer.getSpans(): ${spans.length}`);
    console.log(`All spans in memory: ${allSpans.length}`);

    if (spans.length > 0) {
      console.log('\n✓ Spans were created:');
      spans.forEach((span, i) => {
        console.log(`  Span ${i + 1}: ${span.name}`);
        console.log(`    Signal ID: ${span.attributes['signal.id']}`);
        console.log(`    Operation: ${span.attributes['signal.operation']}`);
        console.log(`    Type: ${span.attributes['signal.type']}`);
        console.log(`    Trace ID: ${span.attributes['trace.id']}`);
      });
    } else {
      console.log('\n❌ No spans created');
    }

    // Check VisualizerNode tree
    console.log(`\n--- VisualizerNode Tree ---`);
    console.log(`Root node ID: ${tracer.rootNode.id}`);
    console.log(`Root node children: ${tracer.rootNode.children.length}`);
    console.log(`Root node version: ${tracer.rootNode.version}`);
    console.log(`Root node value: ${tracer.rootNode.value}`);

    if (tracer.rootNode.children.length > 0) {
      console.log('\n✓ Tree has children:');
      tracer.rootNode.children.forEach((child, i) => {
        const node = child.node;
        console.log(`  Child ${i + 1}: ${node.name || node.id} (${node.type})`);
        console.log(`    Value: ${node.value}`);
        console.log(`    Connected: ${child.connected}`);
        console.log(`    Children: ${node.children.length}`);
      });
    } else {
      console.log('❌ Tree is empty - this is why HooksVisualizer shows nothing');
    }

    unsubscribe();
    console.log('\n--- Analysis ---');

    if (spans.length === 0 && tracer.rootNode.children.length === 0) {
      console.log('❌ The legacy TRACER.emit() is likely not being called by signal operations');
      console.log('   This means the integration between signals and tracing is broken');
    } else if (spans.length > 0 && tracer.rootNode.children.length === 0) {
      console.log('❌ Spans are created but VisualizerNode tree is not built');
      console.log('   This means buildVisualizerTree() needs work');
    } else if (spans.length > 0 && tracer.rootNode.children.length > 0) {
      console.log('✅ Both spans and VisualizerNode tree are working!');
      console.log('   HooksVisualizer should work correctly');
    }
  }, 100);
}, 100);
