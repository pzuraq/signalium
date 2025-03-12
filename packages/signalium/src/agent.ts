import { TracerEvent } from './trace.js';

let agentEnabled = false;

type DispatchType = 'local' | 'remote';

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

  constructor() {
    this.events = [];
  }

  recordEvent(event: TracerEvent) {
    if (!agentEnabled) {
      return;
    }

    const dispatchEvent: DispatchEvent = {
      timestamp: Date.now(),
      event,
    };

    // 1. Store event in local list
    this.events.push(dispatchEvent);

    debugger;
    this.dispatch(dispatchEvent);
  }

  dispatchAll(type: DispatchType = 'local') {
    if (!agentEnabled) {
      return;
    }

    this.events.forEach((event) => this.dispatch(event, type));
    this.events = [];
  }

  private dispatch(event: DispatchEvent, type: DispatchType = 'local') {
    if (!agentEnabled) {
      return;
    }

    switch (type) {
      case 'remote':
        window.postMessage({
          type: 'SIGNALIUM_TRACE_EVENT',
          payload: event,
        }, '*');
        break;
      case 'local':
      default:
        debugger;
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
