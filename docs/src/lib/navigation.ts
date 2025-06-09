export type GroupNavigationItem = {
  type: 'group';
  title: string;
  items: NavigationItem[];
};

export type LinkNavigationItem = {
  type: 'link';
  title: string;
  href: string;
};

export type NavigationItem = GroupNavigationItem | LinkNavigationItem;

const findLinkItem = (
  items: NavigationItem[],
  pathname: string,
): LinkNavigationItem | undefined => {
  for (const item of items) {
    if (item.type === 'group') {
      const result = findLinkItem(item.items, pathname);
      if (result) return result;
    } else if (item.href === pathname) {
      return item;
    }
  }
};

export const findNavigationItem = (
  pathname: string,
): LinkNavigationItem | undefined => {
  return findLinkItem(navigation, pathname);
};

const findGroupItem = (
  items: NavigationItem[],
  pathname: string,
): GroupNavigationItem | undefined => {
  for (const item of items) {
    if (item.type !== 'group') {
      continue;
    }

    if (
      item.items.some((item) => item.type === 'link' && item.href === pathname)
    ) {
      return item;
    }
  }
};

export const findNavigationParentGroup = (
  pathname: string,
): GroupNavigationItem | undefined => {
  return findGroupItem(navigation, pathname);
};

const flattenItem = (item: NavigationItem[]): LinkNavigationItem[] => {
  return item.flatMap((item) => {
    if (item.type === 'group') {
      return flattenItem(item.items);
    }
    return item;
  });
};

export const flattenNavigation = (
  navigation: NavigationItem[],
): LinkNavigationItem[] => {
  return flattenItem(navigation);
};

export const navigation: GroupNavigationItem[] = [
  {
    title: 'Introduction',
    type: 'group',
    items: [
      { type: 'link', title: 'Getting started', href: '/#getting-started' },
    ],
  },
  {
    title: 'Core concepts',
    type: 'group',
    items: [
      {
        type: 'link',
        title: 'Reactive Functions and State',
        href: '/core/reactive-functions-and-state',
      },
      {
        type: 'link',
        title: 'Reactive Promises',
        href: '/core/reactive-promises',
      },
      {
        type: 'link',
        title: 'Subscriptions and Watchers',
        href: '/core/subscriptions-and-watchers',
      },
      {
        type: 'link',
        title: 'Contexts',
        href: '/core/contexts',
      },
    ],
  },
  {
    title: 'Guides',
    type: 'group',
    items: [
      {
        type: 'link',
        title: 'Usage with React',
        href: '/guides/react',
      },
      {
        type: 'link',
        title: 'A Signals Deep Dive',
        href: '/signals-deep-dive',
      },
    ],
  },
  {
    title: 'API reference',
    type: 'group',
    items: [
      {
        type: 'group',
        title: 'signalium',
        items: [
          { type: 'link', title: 'state()', href: '/api#state' },
          {
            type: 'link',
            title: 'reactive()',
            href: '/api#reactive',
          },
          {
            type: 'link',
            title: 'task()',
            href: '/api#task',
          },
          {
            type: 'link',
            title: 'subscription()',
            href: '/api#subscription',
          },
          { type: 'link', title: 'watcher()', href: '/api#watcher' },
          {
            type: 'link',
            title: 'callback()',
            href: '/api#callback',
          },
          {
            type: 'link',
            title: 'createContext()',
            href: '/api#createContext',
          },
          {
            type: 'link',
            title: 'useContext()',
            href: '/api#use-context',
          },
          {
            type: 'link',
            title: 'withContexts()',
            href: '/api#with-contexts',
          },
          {
            type: 'link',
            title: 'isReactivePromise()',
            href: '/api#is-reactive-promise',
          },
          {
            type: 'link',
            title: 'isReactiveTask()',
            href: '/api#is-reactive-task',
          },
          {
            type: 'link',
            title: 'isReactiveSubscription()',
            href: '/api#is-reactive-subscription',
          },
          {
            type: 'link',
            title: 'hashValue()',
            href: '/api#hash-value',
          },
          {
            type: 'link',
            title: 'registerCustomHash()',
            href: '/api#register-custom-hash',
          },
        ],
      },
      {
        type: 'group',
        title: 'signalium/react',
        items: [
          {
            type: 'link',
            title: 'useStateSignal()',
            href: '/api#use-state-signal',
          },
          {
            type: 'link',
            title: 'ContextProvider',
            href: '/api#context-provider',
          },
          {
            type: 'link',
            title: 'setupReact()',
            href: '/api#setup-react',
          },
        ],
      },
    ],
  },
];
