const program = require('commander')
const { Worker } = require('worker_threads')

function printProgress(payload) {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(payload)
}

function outputHelp() {
  console.log(`
    Usage: npm run connect --camuser {USER ID} [--viewers {TOTAL_VIEWS_PER_WORKER} [--workers {WORKER_COUNT}]]

    Default TOTAL_VIEWS_PER_WORKER = 300
    Default WORKER_COUNT = 1
    
    This screen: npm run help

    Note: It is not recommended to go above 6 threads at the risk of an IP rate limit

  `)
}

program
  .name('npm run connect')
  .version(process.version || '1.0.0')
  .requiredOption('-c, --camuser <user>', 'Specify the camsoda user')
  .option('-v, --viewers <total>', 'The total amount of viewer per worker', 300)
  .option('-w, --workers <total>', 'The total amount of worker threads', 1)
  .usage('[-h][--camuser <user> [--viewers <total> [--workers <total>]]]')

async function main() {
  const args = program.parse(process.argv)
  const requiredOptionsFilled = args.camuser && args.viewers && args.workers

  if (!requiredOptionsFilled) {
    outputHelp()
    return 0
  }

  const config = {
    camUser: args.camuser,
    viewCount: parseInt(args.viewers) || 300,
    threadCount: parseInt(args.workers) || 1
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
