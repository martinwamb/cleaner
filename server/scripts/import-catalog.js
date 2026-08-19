'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const workbookPath = path.resolve(process.argv[2] || path.resolve(projectRoot, '..', 'Cleaner Service Catalog.xlsx'));
const outputPath = path.resolve(process.argv[3] || path.resolve(__dirname, '../catalog-config.json'));
const scriptPath = path.resolve(__dirname, 'build_catalog_config.py');

const result = spawnSync('python', [scriptPath, workbookPath, outputPath], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(`Could not run the catalog importer: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status || 0);
