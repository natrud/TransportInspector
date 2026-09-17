const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Спостерігаємо за usim monorepo (shared package + root node_modules).
config.watchFolders = [workspaceRoot];

// Шукаємо deps спочатку локально, потім у root (через pnpm hoisted node_modules).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Заборона hierarchical resolution дає чистіший resolve-order у monorepo.
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
