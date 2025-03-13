import type { SignaliumMessage } from '../types/index.js';
import { isSignaliumAvailable, sendMessage } from '../utils.js';

function simulateStateChange() {
  let counter = 0;

  const interval = setInterval(() => {
    const message: SignaliumMessage = {
      type: 'STATE_UPDATE_FROM_PAGE',
      timestamp: new Date().toISOString(),
      data: {
        source: 'Signalium',
      },
      payload: {
        state: 'change',
      },
    };

    if (counter > 7) {
      clearInterval(interval);
    }

    counter++;

    sendMessage(message);
  }, 3000);
}

if (isSignaliumAvailable()) {
  simulateStateChange();
}
