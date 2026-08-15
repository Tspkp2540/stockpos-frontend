'use strict';

process.env.BROWSER = 'none';
process.argv.splice(2, 0, 'start');
require('../node_modules/react-scripts/bin/react-scripts.js');
