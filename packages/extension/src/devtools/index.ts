import Devtools from '../components/Devtools.svelte';
import '../styles.css';
import { signaliumState } from '../storage.js';
import { SignaliumMessage } from '../types/index.js';
import { createPanel, isSignaliumAvailable, renderSvelteComponent, subscribeToMessage } from '../utils.js';
import { log } from '../log.js';

createPanel({
  title: 'Signalium',
  iconPath: 'icon.png',
  htmlPagePath: 'src/devtools/devtools.html',
  callback() {
    renderSvelteComponent(Devtools, document.getElementById('app') as HTMLElement);
  },
});

// check if Signalium is available
// if (isSignaliumAvailable()) {
chrome.runtime.onMessageExternal.addListener(function (message: SignaliumMessage, sender, sendResponse) {
  console.log('devtools: externalmessage', message);

  try {
    const newState: SignaliumMessage = {
      type: 'STATE_UPDATE_FROM_PAGE',
      timestamp: message.timestamp,
    };

    signaliumState.update((state) => {
      console.log('devtools: updating signaliumState', state);
      return {
        log: [...state.log, newState],
      };
    });
  } catch (error) {
    log('Error updating signaliumState', error);
  }
});
// }

// check if Signalium is available
// if (isSignaliumAvailable()) {
// subscribeToMessage('STATE_UPDATE_FROM_PAGE', function (message, sender, sendResponse) {
//   log('devtools: received message', message);

//   try {
//     signaliumState.update((state: SignaliumMessage) => {
//       return { ...state };
//     });
//   } catch (error) {
//     log('Error updating signaliumState', error);
//   }
// });
// }
