var server = require('./lib/node-router/lib/node-router').getServer(),
		url_parse = require('url').parse,
		mongo = require('./lib/node-mongodb-native/lib/mongodb'),
		sys = require('sys');

var logger = logger || sys.puts;

var Adz = function() {
	var crs = {},
			tags = {},
			advs = {},
			pubs = {},
			winning_creatives = {};
	
	var last_update = null;

	// public methods
	var get_creative = function(req, res, cr_id) {
		//return req.url
		cr = crs[cr_id] != undefined ? crs[cr_id] : null;
		if (is_debug(req)) {
			return cr;
		} else if (is_json(req)) {
			return cr;
		} else {
			var html = "<html><head><title>" + cr.name + "</title></head><body>";
			html += build_creative(cr);
			html += "</html>"
			return html;
		}
	}

	var get_iframe = function(req, res, tag_id) {
		var cr = get_winning_creative_for_tag(tag_id);

		var html = "<html><head><body>";
		html += build_creative(cr);
		html += "</html>"
		return html;
	}

	var get_js = function(req, res, tag_id) {
		var cr = get_winning_creative_for_tag(tag_id);

		res.content_type = "text/javascript";
		return "document.write('" + build_creative(cr) + "');";
	}

	var server_info = function(req, res, match) {
		var html = '';

		num_crs = 0;
		for (var i in crs) {
			num_crs++;
		}

		html += "Creatives: " + num_crs + "<br />";
		html += "Seconds since last update: " + parseInt(((new Date()) - last_update)/1000) + "<br />";
		html += "Last update: " + last_update + "<br />";

		return html;
	}

	// helper methods 
	var get_winning_creative_for_tag = function(tag_id) {
		cr_id = winning_creatives[tag_id] != undefined ? winning_creatives[tag_id] : null;
		cr = crs[cr_id] != undefined ? crs[cr_id] : null;
		return cr;
	}

	var build_creative = function(cr) {
		var out = '';
		switch (cr.type) {
			case "image":
				out = '<a target="_blank" href="' + cr.click_url + '"><img src="' + cr.media_url + '" /></a>';
				break;
		}

		return out;
	}

	// utility methods
	var is_debug = function(req) {
		return is_query(req, 'debug');
	}

	var is_json = function(req) {
		return is_query(req, 'json');
	}

	var is_query = function(req, param) {
		if (req.parsed_querystring == null) {
			// just in case i forget what is going on here, adding parsed_querystring 
			// to req object so if this method is called more than once
			// we only have to parse once. a sort of per-request cache
			req.parsed_querystring = url_parse(req.url, true);
		}
		var parse = req.parsed_querystring;
		return parse != null && parse.query != null && parse.query[param] != undefined;
	}

	var inspect = function(obj, msg) {
		if (msg == null) {
			msg = '';
		} else {
			msg += ": ";
		}

		sys.puts(msg + sys.inspect(obj));
	}

	var update_cache = function() {
		// TODO - get a lot smarter here - only get the latest stuff, for instance
		logger("updating cache");
		var host = 'localhost',
				port = mongo.Connection.DEFAULT_PORT;

		var db = new mongo.Db('adz', new mongo.Server(host, port, {}), {});
		db.open(function(p_db) {
			db.createCollection('creatives', function(err, collection) {
				db.collection('creatives', function(err, creativeCollection) {
					creativeCollection.find(function(error, cursor) {
						cursor.each(function(err, creative) {
							if (creative != null) {
								var id = creative._id.toHexString();
								if (creative.deleted || (creative.active != null && !creative.active)) {
									delete crs[id];
								} else {
									// TODO - change this so we only pull in what we want instead of getting rid of what we don't want
									delete creative['_id'];
									delete creative['deleted'];
									creative[id] = id;
									crs[id] = creative;
								}
							}
						});
					});
				});
			});

			db.createCollection('winning_creatives', function(err, collection) {
				db.collection('winning_creatives', function(err, wcCollection) {
					wcCollection.find(function(error, cursor) {
						cursor.each(function(err, wc) {
							if (wc != null) {
								winning_creatives[wc.tag_id] = wc.creative_id;
							}
						});
					});
				});
			});
		});
		last_update = new Date();
	}

	return {
		get_creative: get_creative,
		get_iframe: get_iframe,
		get_js: get_js,
		server_info: server_info,
		update_cache: update_cache
	}
}()

server.get("/cr/(.*)$", Adz.get_creative);
server.get("/if/(.*)$", Adz.get_iframe);
server.get("/js/(.*)$", Adz.get_js);
server.get("/info", Adz.server_info);

// update the cache now and then every 1 minute
Adz.update_cache();
setInterval(function() {
	Adz.update_cache();
}, 60*1000);

server.listen(8080);
