'use strict';

const hooks = require('require-extension-hooks');
hooks('ts').plugin('typescript');

module.exports = require('./twitchAFK.ts');
