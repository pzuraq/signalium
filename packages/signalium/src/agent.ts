import { Tracer } from "./trace.js";
import { createTracerFromId, TracerEvent } from './trace.js';

let agentEnabled = false;

type DispatchType = 'local' | 'extension' | 'postMessage';

type DispatchEvent = {
  timestamp: number;
  event: TracerEvent;
};

export function enableTracing() {
  agentEnabled = true;
}

export function disableTracing() {
  agentEnabled = false;
}

export class SignaliumAgent {
  private events: DispatchEvent[] = [];
  private tracer: Tracer;

  constructor() {
    this.events = [];
    this.tracer = createTracerFromId('signalium-agent');
  }

  recordEvent(event: TracerEvent) {
    const dispatchEvent: DispatchEvent = {
      timestamp: Date.now(),
      event,
    };

    this.events.push(dispatchEvent);

    this.tracer.flush();
    // this.dispatch(dispatchEvent);
  }

  dispatchAll(type: DispatchType = 'extension') {
    this.events.forEach((event) => this.dispatch(event, type));
    this.events = [];
  }

  private dispatch(event: DispatchEvent, type: DispatchType = 'local') {
    switch (type) {
      case 'postMessage':
        window.postMessage({
          source: 'signalium-agent',
          type: 'SIGNALIUM_TRACE_EVENT',
          payload: {
            timestamp: event.timestamp,
            id: event.event.id,
            type: event.event.type,
          },
        }, '*');
      case 'extension':
        // we might have to use JSON.stringify in the future to send more
        // complex objects
        if (chrome && chrome.runtime) {
          chrome.runtime.sendMessage('mmenepnfidokdocacodmhmnohianaama', {
            source: 'signalium-agent',
            type: 'SIGNALIUM_TRACE_EVENT',
            payload: {
              timestamp: event.timestamp,
              id: event.event.id,
              type: event.event.type,
            },
          })
        }
        break;
      case 'local':
      default:
        console.log('dispatching event', event);
        break;
    }
  }
}

let signaliumAgentInstance: SignaliumAgent | undefined;

export function createSignaliumAgent() {
  if (!signaliumAgentInstance) {
    signaliumAgentInstance = new SignaliumAgent();
  }

  return signaliumAgentInstance;
}
