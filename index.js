const axios = require('axios')
const tough = require('tough-cookie')
const WebSocket = require('ws')
const { Worker } = require('worker_threads')

function printProgress(payload) {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(payload)
}

function outputHelp() {
  console.log(`
    Usage: npm run connect {USER ID} {BOT_AMOUNT} [{WORKER_THREADS}]

    Default BOT_AMOUNT = 300
    Default WORKER_THREADS = 1
    
    This screen: npm run help

    Note: It is not recommended to go above 6 threads at the risk of an IP rate limit

  `)
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === 'help') {
    outputHelp()
    return 0
  }

  const config = {
    camUser: args[0],
    viewCount: args[1] || 300,
    threadCount: args[2] || 1
  }

  printProgress('Connected Bots: 0')

  let connected = 0
  const workers = []

  for (let i = 0; i < config.threadCount; ++i) {
    const worker = new Worker('./worker.js')

    worker.on('message', (message) => {
      if (message.status === 'loading') {
        connected = connected + message.incriment
      } else if (message.status === 'complete') {
        workers[message.index].working = false
      }
    })

    workers.push({
      worker,
      working: true
    })

    worker.postMessage({
      config,
      index: i
    })
  }

  await new Promise((resolve) => {
    const timeout = setInterval(() => {
      if (workers.length > 0) {
        const workingWorkers = workers.filter((worker) => worker.working === true)
        if (workingWorkers.length > 0) {
          printProgress(`Connected Bots: ${connected}`)
        } else {
          printProgress(`Connected Bots: ${connected}\n`)
          clearInterval(timeout)
          resolve()
        }
      }
    }, 500)
  })

  console.log('All bots connected.  Idle until script closed.')

  return
}

main()
