import type { SignaliumMessage } from '../types/index.js';
import { isSignaliumAvailable, sendMessage } from '../utils.js';

window.addEventListener('message', (event) => {
  if (event.source != window) {
    return;
  }

  console.log('content script: message', event);

//   if (event.source !== window || !event.data) {
//     return;
//   }

//   if (event.data.source === 'signalium-agent') {
//     const traceEvent = event.data.payload;

//     chrome.runtime.sendMessage({ type: 'STATE_UPDATE_FROM_PAGE', data: traceEvent });
//   }
});

// function simulateStateChange() {
//   let counter = 0;

//   const interval = setInterval(() => {
//     const message: SignaliumMessage = {
//       type: 'STATE_UPDATE_FROM_PAGE',
//       timestamp: new Date().toISOString(),
//       data: {
//         source: 'Signalium',
//       },
//       payload: {
//         id: 'signalium-agent',
//         type: 'change',
//       },
//     };

//     if (counter > 7) {
//       clearInterval(interval);
//     }

//     counter++;

//     sendMessage(message);
//   }, 3000);
// }

// if (isSignaliumAvailable()) {
//   simulateStateChange();
// }
