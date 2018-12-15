import { MessageBot } from '@bhmb/bot'
import { UIExtensionExports } from '@bhmb/ui'
import { LogEntry } from 'blockheads-api-interface'

import Chart from 'chart.js'

import searchHtml from './search.html'

const TAB_GROUP = 'analytics'

function stripHTML(html: string): string {
  return html.replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  } as {[k: string]: string})[s] || '')
}

MessageBot.registerExtension('bibliofile/analytics', async (ex, world) => {
  const ui = ex.bot.getExports('ui') as UIExtensionExports | undefined
  if (!ui) return // Not useful in node bots

  ex.remove = () => ui.removeTabGroup(TAB_GROUP)

  ui.addTabGroup('Analytics', TAB_GROUP)
  const statsTab = ui.addTab('Statistics', TAB_GROUP)
  const playerTab = ui.addTab('Players', TAB_GROUP)

  statsTab.textContent = playerTab.textContent = 'Loading...'

  const logs = await world.getLogs(true)
  if (!logs.length) {
    ui.notify('No world logs, world not online?')
    return
  }

  const results = analyzeLogs(logs)
  const totalJoins = getTotalJoins(results.players)
  const bounceRate = calcBounceRate(results.players)
  const firstEntry = logs[0]
  const totalAccounts = Object.keys(results.players).length
  const dupAccounts = calcNumberDuplicateAccounts(results)

  // Stats tab

  statsTab.innerHTML = `<div class="container is-widescreen">
  <h3 class="subtitle">Statistics</h3>
  <p>
  Note: These statistics will only be accurate since
  ${niceDate(firstEntry.timestamp)}
  </p>
    <ul>
      <li>This server has been joined ${totalJoins} times.
      <li>${totalAccounts} accounts have joined.
      <li>Bounce rate (lower is better): ${bounceRate}
      <li>${dupAccounts} (${(dupAccounts / totalAccounts * 100).toFixed(2)} %)
        of players have more than one account.
      <li>The server last had 16 players at: ${niceDate(results.last16Time)}
    </ul>

    <div style="max-width: 90%;"></div><!--Canvas container -->
  </div>`

  const canvas = statsTab.querySelector('div')!.appendChild(document.createElement('canvas'))

  function sortIntoHours(logs: LogEntry[]): number[] {
    const hours = Array(24).fill(0)
    logs.forEach(({timestamp}) => hours[timestamp.getHours()]++)
    return hours
  }

  const lastWeekLogs = logs.filter(e => e.timestamp.getTime() > Date.now() - 1000 * 604800)
  const lastDayLogs = lastWeekLogs.filter(e => e.timestamp.getTime() > Date.now() - 1000 * 86400)

  graph(
    canvas.getContext('2d')!,
    sortIntoHours(logs),
    sortIntoHours(lastWeekLogs),
    sortIntoHours(lastDayLogs)
  )

  // Players tab
  const playerList: Array<PlayerInfo & { name: string }> = Object.keys(results.players)
    .map(name => ({...results.players[name], name}))
    .sort((a, b) => b.lastJoin.getTime() - a.lastJoin.getTime())

  playerTab.innerHTML = searchHtml
  const tbody = playerTab.querySelector('tbody')!
  const template = playerTab.querySelector('template')!

  const insertPlayer = (player: PlayerInfo & { name: string}) => {
    ui.buildTemplate(template, tbody, [
      { selector: '[data-for=name]', text: player.name },
      { selector: '[data-for=last-ip]', text: world.getPlayer(player.name).ip },
      { selector: '[data-for=last-join]', text: niceDate(player.lastJoin) },
      { selector: 'button', 'data-name': player.name },
    ])
  }

  playerList.slice(0, Math.min(100, playerList.length))
    .forEach(insertPlayer)

  playerTab.addEventListener('click', event => {
    const target = event.target as HTMLElement
    if (target.tagName !== 'BUTTON') return
    const name = target.getAttribute('data-name')!
    const safeName = stripHTML(name)
    const player = world.getPlayer(name)
    const minutesOnline = Math.floor(results.players[name].timeOnline / 1000 / 60)
    const timeOnline = minutesOnline < 60 ?
      `${minutesOnline.toFixed(0)} minutes` :
      `${(minutesOnline / 60).toFixed(2)} hours`

    const makeList = (arr: string[]): string => '<ul><li>' + arr.map(stripHTML).join('</li><li>') + '</li></ul>'

    ui.alert(`
      <div class="content">
        <strong>Name</strong>: ${safeName}<br>
        <strong>Time online</strong>: ${timeOnline}<br>
        <strong>Joins</strong>: ${results.players[name].joins}<br>
        <strong>Most recent IP</strong>: ${player.ip}<br>
        <strong>Names associated with this IP:</strong><br>
        ${makeList(results.ips[player.ip] || [])}
        <strong>All IPs:</strong><br>
        ${makeList(player.ips)}
      </div>
    `)
  })

  const input = playerTab.querySelector('input')!
  input.addEventListener('input', () => {
    // Search by name or by IP?
    const search = input.value.toLocaleUpperCase()
    const searchByName = !/^\d{1,3}\.\d/.test(search)

    while (tbody.lastChild) tbody.removeChild(tbody.lastChild)
    if (searchByName) {
      playerList
        .filter(player => player.name.includes(search))
        .filter((_, index) => index <= 100)
        .forEach(insertPlayer)
    } else {
      playerList
        .filter(player => player.ips.some(ip => ip.startsWith(search)))
        .filter((_, index) => index <= 100)
        .forEach(insertPlayer)
    }
  })
})

interface LogResults {
  ips: { [ip: string]: string[] },
  players: PlayerData,
  last16Time: Date
}

interface PlayerInfo {
  ips: string[]
  joins: number,
  lastJoin: Date,
  timeOnline: number //seconds
}

interface PlayerData {
  [name: string]: PlayerInfo
}

function analyzeLogs(logs: LogEntry[]): LogResults {
  const results: LogResults = {
    ips: {},
    players: {},
    last16Time: new Date(0)
  }
  const { ips, players } = results

  let online = 0

  logs.forEach(entry => {
    const joinInfo = getPlayerInfoFromJoin(entry)

    if (joinInfo) {
      online++

      const { name, ip } = joinInfo
      ips[ip] = ips[ip] || []
      ips[ip].includes(name) || ips[ip].push(name)

      players[name] = players[name] || {
        joins: 0, lastJoin: entry.timestamp, timeOnline: 0, ips: []
      }

      players[name].joins++
      players[name].lastJoin = entry.timestamp
      players[name].ips.includes(ip) || players[name].ips.push(ip)
    }

    const leaveInfo = getPlayerInfoFromLeave(entry)
    if (leaveInfo) {
      const name = leaveInfo
      if (!players[name]) return // Fake leave or join rolled off.
      const timeOnline = entry.timestamp.getTime() - players[name].lastJoin.getTime()
      players[name].timeOnline += timeOnline

      if (online-- === 16) {
        results.last16Time = entry.timestamp
      }
    }
  })

  return results
}

function getTotalJoins(players: PlayerData): number {
  return Object.keys(players).reduce((total, name) => {
    return total + players[name].joins
  }, 0)
}

function getPlayerInfoFromJoin(entry: LogEntry): {name: string, ip: string} | null {
  const joinMatch = entry.message.match(/ - Player Connected ([^a-z]+) \| ([\d.]+) \| .{32}$/)

  if (!joinMatch) return null
  const [ , name, ip ] = joinMatch
  return { name, ip }
}

function getPlayerInfoFromLeave({ message }: LogEntry): string | null {
  if (!message.includes(' - Player Disconnected ')) return null
  return message.substr(message.indexOf(' - Player Disconnected ') + 23)
}

function calcBounceRate(playerData: PlayerData): string {
  var rate = Object.keys(playerData)
    .map(name => playerData[name])
    .filter(player => player.joins == 1)
    .length / Object.keys(playerData).length * 100
  return rate.toFixed(2) + '%'
}

function calcNumberDuplicateAccounts(results: LogResults): number {
  const names = Object.keys(results.ips)
    .map(ip => results.ips[ip])
    .filter(names => names.length > 1)
    .reduce((all, names) => all.concat(names))

  return [...new Set(names)].length
}

function niceDate(d: Date): string {
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}

function graph(
  ctx: CanvasRenderingContext2D, all: number[], week: number[], day: number[]
) {
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'],
      datasets: [
        {
          label: 'All time',
          data: all,
          fill: false,
          borderColor: '#053075'
        },
        {
          label: 'Past week',
          data: week,
          fill: false,
          borderColor: '#053075'
        },
        {
          label: 'Past day',
          data: day,
          fill: false,
          borderColor: '#053075'
        },
      ]
    },
    options: {
      responsive: true,
      title: {
        display: true,
        text: 'Joins / Hour'
      },
      tooltips: {
        mode: 'index',
        intersect: false,
      },
      hover: {
        mode: 'nearest',
        intersect: true
      },
      scales: {
        xAxes: [{
          display: true,
          scaleLabel: {
            display: true,
            labelString: 'Hour'
          }
        }],
        yAxes: [{
          display: true,
          scaleLabel: {
            display: true,
            labelString: 'Joins'
          }
        }]
      }
    }
  })
}
