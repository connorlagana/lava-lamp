// Metro, taught about the workspace.
//
// The core lives in packages/core and is consumed as TypeScript source, not as
// a build artefact, so Metro has to watch outside this directory and has to be
// allowed to walk up to the hoisted node_modules at the repo root. Without the
// second path a monorepo resolves react-native from the wrong place and the
// error it gives you is not about any of this.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// The web app pins React 18 and this one pins 19, so npm nests one of them.
// Hierarchical lookup is what finds the nested copy; leave it on.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
