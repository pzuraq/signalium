import { CURRENT_CONSUMER } from './consumer.js';

/* The state clock represents the global version of the current state of the
 * signal graph. Essentially if the clock hasn't changed, nothing should have
 * updated. It updates when:
 *
 * - A state signal is updated
 * - A subscription is updated _outside_ of computed running (JIT updates don't increment)
 * - A computed signal is dirtied
 * - A listener is added to a watcher, potentially reactivating and updating subscriptions
 *
 */
export let STATE_CLOCK = 0;

export const incrementStateClock = () => (CURRENT_CONSUMER === undefined ? ++STATE_CLOCK : STATE_CLOCK);
