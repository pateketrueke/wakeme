#!/bin/sh
':' // ; exec "$(command -v nodejs || command -v node)" "$0" "$@"
; // eslint-disable-line semi-style
'use strict';
require('./parse.js');
