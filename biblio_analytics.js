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

(function() {
	this.setAutoLaunch(true);

	this.addSettingsTab('Analytics');
	this.settingsTab.innerHTML = '<style>.ct-line, .ct-point {stroke:rgb(24, 43, 115) !important;} .ct-area { fill: rgb(24, 43, 115) !important;}#biblio_analytics_mt>div{height: calc(100vh - 280px);padding-top:1em;}#mb_biblio_analytics_history > ul > li > span {width: 15em;display: inline-block;}#mb_biblio_analytics_history > ul > li {font-size: 1em;}</style><nav class="botTabs" tab-contents="biblio_analytics_mt"><div tab-name="biblio_analytics_server" class="selected">Server Stats</div><div tab-name="biblio_analytics_history">Player History</div><div tab-name="biblio_analytics_search">Player Search</div></nav><div id="biblio_analytics_mt" class="tabContainer"><div id="mb_biblio_analytics_server" class="visible">Loading...</div><div id="mb_biblio_analytics_history">Loading...</div><div id="mb_biblio_analytics_search"><input id="biblio_analytics_input" placeholder="Loading..." disabled/><div id="biblio_analytics_info"></div></div></div>';
	this.settingsTab.querySelector('nav').addEventListener('click', this.bot.changeTab, false);
	this.joinsTotal = 0;
	this.last16Time = 'Never';

	this.installLib = function(path, tag) {
		var list = document.getElementsByTagName(tag);
		var i = list.length;
		while (i--) {
			if (tag == 'script') {
				if (list[i].src == path) {
					return true;
				}
			} else {
				if (list[i].href == path) {
					return true;
				}
			}
		}
		var s = document.createElement(tag);
		if (tag == 'script') {
			s.src = path;
			s.crossOrigin = true;
		} else {
			s.href = path;
			s.rel = 'stylesheet';
		}
		document.head.appendChild(s);
		return true;
	};

	this.createGraph = function(selector, data) {
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
	};

	this.lazyLoad = function () {
		function sortLogEntries(arr) {
			var a = new Array(25).join('0').split('').map(Number);
			arr.forEach(function (el) {
				var d = (new Date(el)).getHours();
				a[d]++;
			});
			return a;
		}

		if (typeof Awesomplete == 'function' && typeof Chartist == 'object' && Object.keys(this.core.players).length) {
			//Loaded all dependencies!
			//console.info("Lazy Load: True");


			var now = Date.now();

			var l0 = this.core.logs[0].split(' ');
			this.startTime = new Date(l0[0] + 'T' + l0[1] + 'Z');
			this.onlineTime = {};

			var online = {},
				joinList = [],
				graphData = [];

			this.core.logs.forEach(function (line) {
				var player;
				var parts = line.split(' ');
				var t = new Date(parts[0] + 'T' + parts[1] + 'Z');

				if (line.indexOf(this.core.worldName + ' - Player Connected ') > -1) {
					this.joinsTotal++;

					player = line.substring(line.indexOf(' - Player Connected ') + 20, line.lastIndexOf('|', line.lastIndexOf('|') - 1) - 1);
					var ip = line.substring(line.lastIndexOf(' | ', line.lastIndexOf(' | ') - 1) + 3, line.lastIndexOf(' | '));
					joinList.unshift('<span>' + this.bot.stripHTML(player) + '</span>' + ip + ' - ' + t.toLocaleDateString() + ' ' + t.toLocaleTimeString());

					graphData.push(t.getTime());

					online[player] = t.getTime();

					///Build IP list
					if (this.ips.hasOwnProperty(ip)) {
						if (this.ips[ip].indexOf(player) < 0) {
							this.ips[ip].push(player);
						}
					} else {
						this.ips[ip] = [player];
					}

					//Normally this should be avoided... but it helps keep this extension lighter weight.
					this.core.players[player].lastJoin = new Date(t.getTime());

				} else if (line.indexOf(this.core.worldName + ' - Player Disconnected ') > -1) {
					player = line.substring(line.indexOf(' - Player Disconnected ') + 23);

					if (Object.keys(online).length == 16) {
						this.last16Time = t.toLocaleDateString() + ' ' + t.toLocaleTimeString();
					}

					//Remember to handle logs starting with the server already online
					var timeSpentOnline = t.getTime() - (typeof online[player] == 'undefined' ? t.getTime() : online[player]);
					delete online[player];

					if (this.onlineTime.hasOwnProperty(player)) {
						this.onlineTime[player] += timeSpentOnline;
					} else {
						this.onlineTime[player] = timeSpentOnline;
					}
				}
			}.bind(this));

			this.writeData();

			document.getElementById('mb_biblio_analytics_history').innerHTML = '<ul><li>' + joinList.join('</li><li>') + '</li></ul>';

			this.awesomplete = new Awesomplete(document.getElementById('biblio_analytics_input'), {
				minChars: 1,
				maxItems: 8,
				autoFirst: false
			});

			this.awesomplete.list = Object.keys(this.core.players).concat(Object.keys(this.ips));

			document.getElementById('biblio_analytics_input').removeAttribute('disabled');

			this.createGraph('#biblio_analytics_graph_all', sortLogEntries(graphData));

			var thisWeekData = [];
			//Filter the graph data, get just this week.
			graphData.forEach(function (entry) {
				if (entry > now - 1000 * 60 * 60 * 24 * 7) {
					thisWeekData.push(entry);
				}
			});

			this.createGraph('#biblio_analytics_graph_week', sortLogEntries(thisWeekData));

			var thisDayData = [];

			thisWeekData.forEach(function(entry) {
				if (entry > now - 1000 * 60 * 60 * 24) {
					thisDayData.push(entry);
				}
			});

			this.createGraph('#biblio_analytics_graph_day', sortLogEntries(thisDayData));
		} else {
			setTimeout(this.lazyLoad.bind(this), 2000);
		}
	};

	this.lazyLoad.call(this);

	this.ips = {};
	this.writeData = function () {
		function calcNumberDuplicateAccounts() {
			var n = 0;
			Object.keys(this.ips).forEach((function (key) {
				if (this.ips[key].length > 1) {
					n++;
				}
			}).bind(this));
			return n;
		}

		function calcBounceRate() {
			var n = 0;
			Object.keys(this.core.players).forEach((function (key) {
				if (this.core.players[key].joins == 1) {
					n++;
				}
			}).bind(this));
			return (n / this.joinsTotal * 100).toFixed(2) + '%';
		}

		if (Object.keys(this.core.players).length === 0) {
			setTimeout(this.writeData.bind(this), 1000);
			return;
		} else {
			this.playersTotal = Object.keys(this.core.players).length;
			document.getElementById('biblio_analytics_input').placeholder = 'Search for player or IP';

			var dup = calcNumberDuplicateAccounts.call(this);
			var h = '<p>Note: These statistics will only be accurate since ' + this.startTime.toLocaleDateString() + ' ' + this.startTime.toLocaleTimeString() + '<p>';
			h += '<h3>Miscellaneous Stats:</h3>';
			h += '<ul><li>' + this.core.worldName + ' has been joined ' + this.joinsTotal + ' times.';
			h += '<li>' + Object.keys(this.core.players).length + ' accounts have joined this server.';
			h += '<li>' + dup + ' (' + (dup / Object.keys(this.core.players).length * 100).toFixed(2) + '%) of players have more than one account.';
			h += '<li>Bounce rate (lower is better): ' + calcBounceRate.call(this);
			h += '<li>The server last had 16 players at: ' + this.last16Time;
			h += '</ul>';
			h += '<h3>Total number of joins per hour (All time)</h3>';
			h += '<div id="biblio_analytics_graph_all" class="ct-chart"></div>';
			h += '<h3>Total number of joins per hour (Past week)</h3>';
			h += '<div id="biblio_analytics_graph_week" class="ct-chart"></div>';
			h += '<h3>Total number of joins per hour (Past day)</h3>';
			h += '<div id="biblio_analytics_graph_day" class="ct-chart"></div>';

			document.getElementById('mb_biblio_analytics_server').innerHTML = h;
		}
	};

	this.playerInfo = function () {
		var h,
			t = document.getElementById('biblio_analytics_input'),
			i = document.getElementById('biblio_analytics_info');
		try {
			if (typeof this.core.players[t.value] == 'object') {
				var safeName = this.bot.stripHTML(t.value);
				h = '<h4>' + safeName + ' Info</h4>';
				h += '<span>' + safeName + ' has joined the server ' + this.core.players[t.value].joins + ' time(s)</span><br>';
				h += '<span>' + safeName + ' has spent ' + (this.onlineTime[t.value] / 1000 / 60 < 60 ? (this.onlineTime[t.value] / 1000 / 60).toFixed(0) + ' minutes' : (this.onlineTime[t.value] / 1000 / 60 / 60).toFixed(2) + ' hours') + ' online</span><br>';
				h += '<span>' + safeName + ' last joined the server at ' + this.core.players[t.value].lastJoin.toLocaleDateString() + ' ' + this.core.players[t.value].lastJoin.toLocaleTimeString() + '</span><br>';
				h += '<span>The most recently used IP is ' + this.core.players[t.value].ip + '</span><br>';
				h += '<span>The names asociated with this IP are:</span><ul style="padding-left:1.5em;">';
				this.ips[this.core.players[t.value].ip].forEach(function (name) {
					h += '<li>' + name;
				});
				h += '</ul>';
				h += '<span>All IPs used by this user:</span><ul style="padding-left:1.5em">';
				this.core.players[t.value].ips.forEach(function (ip) {
					h += '<li>' + this.bot.stripHTML(ip);
				}.bind(this));
				h += '</ul>';
				i.innerHTML = h;
			} else if (typeof this.ips[t.value] == 'object') {
				h = '<h4>' + t.value + ' Info</h4>';
				h += '<span>The names asociated with this IP are:</span><ul style="padding-left:1.5em">';
				this.ips[t.value].forEach(function (name) {
					h += '<li>' + name + '</li>';
				});
				h += '</ul>';
				i.innerHTML = h;
			}
		} catch (e) {
			console.log(e);
		}
	};

	document.getElementById('biblio_analytics_input').addEventListener('blur', this.playerInfo.bind(this), false);
	document.getElementById('biblio_analytics_input').addEventListener('keyup', this.playerInfo.bind(this), false);

	this.installLib('//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.js', 'script');
	this.installLib('//cdnjs.cloudflare.com/ajax/libs/awesomplete/1.0.0/awesomplete.min.css', 'link');
	this.installLib('//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.js', 'script');
	this.installLib('//cdnjs.cloudflare.com/ajax/libs/chartist/0.9.5/chartist.min.css', 'link');
}.bind(biblio_analytics)());
