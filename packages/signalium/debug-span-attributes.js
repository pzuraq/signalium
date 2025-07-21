#!/usr/bin/env node

import { setTracing, createTracerFromId } from './src/trace.ts';
import { state, reactive, watcher } from './src/index.ts';

console.log('Testing span attributes and metadata...\n');

// Enable tracing
setTracing(true);
console.log('✓ Tracing enabled');

// Create a tracer
const tracer = createTracerFromId('Output-1');
console.log('✓ Created tracer with ID: Output-1\n');

// Create signals like HooksVisualizer
console.log('Creating signals like HooksVisualizer...');
const count = state(0);
console.log('✓ Created count state');

const doubled = reactive(() => count.get() * 2);
console.log('✓ Created doubled reactive');

const mainWatcher = watcher(
  () => {
    console.log('  Watcher running, accessing doubled...');
    const value = doubled.get();
    console.log(`  Doubled value: ${value}`);
    return value;
  },
  {
    id: 'Output-1',
    desc: 'Output',
    tracer,
    equals: false,
  },
);
console.log('✓ Created main watcher\n');

// Add listener to trigger initial run
console.log('Starting watcher (like HooksVisualizer component mount)...');
const unsub = mainWatcher.addListener(() => {
  console.log('  Watcher notified!');
});

// Give it a moment to run
await new Promise(resolve => setTimeout(resolve, 10));

console.log('\nTriggering state update...');
count.set(5);

await new Promise(resolve => setTimeout(resolve, 10));

// Now inspect the spans and attributes
console.log('\n--- Detailed Span Analysis ---');
const spans = tracer.getSpans();
console.log(`Total spans: ${spans.length}\n`);

spans.forEach((span, i) => {
  console.log(`Span ${i + 1}: ${span.name}`);
  console.log(`  Attributes:`);
  Object.entries(span.attributes).forEach(([key, value]) => {
    console.log(`    ${key}: ${value}`);
  });
  console.log(`  Events:`);
  span.events.forEach((event, j) => {
    console.log(`    Event ${j + 1}: ${event.name}`);
    if (event.attributes) {
      Object.entries(event.attributes).forEach(([key, value]) => {
        console.log(`      ${key}: ${value}`);
      });
    }
  });
  console.log('');
});

// Test buildVisualizerTree
import { buildVisualizerTree } from './src/trace.ts';
const traceId = spans[0]?.attributes['trace.id'];
if (traceId) {
  console.log(`--- Testing buildVisualizerTree with trace ID: ${traceId} ---`);
  const tree = buildVisualizerTree(traceId);
  if (tree) {
    console.log(`✓ Tree built! Root: ${tree.name || tree.id}`);
    console.log(`  Children: ${tree.children.length}`);
    console.log(`  State children: ${tree.stateChildren.length}`);
    tree.children.forEach((child, i) => {
      console.log(`  Child ${i + 1}: ${child.node.name || child.node.id} (type: ${child.node.type})`);
    });
  } else {
    console.log('❌ buildVisualizerTree returned null');
  }
}

console.log('\n--- Cleanup ---');
unsub();
console.log('✓ Cleaned up listener');
