const axios = require('axios')
const tough = require('tough-cookie')
const WebSocket = require('ws')
const { parentPort } = require('worker_threads')

const axiosCookieJarSupport = require('axios-cookiejar-support').default;

axiosCookieJarSupport(axios)
const cookieJar = new tough.CookieJar()

async function request(url = '', method = 'get', options = {}) {
  const req = axios({
    ...options,
    url,
    method,
    jar: cookieJar,
    withCredentials: true
  })
  const res = await req
  return res
}

function getCamUserWSPath(payload) {
  return new Promise((resolve, reject) => {
    let events = []

    const ws = new WebSocket('wss://node2-ord.camsoda.com:3000', {
      origin: 'https://www.camsoda.com',
      headers: {
        Cookie: `www_cs_session=${payload.config.SESSION}`,
        Pragma: 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0'
      }
    })

    ws.on('message', (message) => {
      const parsedPayload = JSON.parse(message)
      if (parsedPayload[0] === 'v3.templates' && events.length === 0) {
        events = parsedPayload[1].events
        return
      }

      const event = events[parsedPayload[0]]

      if (event === 'v3.client.version') {
        ws.send(JSON.stringify([
          'v3.authorize',
          {
            token: payload.info.USER_INFO.user.node_token,
            version: '1'
          }
        ]))
      } else if (event === 'v3.authorize.success') {
        ws.send(JSON.stringify([
          events.indexOf('v3.lobby.discover'),
          {
            room: payload.config.camUser
          }
        ]))
      } else if (event === 'v3.lobby.discovered') {
        ws.close()
        resolve(parsedPayload[1].url)
      }

      return
    })

    ws.on('error', (err) => {
      reject(err)
    })
  })
}

function connectToCamUser(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(payload.url, {
      origin: 'https://www.camsoda.com',
      headers: {
        Cookie: `www_cs_session=${payload.config.SESSION}`,
        Pragma: 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0'
      }
    })

    ws.on('open', () => {
      resolve(ws)
    })

    ws.on('error', (err) => {
      reject(err)
    })
  })
}

async function getViewerInfo(payload) {
  const initializationRequest = await request(`https://www.camsoda.com/${payload.camUser}`, 'get')
  const USER_INFO = JSON.parse(initializationRequest.data.match(/CURRENT_USER = ([^\n]+);/im)[1])
  const API_PRELOAD = JSON.parse(initializationRequest.data.match(/API_PRELOAD = ([^\n]+);/im)[1])
  const CSRF_TOKEN = initializationRequest.data.match(/\<meta name\="\_token" content\="([a-zA-Z0-9]+)"\>/im)[1]
  const SESSION = initializationRequest.headers['set-cookie']
    .filter((cookie) => cookie.indexOf('www_cs_session') !== -1)[0]
    .match(/www_cs_session\=([^;]+)/im)[1]

  return {
    USER_INFO,
    API_PRELOAD,
    CSRF_TOKEN,
    SESSION
  }
}

parentPort.on('message', async (message) => {
  const config = message.config
  const workerId = message.index

  parentPort.postMessage({
    status: 'loading',
    count: 0,
    incriment: 0
  })

  for (let count = 0; count < config.viewCount; ++count) {
    try {
      const info = await getViewerInfo(config)
      const wsRoom = await getCamUserWSPath({
        config,
        info
      })
      const camConnection = await connectToCamUser({
        config,
        info,
        url: wsRoom
      })
      camConnection.send(JSON.stringify([
        'v3.authorize',
        {
          token: info.USER_INFO.user.node_token,
          version: '1'
        }
      ]))

      parentPort.postMessage({
        status: 'loading',
        count: count + 1,
        incriment: 1,
      })
    } catch (err) {
      console.log(`\nUnable to continue worker ${workerId}`)
      console.log(`Error: ${err}`)
      break;
    }
  }

  parentPort.postMessage({
    status: 'loading',
    count: config.viewCount,
    incriment: 0,
  })

  parentPort.postMessage({
    status: 'complete',
    index: workerId
  })
})
