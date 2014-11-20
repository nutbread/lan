#!/usr/bin/env node



(function () {
	"use strict";

	var fs = require("fs"),
		os = require("os"),
		net = require("net"),
		url = require("url"),
		http = require("http"),
		path = require("path"),
		version_info = [ 1 , 0 , 2 ];



	// IP tools
	var IP = (function () {

		var v4 = {
			number: 4,
			to_ints: function (ip) {
				var sep = ip.split("."),
					values = [ 0 , 0 , 0 , 0 ],
					i_max = sep.length,
					i = 0,
					last_mask, shift, v;

				// Limit length
				if (i_max >= 4) i_max = 3;
				else --i_max;

				if (i_max == 0) last_mask = 0xFFFFFFFF;
				else last_mask = (0x1 << (8 * (4 - i_max))) - 1;

				// First bytes
				for (; i < i_max; ++i) {
					values[i] = parseInt(sep[i], 10) & 0xFF;
				}
				// Last bytes
				v = (parseInt(sep[i], 10) || 0) & last_mask;
				for (; i < 4; ++i) {
					shift = (8 * (3 - i));
					values[i] = (v & (0xFF << shift)) >>> shift;
				}

				// Done
				return values;
			},
			is_local: function (ip) {
				if (typeof(ip) == "string") ip = v4.to_ints(ip);

				return (
					ip[0] == 10 || // 10.0.0.0/8
					(ip[0] == 192 && ip[1] == 168) || // 192.168.0.0/16
					(ip[0] == 172 && (ip[1] & 0xF0) == 16) // 172.16.0.0/12
				);
			},
			is_loopback: function (ip) {
				if (typeof(ip) == "string") ip = v4.to_ints(ip);

				return (
					ip[0] == 127 // 127.0.0.0/8
				);
			},
		};
		var v6 = {
			number: 6,
			to_ints: function (ip) {
				var regex = /(.*?)(:+)/ig,
					values = [ 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 ],
					groups_start = [],
					groups_end = [],
					groups = groups_start,
					i = 0,
					count = 0,
					match;

				// Get groups
				while ((match = regex.exec(ip)) !== null) {
					i = regex.lastIndex;
					if (match[1].length > 0) {
						groups.push((parseInt(match[1], 16) || 0) & 0xFFFF);
						++count;

						// Max check
						if (count >= values.length) break;
					}
					if (match[2].length > 1) groups = groups_end;
				}

				// Last group
				if (i < ip.length) groups.push((parseInt(ip.substr(i), 16) || 0) & 0xFFFF);

				// Insert
				for (i = 0; i < groups_start.length; ++i) {
					values[i] = groups_start[i];
				}
				for (i = 0; i < groups_end.length; ++i) {
					values[values.length - (i + 1)] = groups_end[groups_end.length - (i + 1)];
				}

				// Done
				return values;
			},
			is_local: function (ip) {
				if (typeof(ip) == "string") ip = v6.to_ints(ip);

				return (
					(ip[0] & 0xFE00) == 0xFC00 //fc00::/7
				);
			},
			is_loopback: function (ip) {
				if (typeof(ip) == "string") ip = v6.to_ints(ip);

				return (
					(ip[0] & 0xFFC0) == 0xFE80 || //fe80/10
					(ip[7] == 1 && ip[6] == 0 && ip[5] == 0 && ip[4] == 0 && ip[3] == 0 && ip[2] == 0 && ip[1] == 0 && ip[0] == 0) // ::1
				);
			},
		};



		return {
			v: function (ip) {
				// Get the correct functions
				return (ip.indexOf(":") < 0) ? v4 : v6;
			},
			v4: v4,
			v6: v6,
		};

	})();

	// Function to format dates
	var date_format = (function () {

		var months = [ "January" , "February" , "March" , "April" , "May" , "June" , "July" , "August" , "September" , "October" , "November" , "December" ],
			months_short = [ "Jan" , "Feb" , "Mar" , "Apr" , "May" , "Jun" , "Jul" , "Aug" , "Sep" , "Oct" , "Nov" , "Dec" ],
			days = [ "Sunday" , "Monday" , "Tuesday" , "Wednesday" , "Thursday" , "Friday" , "Saturday" ],
			days_short = [ "Sun" , "Mon" , "Tue" , "Wed" , "Thu" , "Fri" , "Sat" ],
			ordinals = [ "th" , "st" , "nd" , "rd" ],
			formatter_keys = [],
			re_formatter, k, formatters, replacement_function;

		formatters = {
			"d": function (date) { // Day of the month, 2 digits with leading zeros
				var s = date.getDate().toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"j": function (date) { // Day of the month without leading zeros
				return date.getDate().toString();
			},
			"l": function (date) { // A full textual representation of the day of the week
				return days[date.getDay()];
			},
			"D": function (date) { // A textual representation of a day, three letters
				return days_short[date.getDay()];
			},
			"S": function (date) { // English ordinal suffix for the day of the month, 2 characters
				var i = (date.getDate() - 1); // % 100
				if ((i < 10 || i > 19) && (i = i % 10) <= 3) return ordinals[i];
				return ordinals[0]
			},
			"w": function (date) { // Numeric representation of the day of the week
				return date.getDay().toString();
			},
			"F": function (date) { // A full textual representation of a month, such as January or March
				return months[date.getMonth()];
			},
			"M": function (date) { // A short textual representation of a month, three letters
				return months_short[date.getMonth()];
			},
			"m": function (date) { // Numeric representation of a month, with leading zeros
				var s = (date.getMonth() + 1).toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"n": function (date) { // Numeric representation of a month, without leading zeros
				return (date.getMonth() + 1).toString();
			},
			"y": function (date) { // Year, 2 digits
				return date.getFullYear().toString().substr(2);
			},
			"Y": function (date) { // A full numeric representation of a year, 4 digits
				return date.getFullYear().toString();
			},
			"a": function (date) { // Lowercase Ante meridiem and Post meridiem
				return (date.getHours() >= 11 && date.getHours() <= 22 ? "pm" : "am");
			},
			"A": function (date) { // Uppercase Ante meridiem and Post meridiem
				return (date.getHours() >= 11 && date.getHours() <= 22 ? "PM" : "AM");
			},
			"g": function (date) { // 12-hour format of an hour without leading zeros
				return ((date.getHours() % 12) + 1).toString();
			},
			"h": function (date) { // 12-hour format of an hour with leading zeros
				var s = ((date.getHours() % 12) + 1).toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"G": function (date) { // 24-hour format of an hour without leading zeros
				return date.getHours().toString();
			},
			"H": function (date) { // 24-hour format of an hour with leading zeros
				var s = date.getHours().toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"i": function (date) { // Minutes with leading zeros
				var s = date.getMinutes().toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"s": function (date) { // Seconds with leading zeros
				var s = date.getSeconds().toString();
				if (s.length < 2) s = "0" + s;
				return s;
			},
			"u": function (date) { // Milliseconds (note: this is different from PHP)
				var s = date.getMilliseconds().toString();
				if (s.length < 2) s = "00" + s;
				else if (s.length < 3) s = "0" + s;
				return s;
			},
		};

		for (k in formatters) formatter_keys.push(k);
		formatter_keys.sort();
		re_formatter = new RegExp("(\\\\*)([" + formatter_keys.join("").replace(/([^a-zA-Z0-9])/g, "\\$1") + "])", "g");

		replacement_function = function (formatters, date, match, esc, fmt) {
			if (esc.length > 0) {
				if ((esc.length % 2) == 1) {
					// Escaped
					return esc.substr(0, (esc.length - 1) / 2) + fmt;
				}
				// Remove some escapes
				return esc.substr(0, esc.length / 2) + formatters[fmt](date);
			}
			// Not escaped
			return formatters[fmt](date);
		};



		// Final function
		return (function (re_formatter, replacement_function, formatters, date, format) {
			// https://php.net/manual/en/function.date.php
			if (typeof(date) == "number") date = new Date(date);

			return format.replace(re_formatter, replacement_function.bind(null, formatters, date));
		}).bind(null, re_formatter, replacement_function, formatters);

	})();

	// Argument parser
	var arguments_parse = function (args, start, descriptor, flagless_argument_order, stop_after_all_flagless, return_array) {
		// Default values
		flagless_argument_order = flagless_argument_order || [];
		stop_after_all_flagless = stop_after_all_flagless || false;
		return_array = return_array || false;

		// Setup data
		var argument_values = {},
			argument_aliases_short = {},
			argument_aliases_long = {},
			errors = [],
			repr = JSON.stringify,
			i, k, v;

		for (k in descriptor) {
			v = descriptor[k];
			if ("bool" in v && v["bool"] === true) {
				argument_values[k] = false;
			}
			else {
				argument_values[k] = null;
			}

			if ("short" in v) {
				for (i = 0; i < v["short"].length; ++i) {
					argument_aliases_short[v["short"][i]] = k;
				}
			}

			if ("long" in v) {
				for (i = 0; i < v["long"].length; ++i) {
					argument_aliases_long[v["long"][i]] = k;
				}
			}
		}

		// Parse command line
		var end = args.length,
			arg, arg_key;

		while (start < end) {
			// Check
			arg = args[start];
			if (arg.length > 0 && arg[0] == "-") {
				if (arg.length == 1) {
					// Single "-"
					errors.push("Invalid argument " + repr(arg));
				}
				else {
					if (arg[1] == "-") {
						// Long argument
						arg = arg.substr(2);
						if (arg in argument_aliases_long) {
							// Set
							arg_key = argument_aliases_long[arg];
							if (argument_values[arg_key] === false || argument_values[arg_key] === true) {
								// No value
								argument_values[arg_key] = true;
							}
							else {
								if (start + 1 < end) {
									// Value
									++start;
									argument_values[arg_key] = args[start];
								}
								else {
									// Invalid
									errors.push("No value specified for flag " + repr(arg));
								}
							}

							// Remove from flagless_argument_order
							for (i = 0; i < flagless_argument_order.length; ++i) {
								if (flagless_argument_order[i] == arg_key) {
									flagless_argument_order.splice(i, 1);
									break;
								}
							}
						}
						else {
							// Invalid
							errors.push("Invalid long flag " + repr(arg));
						}
					}
					else {
						// Short argument(s)
						arg = arg.substr(1);
						arg_len = arg.length;
						for (i = 0; i < arg_len; ++i) {
							if (arg[i] in argument_aliases_short) {
								// Set
								arg_key = argument_aliases_short[arg[i]];
								if (argument_values[arg_key] === false || argument_values[arg_key] === true) {
									// No value
									argument_values[arg_key] = true;
								}
								else {
									if (i + 1 < arg_len) {
										// Trailing value
										argument_values[arg_key] = arg.substr(i + 1);
									}
									else if (start + 1 < end) {
										// Value
										++start;
										argument_values[arg_key] = args[start];
									}
									else {
										// Invalid
										errors.push("No value specified for flag " + repr(arg));
									}
									break; // Terminate loop
								}

								// Remove from flagless_argument_order
								for (i = 0; i < flagless_argument_order.length; ++i) {
									if (flagless_argument_order[i] == arg_key) {
										flagless_argument_order.splice(i, 1);
										break;
									}
								}
							}
							else {
								// Invalid
								in_str = (arg_len == 1) ? "" : " in " + repr(arg);
								errors.push("Invalid short flag " + repr(arg[i]) + in_str);
							}
						}
					}
				}
			}
			else if (flagless_argument_order.length > 0) {
				// Set
				arg_key = flagless_argument_order[0];
				if (argument_values[arg_key] === false || argument_values[arg_key] === true) {
					// No value
					argument_values[arg_key] = true;
				}
				else {
					// Value
					argument_values[arg_key] = arg;
				}

				// Remove from flagless_argument_order
				flagless_argument_order.splice(0, 1);
			}
			else {
				// Invalid
				errors.push("Invalid argument " + repr(arg));
			}

			// Next
			++start;
			if (stop_after_all_flagless && flagless_argument_order.length == 0) break; // The rest are ignored
		}



		// Return
		if (return_array) {
			return [ argument_values , errors , flagless_argument_order , start ];
		}
		else {
			return argument_values;
		}

	};

	// Escape special characters
	var html_escape_special_chars = (function () {

		var tags = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"'": "&apos;",
			'"': "&quot;",
		};

		var tags_str = [],
			re_formatter,
			k;

		for (var k in tags) tags_str.push(k);
		tags_str.sort();
		re_formatter = new RegExp("[" + tags_str.join("").replace(/([^a-zA-Z0-9])/g, "\\$1") + "]", "g");

		var replace_tag = function (tag) {
			return tags[tag];
		};

		return function (str) {
			return str.replace(re_formatter, replace_tag);
		};

	})();



	// Class for simultaneous IPv4 and IPv6 server management
	var MultiServer = (function () {

		var MultiServer = function () {
			// Create servers
			this.ipv4 = http.createServer();
			this.ipv6 = http.createServer();

			this.ipv4.on("connection", on_connection.bind(this, this.ipv4));
			this.ipv6.on("connection", on_connection.bind(this, this.ipv6));

			this.active = null;
			this.connections = [];
		};



		var on_connection = function (http_server, connection) {
			var data = {
				connection: connection,
				http_server: http_server,
			};
			this.connections.push(data);

			connection.on("close", on_connection_close.bind(this, data));
		};
		var on_connection_close = function (data, connection) {
			for (var i = 0; i < this.connections.length; ++i) {
				if (data === this.connections[i]) {
					this.connections.splice(i, 1);
					return;
				}
			}
		};

		var on_close_callback = function (state, next_callback) {
			++state.closed_count;
			if (state.closed_count >= 2) {
				// Both are closed
				on_close.call(this);

				// Next callback
				if (next_callback) next_callback.call(null, this);
			}
		};
		var on_close = function () {
		};

		var on_multiplexer = function (http_server, callback) {
			this.active = http_server;
			var ret = callback.apply(this, Array.prototype.slice.call(arguments, 2));
			this.active = null;
			return ret;
		};



		MultiServer.prototype = {
			constructor: MultiServer,

			on: function (event, callback) {
				// Events
				this.ipv4.on(event, on_multiplexer.bind(this, this.ipv4, callback));
				this.ipv6.on(event, on_multiplexer.bind(this, this.ipv6, callback));
			},
			listen: function (port, ipv4, ipv6) {
				// Listen
				this.ipv4.listen(port, ipv4);
				this.ipv6.listen(port, ipv6);
			},
			close: function (callback) {
				// Stop connections
				for (var i = 0; i < this.connections.length; ++i) {
					this.connections[i].connection.destroy();
				}

				// Close
				var state = { closed_count: 0, },
					cb = on_close_callback.bind(this, state, callback);

				try {
					this.ipv4.close(cb);
				}
				catch (e) {
					// Already closed
					cb();
				}
				try {
					this.ipv6.close(cb);
				}
				catch (e) {
					// Already closed
					cb();
				}
			},
		};



		return MultiServer;

	})();



	// LAN server
	var Server = (function () {

		var Logger = function () {
			this.streams = [];

			for (var i = 0; i < arguments.length; ++i) {
				this.streams.push(arguments[i]);
			}
		};
		Logger.prototype = {
			constructor: Logger,

			add_stream: function (stream) {
				this.streams.push(stream);
			},
			write: function (message) {
				var s = "",
					i;

				for (i = 0; i < arguments.length; ++i) {
					s += arguments[i];
				}

				for (i = 0; i < this.streams.length; ++i) {
					this.streams[i].write(s);
				}
			},
			write_event: function (event_name, event_message) {
				var s = "",
					i;

				for (i = 0; i < arguments.length; ++i) {
					s += arguments[i];
				}

				s += "\n";

				for (i = 0; i < this.streams.length; ++i) {
					this.streams[i].write(s);
				}
			},
			write_event_pretty: function (event_name, event_message) {
				var s = "",
					s_prefix = "| ",
					s_start = "/==============================================================================\n",
					s_end = "\n\\==============================================================================\n",
					i;

				for (i = 0; i < arguments.length; ++i) {
					s += arguments[i];
				}

				s = s_start + s_prefix + s.replace(/\n$/, "").replace(/\n/g, "\n" + s_prefix) + s_end;

				for (i = 0; i < this.streams.length; ++i) {
					this.streams[i].write(s);
				}
			},
		};



		var Server = function () {
			// Logging setup
			this.logger = new Logger(process.stdout);
			this.log = this.logger.write.bind(this.logger);
			this.log_event = this.logger.write_event.bind(this.logger);

			// Server setup
			this.mserver = new MultiServer();

			this.index_filenames = [ "index.html" ];
			this.base_file_directory = __dirname;
			this.server_port = 80;

			// Mime types
			this.mime_types = {
				".html": "text/html",
				".bmp": "image/bmp",
				".jpg": "image/jpeg",
				".jpeg": "image/jpeg",
				".png": "image/png",
				".js": "text/javascript",
				".css": "text/css",
				".txt": "text/plain",
			};
			this.mime_type_default = "text/plain";
			this.mime_type_error = "text/plain";
		};



		// Data
		var re_no_dots = /^[\\\/]*(\.{1,2}([\\\/]+|$))*|[\\\/]+$/g;
		var re_no_sep = (path.sep == "/" ? null : new RegExp(path.sep.replace(/([^a-zA-Z0-9])/g, "\\$1"), "g"));

		// Request callbacks
		var on_request = function (req, res) {
			// Connection setup
			var time = new Date(),
				con = req.connection,
				filter_error = filter_connection.call(this, con),
				request_url = req.url,
				request_filename = path.normalize(decodeURIComponent(url.parse(request_url, true).pathname)).replace(re_no_dots, ""),
				request_url_normalized = (re_no_sep === null ? request_filename : request_filename.replace(re_no_sep, "/")),
				ipv_local = IP.v(con.localAddress).number,
				ipv_remote = IP.v(con.remoteAddress).number,
				repr = JSON.stringify,
				log_msg;

			// Info
			log_msg = [
				"Incoming request",
				"  Time: " + date_format(time, "Y-m-d @ H:i:s.u"),
				"  From: " + (ipv_remote == 6 ? "[" : "") + con.remoteAddress + (ipv_remote == 6 ? "]" : "") + ":" + con.remotePort,
				"    To: " + (ipv_local == 6 ? "[" : "") + con.localAddress + (ipv_local == 6 ? "]" : "") + ":" + con.localPort,
				"   For: " + repr("/" + request_url_normalized) + " (original=" + repr(request_url) + ")",
			];

			// Disconnect?
			if (filter_error !== null) {
				log_msg.push("  Connection terminated: " + filter_error);
				this.log_event(log_msg.join("\n") + "\n");
				req.connection.destroy();
				return;
			}



			// Exists
			var request_filename_absolute = path.join(this.base_file_directory, request_filename);
			fs.lstat(request_filename_absolute, on_request_file_lstat.bind(this, req, res, request_url_normalized, request_filename_absolute, log_msg));
		};
		var on_request_file_lstat = function (req, res, url_normalized, filename_absolute, log_msg, error, stats) {
			if (error === null) {
				if (stats.isDirectory()) {
					// Display directory
					fs.readdir(filename_absolute, on_request_readdir.bind(this, req, res, url_normalized, filename_absolute, log_msg));
					return;
				}
				else if (stats.isFile()) {
					// Does exist
					on_request_showfile.call(this, req, res, url_normalized, filename_absolute, log_msg, filename_absolute, stats);
					return;
				}
			}

			// Else, error
			on_request_404.call(this, req, res, url_normalized, filename_absolute, log_msg);
		};
		var on_request_readdir = function (req, res, url_normalized, filename_absolute, log_msg, error, files) {
			if (error === null) {
				// Check for index
				var i, j;
				for (i = 0; i < this.index_filenames.length; ++i) {
					for (j = 0; j < files.length; ++j) {
						if (this.index_filenames[i] == files[j]) {
							// Show an index file instead
							on_request_showfile.call(this, req, res, url_normalized, filename_absolute, log_msg, path.join(filename_absolute, files[j]), null);
							return;
						}
					}
				}

				// Files
				var ext = ".html",
					mime_type = (ext in this.mime_types) ? this.mime_types[ext] : this.mime_type_default,
					status = 200,
					headers = default_headers.call(this, {
						"Content-Type": mime_type,
						"Content-Security-Policy": "default-src * 'unsafe-inline'; script-src 'none'; frame-src 'none'; object-src 'none'",
					}),
					dir_text = [],
					file_text = [],
					text_list, full_file, file_url, is_dir;

				update_log_msg_with_response.call(this, log_msg, status, headers);
				this.log_event(log_msg.join("\n") + "\n");

				// Directory listing
				res.writeHead(status, headers);
				res.write(
'<!doctype html>\
<html>\
<head>\
<meta charset="UTF-8" />\
<title>Files</title>\
<style>\
body{font-family:Verdana;font-size:16px;background:#e0e0e0;}\
a{color:#3060c0;text-decoration:underline;}\
a:hover{color:#c00000;}\
.m{position:absolute;left:0;top:0;bottom:0;right:0;line-height:0;white-space:nowrap;text-align:center;}\
.a{display:inline-block;width:0;height:100%;vertical-align:middle;}\
.va{line-height:normal;white-space:normal;display:inline-block;vertical-align:middle;text-align:left;}\
.s{height:0.5em;}\
</style>\
</head>\
<body>\
<div class="m"><div class="a"></div><div class="va">'
				);

				// Paths
				if (url_normalized.length > 0) {
					// Add a .. path
					var url_updir = url_normalized.split("/");
					url_updir.pop();
					url_updir = url_updir.join("/");

					dir_text.push('<a href="/');
					dir_text.push(html_escape_special_chars(url_updir));
					if (url_updir.length > 0) dir_text.push('/');
					dir_text.push('">..</a><br />');
				}

				for (i = 0; i < files.length; ++i) {
					// List
					full_file = path.join(filename_absolute, files[i]);
					file_url = (url_normalized.length > 0 ? url_normalized + "/" : "") + files[i];
					is_dir = fs.lstatSync(full_file).isDirectory();
					text_list = is_dir ? dir_text : file_text;

					// Add
					text_list.push('<a href="/');
					text_list.push(html_escape_special_chars(file_url));
					if (is_dir) text_list.push('/');
					text_list.push('">');
					text_list.push(html_escape_special_chars(files[i]));
					text_list.push('</a><br />');
				}

				// Done
				res.write(dir_text.join(""));
				res.write('<div class="s"></div>');
				res.write(file_text.join(""));
				res.write('</div></div></body></html>');
				res.end();
				return;
			}

			// Else, error
			on_request_404.call(this, req, res, url_normalized, filename_absolute, log_msg);
		};
		var on_request_showfile = function (req, res, url_normalized, filename_absolute, log_msg, filename_serve, file_stats) {
			// Does exist
			var ext = path.extname(filename_serve).toLowerCase(),
				mime_type = (ext in this.mime_types) ? this.mime_types[ext] : this.mime_type_default,
				status = 200,
				headers = default_headers.call(this, {
					"Content-Type": mime_type,
				}),
				file_stream;

			if (file_stats) {
				headers["Content-Length"] = file_stats.size;
			}

			update_log_msg_with_response.call(this, log_msg, status, headers);
			this.log_event(log_msg.join("\n") + "\n");

			res.writeHead(status, headers);

			file_stream = fs.createReadStream(filename_serve);
			file_stream.pipe(res);
			return;
		};
		var on_request_404 = function (req, res, url_normalized, filename_absolute, log_msg) {
			// Not found
			var status = 404,
				headers = default_headers.call(this, {
					"Content-Type": this.mime_type_error,
					"Content-Security-Policy": "default-src *; script-src 'none'; frame-src 'none'; object-src 'none'",
				});

			update_log_msg_with_response.call(this, log_msg, status, headers);
			this.log_event(log_msg.join("\n") + "\n");

			res.writeHead(status, headers);
			res.end("");
		};

		// Server error
		var on_error = function (error) {
			this.log_event("Server error\n  Version : IPv" + (this.mserver.active == this.mserver.ipv4 ? 4 : 6) + "\n  Error   : " + error + "\n");
			this.close(function () {
				process.exit(2);
			});
		};



		// Modify headers
		var default_headers = function (headers) {
			return headers;
		};

		// Update the logging message during a response
		var update_log_msg_with_response = function (log_msg, status, headers) {
			log_msg.push("  ------");
			log_msg.push("  Status : " + status);

			var headers_sorted = [],
				h_labels = [ "  Headers: " , "           " ],
				i;

			for (i in headers) headers_sorted.push(i);

			if (headers_sorted.length > 0) {
				headers_sorted.sort(function (h1, h2) {
					if (h1.length < h2.length) return -1
					if (h1.length > h2.length) return 1;
					if (h1 < h2) return -1
					if (h1 > h2) return 1;
					return 0;
				});

				for (i = 0; i < headers_sorted.length; ++i) {
					log_msg.push(h_labels[i == 0 ? 0 : 1] + headers_sorted[i] + ": " + headers[headers_sorted[i]]);
				}
			}
			else {
				log_msg.push(h_labels[0] + "None");
			}
		};

		// Filter connections
		var filter_connection = function (connection) {
			var ip_remote = connection.remoteAddress,
				ipv_remote = IP.v(ip_remote),
				connection_is_private = (
					ipv_remote.is_local(ip_remote) ||
					ipv_remote.is_loopback(ip_remote)
				);

			if (!connection_is_private) return "Non-private connection";
			return null;
		};


		// Setup server
		var display_addresses = function () {
			// Enumerate listening devices
			var interfaces = os.networkInterfaces(),
				devices = [],
				types = [ "loopback" , "local   " , "external" ],
				log_table,
				i, j, ips, ipv, device, details;

			for (device in interfaces) {
				ips = [];

				for (i = 0; i < interfaces[device].length; ++i) {
					details = interfaces[device][i];
					ipv = (details.family == "IPv4") ? IP.v4 : IP.v6;

					ips.push({
						address: details.address,
						version: ipv.number,
						type: ipv.is_loopback(details.address) ? 0 : (ipv.is_local(details.address) ? 1 : 2),
					});
				}

				devices.push({
					name: device,
					ips: ips,
				});
			}

			// Sort
			devices.sort(function (a, b) {
				return (a.name > b.name) ? 1 : ((a.name < b.name) ? -1 : 0);
			});
			log_table = "Device IP Table\n";
			for (i = 0; i < devices.length; ++i) {
				devices[i].ips.sort(function (a, b) {
					return (a.version > b.version) ? 1 : ((a.version < b.version) ? -1 : ((a.address > b.address) ? 1 : ((a.address < b.address) ? -1 : 0)));
				});
				log_table += "  " + devices[i].name + "\n";
				for (j = 0; j < devices[i].ips.length; ++j) {
					log_table += "    IPv" + devices[i].ips[j].version + " " + types[devices[i].ips[j].type] + " : " + devices[i].ips[j].address + "\n";
				}
			}
			this.log_event(log_table);
		};



		// Methods
		Server.prototype = {
			constructor: Server,

			start: function (base_dir, server_local, server_port) {
				// Set
				this.base_file_directory = base_dir;
				this.server_port = server_port;

				// Start up
				this.log_event(
					"Start-up\n" +
					"  " + path.basename(process.execPath) + " " + process.version + ", pid=" + process.pid + ", os=" + process.platform + "/" + process.arch + "\n" +
					"  ipv4/ipv6 server, port=" + this.server_port + (server_local ? ", local only" : "") + "\n"
				);

				// Enumerate listening devices
				display_addresses.call(this);


				// Events
				this.mserver.on("request", on_request.bind(this));
				this.mserver.on("error", on_error.bind(this));

				// Begin listening
				if (server_local) {
					this.mserver.listen(this.server_port, "127.0.0.1", "::1");
				}
				else {
					this.mserver.listen(this.server_port, undefined, "::");
				}
			},
			close: function (callback) {
				this.mserver.close(callback);
			},

			set_pretty_print: function (enabled) {
				this.log_event = (enabled ? this.logger.write_event_pretty : this.logger.write_event).bind(this.logger);
			},

		};



		return Server;

	})();



	// Interrupt signal
	var on_sigint = function (server) {
		// Close the server
		server.close(on_sigint_server_close.bind(this, server));
	};
	var on_sigint_server_close = function (server) {
		// Log
		server.log_event(
			"Shut-down\n" +
			"  " + path.basename(process.execPath) + " " + process.version + ", pid=" + process.pid + ", os=" + process.platform + "/" + process.arch + "\n"
		);

		// Shutdown the process
		process.exit(0);
	};
	var on_exception = function (server, error) {
		server.log_event("Uncaught exception:\n  type=" + typeof(error) + "\n  error=" + error + (error.stack ? "\n" + error.stack : ""));
		process.exit(-3);
	};



	// Usage info
	var usage = function (arguments_descriptor, stream) {
		var usage_info = [
			"Usage:",
			"    " + path.basename(process.execPath) + " directory [port] <flags>",
			"\n",
			"Available flags:",
		];

		// Flags
		var argument_keys = [],
			i, j, key, arg, line, param_name;

		for (key in arguments_descriptor) {
			argument_keys.push(key);
		}
		argument_keys.sort();

		for (i = 0; i < argument_keys.length; ++i) {
			key = argument_keys[i];
			arg = arguments_descriptor[key];
			param_name = "";
			if (!arg["bool"]) {
				param_name = " <" + ("argument" in arg ? arg["argument"] : "value") + ">";
			}

			if (i > 0) usage_info.push("");

			if ("long" in arg) {
				for (j = 0; j < arg["long"].length; ++j) {
					usage_info.push("  --" + arg["long"][j] + param_name);
				}
			}

			if ("short" in arg) {
				line = [ "  " ];
				for (j = 0; j < arg["short"].length; ++j) {
					if (j > 0) line.push(", ");
					line.push("-" + arg["short"][j] + param_name);
				}
				usage_info.push(line.join(""));
			}

			if ("description" in arg) {
				usage_info.push("    " + arg["description"]);
			}
		}

		// More info
		//Array.prototype.push.apply(usage_info, [ "\n", ]);

		// Output
		stream.write(usage_info.join("\n") + "\n");
	};

	// Main
	var main = function () {
		// Command line arguments
		var arguments_descriptor = {
			"version": {
				"short": [ "v" ],
				"long": [ "version" ],
				"bool": true,
				"description": "Show version info and exit",
			},
			"help": {
				"short": [ "h" , "?" ],
				"long": [ "help" , "usage" ],
				"bool": true,
				"description": "Show usage info and exit",
			},
			"directory": {
				"short": [ "d" ],
				"long": [ "directory" ],
				"argument": "path",
				"description": "Set the path to the directory sharing files are located in",
			},
			"port": {
				"short": [ "p" ],
				"long": [ "port" ],
				"argument": "number",
				"description": "The port the server should listen on",
			},
			"private": {
				"long": [ "private" ],
				"bool": true,
				"description": "Make the server run in private mode, for debugging; in this mode, only loopback connections are allowed",
			},
			"pretty-print": {
				"long": [ "pretty-print" ],
				"bool": true,
				"description": "Enable pretty print logging",
			},
			"allow-parent-directories": {
				"long": [ "allow-parent-directories" ],
				"bool": true,
				"description": "Allow listing of directories shallower than the root script file",
			},
			"log-file": {
				"short": [ "l" ],
				"long": [ "log-file" ],
				"argument": "path",
				"description": "The filename of logging file; empty string means do not log; not specified means default",
			},
		};
		var arg_data = arguments_parse(process.argv, 2, arguments_descriptor, [ "directory" , "port" ], false, true),
			args = arg_data[0],
			i;


		// Command line parsing errors?
		if (arg_data[1].length > 0) {
			for (i = 0; i < arg_data[1].length; ++i) {
				process.stderr.write(arg_data[1][i] + "\n");
			}
			process.exit(-1);
			return;
		}



		// Version
		if (args["version"]) {
			var version_string = "Version ";

			for (i = 0; i < version_info.length; ++i) {
				if (i > 0) version_string += ".";
				version_string += version_info[i];
			}
			process.stdout.write(version_string + "\n");
			process.exit(0);
			return;
		}

		// Usage info
		if (args["help"]) {
			usage(arguments_descriptor, process.stdout);
			process.exit(0);
			return;
		}

		// Argument checking
		if (args["directory"] === null) {
			usage(arguments_descriptor, process.stderr);
			process.exit(-2);
			return;
		}



		// Setup base directory
		var base_dir = path.resolve(args["directory"]),
			base_dir_rel = path.relative(__dirname, base_dir),
			re_dots = new RegExp("(^|\\" + path.sep + ")\\.{1,2}(\\" + path.sep + "|$)", "g"),
			stats, match;

		if (
			((match = base_dir_rel.match(re_dots)) !== null && match.length > 0) ||
			(process.platform == "win32" && /^[a-z]:/i.exec(base_dir_rel))
		) {
			if (!args["allow-parent-directories"]) {
				process.stderr.write("Directory is shallower than the script; use --allow-parent-directories to disable this warning\n");
				process.exit(-2);
				return;
			}
		}

		try {
			stats = fs.lstatSync(base_dir);
		}
		catch (e) {
			process.stderr.write("Directory does not exist\n");
			process.exit(-2);
			return;
		}
		if (!stats.isDirectory()) {
			process.stderr.write("Directory path does not point to a directory\n");
			process.exit(-2);
			return;
		}



		// Logging
		var log_stream = null;
		if (args["log-file"] !== "") {
			var log_filename = (args["log-file"] === null ? __filename + ".log" : path.resolve(args["log-file"]));
			log_stream = fs.createWriteStream(log_filename, {
				flags: "a",
				encoding: "utf8",
			});
		}



		// Init server
		var server = new Server(false);

		// Pretty print
		if (args["pretty-print"]) {
			server.set_pretty_print(true);
		}

		// Logging
		if (log_stream !== null) server.logger.add_stream(log_stream);

		// System signal
		process.on("SIGINT", on_sigint.bind(null, server));
		process.on("uncaughtException", on_exception.bind(null, server));

		// Port
		var port = 80;
		if (args["port"] !== null) {
			i = parseInt(args["port"], 10);
			if (isFinite(i) && i >= 0 && i < 65536) port = i;
		}

		// Start
		server.start(base_dir, args["private"], port);
	};

	// Execute
	if (require.main === module) main();

})();


