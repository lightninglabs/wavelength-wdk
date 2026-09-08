'use strict'

const fs = require('bare-fs')

const O_EXCL_BY_PLATFORM = {
  darwin: 0x0800,
  linux: 0x80,
  win32: 0x0400
}

/** @type {any} */
const constants = fs.constants

if (constants.O_EXCL === undefined) {
  const oExcl = O_EXCL_BY_PLATFORM[Bare.platform]
  if (oExcl === undefined) {
    throw new Error(
      'bare-fs-node-shim: no known O_EXCL value for ' +
      `Bare.platform=${JSON.stringify(Bare.platform)}`
    )
  }
  constants.O_EXCL = oExcl
}

module.exports = fs
