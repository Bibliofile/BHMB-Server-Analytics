/*jshint
    esnext:        true,
    browser:    true,
    devel:        true,
    unused:        true,
    undef:        true,
    -W097,
    -W040
*/
/*global
    MessageBotExtension,
    Awesomplete,
    Chartist
*/

'use strict';

var biblio_analytics = MessageBotExtension('biblio_analytics');

(function(ex) {
    ex.setAutoLaunch(true);
    ex.uninstall = function() {
        //Remove tab
        ex.ui.removeTab(ex.tab);
    };

    ex.tab = ex.ui.addTab('Analytics');
    ex.tab.innerHTML = '<style>.ct-line,.ct-point{stroke:#182b73!important}.ct-area{fill:#182b73!important}#biblio_analytics_tn{width:100%;display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-flow:row wrap;flex-flow:row wrap}#biblio_analytics_tn>span{background:#182B73;color:#fff;height:40px;display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1;margin-top:5px;margin-right:5px;min-width:120px}#biblio_analytics_tn>span.selected{background:#E7E7E7;color:#000}#biblio_analytics_tc>div{display:none;height:calc(100vh - 155px);overflow-y:auto;background:#E7E7E7;padding:5px}#biblio_analytics_tc>div.visible{display:block}#biblio_analytics_tc [data-tab-name=history]>ul>li>span{width:15em;display:inline-block}#biblio_analytics_tc [data-tab-name=history]>ul>li{font-size:1em}</style><nav id=biblio_analytics_tn><span data-tab-name=server class=selected>Server Stats</span> <span data-tab-name=history>Player History</span> <span data-tab-name=search>Player Search</span></nav><div id=biblio_analytics_tc><div data-tab-name=server class=visible>Loading...</div><div data-tab-name=history>Loading...</div><div data-tab-name=search><input disabled placeholder=Loading...><div></div></div></div>';

    ex.tab.querySelector('nav').addEventListener('click', function(event) {
        var tabName = event.target.dataset.tabName;
        if (tabName) {
            //Tab nav
            document.querySelector('#biblio_analytics_tn > .selected').classList.remove('selected');
            event.target.classList.add('selected');
            //Tab content
            document.querySelector('#biblio_analytics_tc > .visible').classList.remove('visible');
            document.querySelector('#biblio_analytics_tc [data-tab-name="' + tabName + '"]').classList.add('visible');

        }
    });

    function stripHTML(html) {
        return html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&apos;')
            .replace(/"/g, '&quot;');
    }

    function installLib(path, tag, prop, extra) {
        return new Promise(function(resolve) {
            if (document.querySelector(tag + '[' + prop + '="' + path + '"]')) {
                return resolve();
            }

            var s = document.createElement(tag);
            s[prop] = path;
            if (tag == 'link') {
                s.rel = 'stylesheet';
            }

            if (extra) {
                Object.keys(extra).forEach(function(key) {
                    s[key] = extra[key];
                });
            }

            //IE -.- Otherwise just listen for s.onload & don't check readyState
            s.onreadystatechange = s.onload = function() {
                if (!s.readyState || /loaded|complete/.test(s.readyState)) {
                    return resolve();
                }
            };

            document.head.appendChild(s);
        });
    }

    installLib(
        '//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.css',
        'link',
        'href',
        {rel: 'stylesheet'}
    );
    installLib(
        '//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.css',
        'link',
        'href',
        {rel: 'stylesheet'}
    );

    var logData = {
        startTime: 0,
        joinsTotal: 0,
        last16Time: 'Never',
        onlineTime: {},
        ips: {},
        players: {}, //Format, NAME: {lastJoin: 1231231232}
        graphData: [],
    };

    Promise.all(
        [
            '//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.js',
            '//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.js'
        ].map(function(url) { return installLib(url, 'script', 'src'); })
    ).then(function() {
        return ex.api.getLogs();
    }).then(function(lines) {
        var line0 = lines[0].split(' ');
        logData.startTime = new Date(line0[0] + 'T' + line0[1] + 'Z');

        var online = {};
        var joinList = [];

        lines.forEach(function(line) {
            var player;
            var parts = line.split(' ');
            var time = new Date(parts[0] + 'T' + parts[1] + 'Z');

            if (line.includes(ex.bot.world.name + ' - Player Connected ')) {
                logData.joinsTotal++;

                player = line.substring(line.indexOf(' - Player Connected ') + 20, line.lastIndexOf('|', line.lastIndexOf('|') - 1) - 1);
                var ip = line.substring(line.lastIndexOf(' | ', line.lastIndexOf(' | ') - 1) + 3, line.lastIndexOf(' | '));

                //Build the history list
                joinList.unshift('<span>' + stripHTML(player) + '</span>' + ip + ' - ' + time.toLocaleDateString() + ' ' + time.toLocaleTimeString());

                logData.graphData.push(time.getTime());

                online[player] = time.getTime();

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
                    logData.players[player] = {lastJoin: time.getTime(), joins: 1};
                } else {
                    logData.players[player].lastJoin = time.getTime();
                    logData.players[player].joins++;
                }

            } else if (line.includes(ex.bot.world.name + ' - Player Disconnected ')) {
                player = line.substring(line.indexOf(' - Player Disconnected ') + 23);

                //Last time 16 players were on?
                if (Object.keys(online).length == 16) {
                    logData.last16Time = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
                }

                var timeSpentOnline = time.getTime() - (online[player] || time.getTime());
                delete online[player];

                logData.onlineTime[player] = (+logData.onlineTime[player] || 0) + timeSpentOnline;

                //Show history page
                ex.tab.querySelector('#biblio_analytics_tc [data-tab-name=history]').innerHTML = '<ul><li>' + joinList.join('</li><li>') + '</li></ul>';

            }
        });
        writeData();
        createSearch();
        createGraphs();
    });

    function createSearch() {
        var input = document.querySelector('#biblio_analytics_tc [data-tab-name=search] input');
        ex.awesomplete = new Awesomplete(input, {
            minChars: 1,
            maxItems: 8,
            autoFirst: false,
            list: Object.keys(logData.players).concat(Object.keys(logData.ips)),
        });

        input.removeAttribute('disabled');
        input.placeholder = 'Search for player or IP';

        input.addEventListener('blur', playerInfo);
        input.addEventListener('keyup', playerInfo);
        input.addEventListener('awesomplete-selectcomplete', playerInfo);
    }

    function createGraphs() {
        function sortLogEntries(arr) {
            var a = new Array(25).join('0').split('').map(Number);
            arr.forEach(function (el) {
                var d = (new Date(el)).getHours();
                a[d]++;
            });
            return a;
        }

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
                                return (allowed.indexOf(value) < 0) ? '' : value;
                            }
                        }
                    }],
                    ['screen and (max-width: 500px)', {
                        showPoint: false,
                        axisX: {
                            labelInterpolationFnc: function(value) {
                                var allowed = ['12am', '8am', '4pm', '11pm'];
                                return (allowed.indexOf(value) < 0) ? '' : value;
                            }
                        }
                    }]
                ]);
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
    }

    function writeData() {
        function calcNumberDuplicateAccounts() {
            var n = 0;
            Object.keys(logData.ips).forEach(function (key) {
                if (logData.ips[key].length > 1) {
                    n++;
                }
            });
            return n;
        }

        function calcBounceRate() {
            var n = 0;
            Object.keys(logData.players).forEach(function (key) {
                if (logData.players[key].joins == 1) {
                    n++;
                }
            });
            return (n / logData.joinsTotal * 100).toFixed(2) + '%';
        }

        var playersTotal = Object.keys(logData.players).length;
        var duplicateAccounts = calcNumberDuplicateAccounts();

        //Server tab html
        var h = '<p>Note: These statistics will only be accurate since ' + logData.startTime.toLocaleDateString() + ' ' + logData.startTime.toLocaleTimeString() + '<p>';
        h += '<h3>Miscellaneous Stats:</h3>';
        h += '<ul><li>This server has been joined ' + logData.joinsTotal + ' times.';
        h += '<li>' + playersTotal + ' accounts have joined this server.';
        h += '<li>' + duplicateAccounts + ' (' + (duplicateAccounts / Object.keys(logData.players).length * 100).toFixed(2) + '%) of players have more than one account.';
        h += '<li>Bounce rate (lower is better): ' + calcBounceRate();
        h += '<li>The server last had 16 players at: ' + logData.last16Time;
        h += '</ul>';
        h += '<h3>Total number of joins per hour (All time)</h3>';
        h += '<div id="biblio_analytics_graph_all" class="ct-chart"></div>';
        h += '<h3>Total number of joins per hour (Past week)</h3>';
        h += '<div id="biblio_analytics_graph_week" class="ct-chart"></div>';
        h += '<h3>Total number of joins per hour (Past day)</h3>';
        h += '<div id="biblio_analytics_graph_day" class="ct-chart"></div>';

        ex.tab.querySelector('#biblio_analytics_tc [data-tab-name=server]').innerHTML = h;
    }

    function playerInfo() {
        var h;
        var input = ex.tab.querySelector('input');
        var info = ex.tab.querySelector('#biblio_analytics_tc [data-tab-name=search] > div:last-child');
        var name = input.value.toLocaleUpperCase();
        var safeName = stripHTML(name);
        //Why was this wrapped in a try..catch?

        try {
            if (ex.bot.world.players[name]) {
                //Name found!
                h = '<h4>' + safeName + ' Info</h4>';
                h += '<span>' + safeName + ' has joined the server ' + logData.players[name].joins + ' time(s)</span><br>';
                h += '<span>' + safeName + ' has spent ' + (logData.onlineTime[name] / 1000 / 60 < 60 ? (logData.onlineTime[name] / 1000 / 60).toFixed(0) + ' minutes' : (logData.onlineTime[name] / 1000 / 60 / 60).toFixed(2) + ' hours') + ' online</span><br>';
                h += '<span>' + safeName + ' last joined the server at ' + (new Date(logData.players[name].lastJoin)).toLocaleDateString() + ' ' + (new Date(logData.players[name].lastJoin)).toLocaleTimeString() + '</span><br>';
                h += '<span>The most recently used IP is ' + ex.bot.world.players[name].ip + '</span><br>';
                h += '<span>The names asociated with this IP are:</span><ul style="padding-left:1.5em;">';
                logData.ips[ex.bot.world.players[name].ip].forEach(function(name) {
                    h += '<li>' + name;
                });
                h += '</ul>';
                h += '<span>All IPs used by this user:</span><ul style="padding-left:1.5em">';
                ex.bot.world.players[name].ips.forEach(function(ip) {
                    h += '<li>' + stripHTML(ip);
                });
                h += '</ul>';
                info.innerHTML = h;
            } else if (logData.ips[name]) {
                //IP found!
                h = '<h4>' + name + ' Info</h4>';
                h += '<span>The names asociated with this IP are:</span><ul style="padding-left:1.5em">';
                this.ips[name].forEach(function(name) {
                    h += '<li>' + name + '</li>';
                });
                h += '</ul>';
                info.innerHTML = h;
            }
        } catch (e) {
            console.error(e);
        }
    }
}(biblio_analytics));
