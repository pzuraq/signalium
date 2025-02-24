import withMarkdoc from '@markdoc/next.js';

import withSearch from './src/markdoc/search.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: false,
  pageExtensions: ['js', 'jsx', 'md', 'ts', 'tsx'],
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.jsx', '.tsx'],
      '.jsx': ['.jsx', '.tsx', '.js', '.ts'],
    };
    return config;
  },
};

export default withSearch(
  withMarkdoc({ schemaPath: './src/markdoc', mode: 'static' })(nextConfig),
);
