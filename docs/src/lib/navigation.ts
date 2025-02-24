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
      { type: 'link', title: 'Getting started', href: '/' },
      { type: 'link', title: 'A Brief Manifesto', href: '/introduction' },
    ],
  },
  {
    title: 'Core concepts',
    type: 'group',
    items: [
      {
        type: 'link',
        title: 'Computeds and State',
        href: '/core/computeds-and-state',
      },
      {
        type: 'link',
        title: 'Async Computeds and Tasks',
        href: '/core/async-computeds-and-tasks',
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
          { type: 'link', title: 'computed()', href: '/api#computed' },
          {
            type: 'link',
            title: 'asyncComputed()',
            href: '/api#asyncComputed',
          },
          {
            type: 'link',
            title: 'asyncTask()',
            href: '/api#asyncTask',
          },
          {
            type: 'link',
            title: 'subscription()',
            href: '/api#subscription',
          },
          { type: 'link', title: 'watcher()', href: '/api#watcher' },
        ],
      },

      // {
      //   type: 'group',
      //   title: 'signalium/primitives',
      //   items: [
      //     {
      //       type: 'link',
      //       title: 'createStateSignal()',
      //       href: '/api#createStateSignal',
      //     },
      //     {
      //       type: 'link',
      //       title: 'createComputedSignal()',
      //       href: '/api#createComputedSignal',
      //     },
      //     {
      //       type: 'link',
      //       title: 'createAsyncComputedSignal()',
      //       href: '/api#createAsyncComputedSignal',
      //     },
      //     {
      //       type: 'link',
      //       title: 'createSubscriptionSignal()',
      //       href: '/api#createSubscriptionSignal',
      //     },
      //     {
      //       type: 'link',
      //       title: 'createWatcher()',
      //       href: '/api#createWatcher',
      //     },
      //   ],
      // },

      // {
      //   type: 'group',
      //   title: 'signalium/config',
      //   items: [
      //     {
      //       type: 'link',
      //       title: 'setConfig()',
      //       href: '/api#setConfig',
      //     },
      //   ],
      // },
    ],
  },
  // {
  //   title: 'Addenda',
  //   type: 'group',
  //   items: [
  //     {
  //       type: 'link',
  //       title: 'Contributing',
  //       href: '/contributing',
  //     },
  //   ],
  // },
];
