'use strict'

const fs = require('bare-fs')
const path = require('bare-path')
const Thread = require('bare-thread')
const bareWorker = require('bare-worker')

let scratchCounter = 0

class Worker extends bareWorker.Worker {
  constructor (entry, opts = {}) {
    if (opts && opts.eval) {
      const dir = path.join(
        __dirname,
        '.worker-scratch',
        `eval-${Bare.pid}-${Thread.id}-${scratchCounter++}`
      )
      fs.mkdirSync(dir, { recursive: true })

      const sourcePath = path.join(dir, 'source.js')
      const bootPath = path.join(dir, 'boot.cjs')
      const configPath = path.join(dir, 'boot-config.json')
      const fsShimPath = path.join(__dirname, 'bare-fs-node-shim.cjs')
      const templatePath = path.join(__dirname, 'worker-boot-template.cjs')

      fs.writeFileSync(sourcePath, entry, 'utf8')
      fs.writeFileSync(configPath, JSON.stringify({ fsShimPath, sourcePath }), 'utf8')
      fs.copyFileSync(templatePath, bootPath)

      entry = bootPath
      opts = { ...opts }
      delete opts.eval
    }

    super(entry, opts)
  }
}

module.exports = { ...bareWorker, Worker }
