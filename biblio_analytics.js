/*jshint
    esversion: 6,
    browser: true,
    devel: true,
    unused: true,
    undef: true
*/
/*global
    MessageBot, SimpleEvent,
    Awesomplete,
    Chartist
*/

MessageBot.registerExtension('bibliofile/analytics', function(ex, world) {
    if (ex.isNode) return; // This extension is only useful in the browser

    var dataReady = new SimpleEvent();
    var logData = {
        startTime: 0,
        joinsTotal: 0,
        last16Time: 'Never',
        onlineTime: {},
        ips: {},
        players: {}, //Format, NAME: {lastJoin: 1231231232}
        graphData: [],
    };

    function stripHTML(html) {
        var entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };

        return html.replace(/[&<>"'`=\/]/g, function(s) {
            return entityMap[s];
        });
    }

    function insertCSS(url) {
        if (document.querySelector('link[href="' + url + '"]')) return;

        var el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = url;
        document.head.appendChild(el);
    }

    function insertJS(url, exportName) {
        if (!document.querySelector('script[src="' + url + '"]')) {
            var el = document.createElement('script');
            el.src = url;
            document.head.appendChild(el);
        }
        return new Promise(function(resolve) {
            function check() {
                if (window[exportName]) return resolve();
                setTimeout(check, 500);
            }
            check();
        });
    }

    var ui = ex.bot.getExports('ui');
    ui.addTabGroup('Analytics', 'analytics');
    var serverTab = ui.addTab('Statistics', 'analytics');
    var historyTab = ui.addTab('Player History', 'analytics');
    var searchTab = ui.addTab('Player Search', 'analytics');
    ex.uninstall = function() {
        ui.removeTabGroup('analytics');
    };

    insertCSS('//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.css');
    insertCSS('//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.css');

    serverTab.innerHTML = '<style>.ct-line,.ct-point{stroke:#182b73!important}.ct-area{fill:#182b73!important}</style><div class="container is-fluid">Loading...</div>';
    historyTab.innerHTML = '<div class="container is-fluid">Loading...</div>';
    searchTab.innerHTML = '<div class="container is-fluid"><input class="input" disabled placeholder=Loading...><div class="result"></div></div>';

    // Search for players
    dataReady.once(function createSearch() {
        var input = searchTab.querySelector('input');
        var result = searchTab.querySelector('.result');

        new Awesomplete(input, {
            minChars: 1,
            maxItems: 8,
            autoFirst: false,
            list: Object.keys(logData.players).concat(Object.keys(logData.ips)),
        });

        input.removeAttribute('disabled');
        input.placeholder = 'Search for player or IP';

        function playerInfo() {
            var player = world.getPlayer(input.value);
            var h = '';

            if (player.hasJoined()) {

                var safeName = stripHTML(player.getName());
                var minutesOnline = logData.onlineTime[player.getName()] / 1000 / 60;
                var lastJoin = new Date(logData.players[player.getName()].lastJoin);
                // Player name exists
                h = '<h4 class="subtitle">' + safeName + ' Info</h4>';
                h += '<span>' + safeName + ' has joined the server ' + player.getJoins() + ' time(s)</span><br>';
                h += '<span>' + safeName + ' has spent ' + (minutesOnline < 60 ? minutesOnline.toFixed(0) + ' minutes' : (minutesOnline / 60).toFixed(2) + ' hours') + ' online</span><br>';
                h += '<span>' + safeName + ' last joined the server at ' + lastJoin.toLocaleDateString() + ' ' + lastJoin.toLocaleTimeString() + '</span><br>';
                h += '<span>The most recently used IP is ' + player.getIP() + '</span><br>';
                h += '<span>The names associated with this IP are:</span><ul style="padding-left:1.5em;">';
                logData.ips[player.getIP()].forEach(function(name) {
                    h += '<li>' + stripHTML(name);
                });
                h += '</ul>';
                h += '<span>All IPs used by this user:</span><ul style="padding-left:1.5em">';
                player.getIPs().forEach(function(ip) {
                    h += '<li>' + stripHTML(ip);
                });
                h += '</ul>';
                result.innerHTML = h;

            } else if (logData.ips[input.value]) {

                // IP found
                h = '<h4 class="subtitle">' + input.value + ' Info</h4>';
                h += '<span>The names associated with this IP are:</span><ul style="padding-left:1.5em">';
                logData.ips[input.value].forEach(function(name) {
                    h += '<li>' + stripHTML(name) + '</li>';
                });
                h += '</ul>';
                result.innerHTML = h;
            }
        }

        input.addEventListener('blur', playerInfo);
        input.addEventListener('keyup', playerInfo);
        input.addEventListener('awesomplete-selectcomplete', playerInfo);
    });

    // Create the general info page
    dataReady.once(function createPage() {
        function calcNumberDuplicateAccounts() {
            var accounts = [];
            Object.keys(logData.ips).forEach(function (key) {
                if (logData.ips[key].length > 1) {
                    accounts = accounts.concat(logData.ips[key]);
                }
            });
            return accounts
                .filter(function(name, index) { return accounts.indexOf(name) == index; })
                .length;
        }

        function calcBounceRate() {
            var rate = Object.keys(logData.players)
                .map(function(name) { return world.getPlayer(name); })
                .filter(function(player) { return player.getJoins() == 1; })
                .length / Object.keys(logData.players).length * 100;
            return rate.toFixed(2) + '%';
        }

        var duplicateAccounts = calcNumberDuplicateAccounts();

        var h = '<p>Note: These statistics will only be accurate since ' + logData.startTime.toLocaleDateString() + ' ' + logData.startTime.toLocaleTimeString() + '<p>';
        h += '<p>If the graphs are broken resize the browser or rotate your screen to redraw.</p>';
        h += '<h3 class="title">Miscellaneous Stats:</h3>';
        h += '<ul><li>This server has been joined ' + logData.joinsTotal + ' times.';
        h += '<li>' + Object.keys(logData.players).length + ' accounts have joined this server.';
        h += '<li>' + duplicateAccounts + ' (' + (duplicateAccounts / Object.keys(logData.players).length * 100).toFixed(2) + '%) of players have more than one account.';
        h += '<li>Bounce rate (lower is better): ' + calcBounceRate();
        h += '<li>The server last had 16 players at: ' + logData.last16Time;
        h += '</ul>';
        h += '<h3 class="title">Total number of joins per hour (All time)</h3>';
        h += '<div id="biblio_analytics_graph_all" class="ct-chart"></div>';
        h += '<h3 class="title">Total number of joins per hour (Past week)</h3>';
        h += '<div id="biblio_analytics_graph_week" class="ct-chart"></div>';
        h += '<h3 class="title">Total number of joins per hour (Past day)</h3>';
        h += '<div id="biblio_analytics_graph_day" class="ct-chart"></div>';

        serverTab.querySelector('.container').innerHTML = h;
    });

    dataReady.once(function createGraphs() {
        function graph(selector, data) {
            new Chartist.Line(selector, {
                    labels: ['12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'],
                    series: [data]
                }, {
                    low: 0,
                    fullWidth: true,
                    axisX : {
                        labelOffset: {
                            x: -20,
                            y: 0
                        }
                    },
                    showArea: true
                },[
                    ['screen and (min-width: 751px) and (max-width: 1024px)', {
                        axisX: {
                            labelInterpolationFnc: function(value) {
                                return value.slice(0, -1);
                            },
                            labelOffset: {
                                x: -10,
                                y: 0
                            }
                        }
                    }],
                    ['screen and (min-width: 501px) and (max-width: 750px)', {
                        axisX: {
                            labelInterpolationFnc: function(value) {
                                var allowed = ['12am', '6am', '12pm', '6pm', '11pm'];
                                return (allowed.includes(value)) ? value : '';
                            }
                        }
                    }],
                    ['screen and (max-width: 500px)', {
                        showPoint: false,
                        axisX: {
                            labelInterpolationFnc: function(value) {
                                var allowed = ['12am', '8am', '4pm', '11pm'];
                                return (allowed.includes(value)) ? value : '';
                            }
                        }
                    }]
                ]);
        }

        function sortLogEntries(arr) {
            var a = new Array(25).join('0').split('').map(Number);
            arr.forEach(function (el) {
                var d = (new Date(el)).getHours();
                a[d]++;
            });
            return a;
        }

        var now = Date.now();

        graph('#biblio_analytics_graph_all', sortLogEntries(logData.graphData));

        var thisWeekData = [];
        //Filter the graph data, get just this week.
        logData.graphData.forEach(function (entry) {
            if (entry > now - 1000 * 60 * 60 * 24 * 7) {
                thisWeekData.push(entry);
            }
        });

        graph('#biblio_analytics_graph_week', sortLogEntries(thisWeekData));

        var thisDayData = [];

        thisWeekData.forEach(function(entry) {
            if (entry > now - 1000 * 60 * 60 * 24) {
                thisDayData.push(entry);
            }
        });

        graph('#biblio_analytics_graph_day', sortLogEntries(thisDayData));
    });

    dataReady.once(function() { dataReady = undefined; });

    Promise.all([
        insertJS('//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.js', 'Awesomplete'),
        insertJS('//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.js', 'Chartist')
    ])
    .then(function() { return world.getLogs(); })
    .then(function(logs) {
        logData.startTime = logs[0].timestamp;

        var joinList = [];
        var online = {};

        function handleJoin(message, timestamp) {
            logData.joinsTotal++;

            var player = message.substring(
                message.indexOf(' - Player Connected ') + 20, message.lastIndexOf('|', message.lastIndexOf('|') - 1) - 1
            );
            var ip = message.substring(
                message.lastIndexOf(' | ', message.lastIndexOf(' | ') - 1) + 3, message.lastIndexOf(' | ')
            );

            joinList.unshift('<span style="width:15em;display:inline-block;">' + stripHTML(player) + '</span>' + ip + ' - ' + timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString());

            logData.graphData.push(timestamp.getTime());

            online[player] = timestamp.getTime();

            //Build IP list
            if (logData.ips[ip]) {
                if (!logData.ips[ip].includes(player)) {
                    logData.ips[ip].push(player);
                }
            } else {
                logData.ips[ip] = [player];
            }

            //Save when player last joined the server
            if (!logData.players[player]) {
                logData.players[player] = {
                    lastJoin: timestamp.getTime()
                };
            } else {
                logData.players[player].lastJoin = timestamp.getTime();
            }
        }

        function handleLeave(message, timestamp) {
            var player = message.substring(message.indexOf(' - Player Disconnected ') + 23);

            //Last time 16 players were on?
            if (Object.keys(online).length == 16) {
                logData.last16Time = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString();
            }

            var timeSpentOnline = timestamp.getTime() - (online[player] || timestamp.getTime());
            delete online[player];

            logData.onlineTime[player] = (+logData.onlineTime[player] || 0) + timeSpentOnline;
        }

        logs.forEach(function(entry) {
            if (entry.message.includes(' - Player Connected ')) {
                handleJoin(entry.message, entry.timestamp);
            } else if (entry.message.includes(' - Player Disconnected ')) {
                handleLeave(entry.message, entry.timestamp);
            }
        });

        // Show the history page.
        historyTab.querySelector('.container').innerHTML = '<ul><li>' + joinList.join('</li><li>') + '</li></ul>';
        dataReady.dispatch();
    });
});
