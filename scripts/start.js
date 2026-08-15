'use strict';

process.env.BROWSER = 'none';
process.argv.splice(2, 0, 'start');
require('../node_modules/@craco/craco/dist/bin/craco.js');
