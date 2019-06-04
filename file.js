const queue = require('queue')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const Q = queue()
Q.concurrency = 4
Q.autostart = true
Q.timeout = 5000

function createDirectory(dir) {
  const pwd = path.join(ROOT, dir)
  if (!fs.existsSync(pwd)) fs.mkdirSync(pwd)

  return pwd
}

function getFullPath(dir, filename) {
  return path.join(ROOT, dir, filename)
}

function getFilename(url) {
  return url.replace(/%2F/g, '/').split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '')
}

function exists(filepath) {
  return fs.existsSync(filepath)
}

function download(url, path) {
  return new Promise(function(onDone) {
    Q.push(function () {
      console.log(`In Queue: ${Q.length}`)
      return new Promise(function(resolve) {
        console.log(`Downloading: ${url}`)
        const file = fs.createWriteStream(path)
        const request = https.get(url, (response) => {
          response.pipe(file)
          file.on('finish', () => {
            file.close(resolve)
          })
        }).on('error', (err) => {
          console.error(err.message)
          fs.unlink(resolve)
        })
      }).then(onDone)
    })
  })
}

module.exports = {
  createDirectory,
  getFullPath,
  getFilename,
  exists,
  download
}