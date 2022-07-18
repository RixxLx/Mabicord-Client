const fetch = require("node-fetch")
const { cap_filter, device_address, destination, verbose } = require("./config.json")
var Cap = require("cap").Cap

// cap components
var decoders = require("cap").decoders
var PROTOCOL = decoders.PROTOCOL
var fs = require("fs")
var c = new Cap()
var device = Cap.findDevice(device_address)
var filter = cap_filter
var bufSize = 10 * 1024 * 1024
var buffer = Buffer.alloc(65535)
var linkType = c.open(device, filter, bufSize, buffer)
c.setMinBytes && c.setMinBytes(0)

// Every time a packet is received, this function is called
// Continue if sync is successful
c.on("packet", function (nbytes, trunc) {
	if (linkType === "ETHERNET") {
		var ret = decoders.Ethernet(buffer)

		if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
			ret = decoders.IPV4(buffer, ret.offset)

			if (ret.info.protocol === PROTOCOL.IP.TCP) {
				var datalen = ret.info.totallen - ret.hdrlen
				ret = decoders.TCP(buffer, ret.offset)
				datalen -= ret.hdrlen
				rcvStr = buffer.toString("utf8", ret.offset, ret.offset + datalen)

				// Process bugle packet
				let bugleClean = rcvStr.substring(rcvStr.indexOf("<ALL_CHANNELS>")).slice(18, -15)

				const msgQueue = new Object()
				if (rcvStr.includes("<ALL_CHANNELS>")) {
					let bugleNick = bugleClean.substring(0, bugleClean.indexOf(" : "))
					let bugleData = bugleClean.substring(bugleClean.indexOf(" : ") + 3)
					if (bugleData != "NaN" && bugleData != "undefined" && bugleData != NaN && bugleData != undefined) {
						msgQueue.time = Date.now()
						msgQueue.data = { name: bugleNick, msg: bugleData }
					}
				} else if (rcvStr.includes("[채널12]")) {
					let fieldRaid = rcvStr.substring(rcvStr.indexOf("[채널12]")).slice(7, -11)
					if (fieldRaid != "NaN" && fieldRaid != "undefined" && fieldRaid != NaN && fieldRaid != undefined) {
						msgQueue.time = Date.now()
						msgQueue.message = fieldRaid
					}
				}

				// Actions if msg is not empty
				if (JSON.stringify(msgQueue) != "{}") {
					// Send msg to Mabicord-Server
					fetch(destination, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(msgQueue),
					})

					// Show log if verbose
					if (verbose == true) {
						console.log(msgQueue)
					}
				}
			} else if (ret.info.protocol === PROTOCOL.IP.UDP) {
				console.log("Received UDP")
			} else console.log("Unsupported IPv4 protocol: " + PROTOCOL.IP[ret.info.protocol])
		} else console.log("Unsupported Ethertype: " + PROTOCOL.ETHERNET[ret.info.type])
	}
})

console.log("Successfully started Mabicord.\nListening to %s on %s...", cap_filter, device_address)
