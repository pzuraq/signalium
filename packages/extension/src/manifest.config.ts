import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

const { version } = packageJson;

export default defineManifest(async () => {
  return {
    name: 'Signalium',
    version,
    version_name: version,
    manifest_version: 3,
    description: 'Signalium',
    background: {
      service_worker: 'src/background/index.ts',
    },
    "externally_connectable": {
      matches: ['https://*/*', 'http://*/*'],
    },
    content_scripts: [
      {
        matches: ['https://*/*'],
        js: ['src/content/index.ts'],
      },
    ],
    icons: {
      '16': 'src/assets/icons/icon-16.svg',
      '48': 'src/assets/icons/icon-48.svg',
      '128': 'src/assets/icons/icon-128.svg',
    },
    devtools_page: 'src/devtools/devtools.html',
    permissions: ['storage'] as chrome.runtime.ManifestPermissions[],
  };
});
