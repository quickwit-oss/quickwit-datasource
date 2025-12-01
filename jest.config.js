// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';
const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // Inform jest to transform additional node_module packages that use ESM
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, 'marked', 'react-calendar', 'get-user-locale', 'memoize', 'mimic-function', '@wojtekmaj/.*'])],
};
