#!/usr/bin/env node
const major = Number(process.versions.node.split(".")[0])

if (major === 22) {
  process.exit(0)
}

console.error(`Tickward release checks require Node 22.x. Current Node version: ${process.version}`)
process.exit(1)
