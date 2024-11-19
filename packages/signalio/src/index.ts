let CURRENT_CONSUMER: SignalImpl<any> | null = null;
let CURRENT_CONSUMER_ORD: number = 0;
let CLOCK = 0;

export interface Signal<T = unknown> {
  get(): T;
}

export interface StateSignal<T> extends Signal<T> {
  set(value: T): void;
}

export type SignalCompute<T> = (prev: T | undefined) => T;

export type SignalEquals<T> = (prev: T, next: T) => boolean;

export interface SignalOptions<T> {
  equals?: SignalEquals<T>;
}

class SignalImpl<T> implements Signal<T>, StateSignal<T> {
  // Map from consumer signals to the ord of this signals consumption in the
  // consumer. So if this is the first signal consumed in that context, it would
  // be [ConsumerSignal, 0] for instance. Ords are used to build a priority
  // queue for updates that allows us to skip a second downward step.
  #consumers: Map<SignalImpl<any>, number> = new Map();
  #dirtyQueue: [SignalImpl<any>, number][] | boolean;
  #updatedAt: number = -1;

  #currentValue: T | undefined;
  #compute: SignalCompute<T> | undefined;
  #equals: SignalEquals<T>;

  constructor(
    isState: boolean,
    initialValue: T | undefined,
    compute: SignalCompute<T> | undefined,
    equals?: SignalEquals<T>
  ) {
    this.#dirtyQueue = !isState;
    this.#currentValue = initialValue;
    this.#compute = compute;
    this.#equals = equals ?? ((a, b) => a === b);
  }

  get(): T {
    if (CURRENT_CONSUMER !== null && !this.#consumers.has(CURRENT_CONSUMER)) {
      this.#consumers.set(CURRENT_CONSUMER, CURRENT_CONSUMER_ORD++);
    }

    this.#check();

    return this.#currentValue!;
  }

  #check(): number {
    let queue = this.#dirtyQueue;
    let updated = this.#updatedAt;

    if (queue === false) {
      return updated;
    }

    if (Array.isArray(queue)) {
      for (const [signal] of queue) {
        if (updated < signal.#check()) {
          queue = true;
          break;
        }
      }
    }

    if (queue === true) {
      const prevConsumer = CURRENT_CONSUMER;
      const prevConsumerOrd = CURRENT_CONSUMER_ORD;

      CURRENT_CONSUMER = this;
      CURRENT_CONSUMER_ORD = 0;

      try {
        const prevValue = this.#currentValue;
        const nextValue = this.#compute!(prevValue);

        if (this.#updatedAt === -1 || !this.#equals(prevValue!, nextValue)) {
          this.#currentValue = nextValue;
          this.#updatedAt = updated = CLOCK++;
        }
      } finally {
        CURRENT_CONSUMER = prevConsumer;
        CURRENT_CONSUMER_ORD = prevConsumerOrd;
      }
    } else {
      for (const [signal, ord] of queue) {
        signal.#consumers.set(this, ord);
      }
    }

    this.#dirtyQueue = false;

    return updated;
  }

  set(value: T) {
    if (this.#compute !== undefined) {
      throw new Error('Cannot set a derived signal');
    }

    if (this.#equals(value, this.#currentValue!)) {
      return;
    }

    this.#currentValue = value;

    const consumers = this.#consumers;

    for (const [consumer] of consumers) {
      consumer.#dirtyQueue = true;
      consumer.#dirty();
    }

    consumers.clear();
  }

  #dirty() {
    const consumers = this.#consumers;

    for (const [consumer, ord] of consumers) {
      let dirtyQueue = consumer.#dirtyQueue;

      if (dirtyQueue === true) {
        continue;
      } else if (dirtyQueue === false) {
        consumer.#dirtyQueue = dirtyQueue = [];
      }

      priorityQueueInsert(dirtyQueue, this, ord);

      consumer.#dirty();
    }

    consumers.clear();
  }
}

function priorityQueueInsert<T>(
  queue: [T, number][],
  value: T,
  ord: number
): void {
  let left = 0,
    right = queue.length;

  // Perform binary search to find the correct insertion index
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (queue[mid][1] < ord) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Insert the new tuple at the found index
  queue.splice(left, 0, [value, ord]);
}

export function state<T>(
  initialValue: T,
  opts?: SignalOptions<T>
): StateSignal<T> {
  return new SignalImpl(true, initialValue, undefined, opts?.equals);
}

export function computed<T>(
  compute: (prev: T | undefined) => T,
  opts?: SignalOptions<T>
): Signal<T> {
  return new SignalImpl(false, undefined, compute, opts?.equals);
}
