const os = require("os")
const fs = require("fs")
const fetch = require("node-fetch")
const { cap_filter, device_address, destination, verbose } = JSON.parse(fs.readFileSync("./config.json"))
var Cap = require("cap").Cap

// Find device_address
let deviceAddr = ""
if (device_address == "" || device_address == undefined) {
	let interfaces = os.networkInterfaces()
	for (var k in interfaces) {
		for (var k2 in interfaces[k]) {
			var address = interfaces[k][k2]
			if (address.family === "IPv4" && !address.internal) {
				deviceAddr = address.address
			}
		}
	}
}

// cap components
var decoders = require("cap").decoders
var PROTOCOL = decoders.PROTOCOL
var c = new Cap()
var device = Cap.findDevice(deviceAddr)
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
			let srcAddr = ret.info.srcaddr

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
						msgQueue.type = "bugle"
						msgQueue.time = Date.now()
						msgQueue.src = srcAddr
						msgQueue.data = { name: bugleNick, msg: bugleData }
					}
				} else if (rcvStr.includes("[채널12]")) {
					let fieldRaid = rcvStr.substring(rcvStr.indexOf("[채널12]")).slice(7, -11)
					if (fieldRaid != "NaN" && fieldRaid != "undefined" && fieldRaid != NaN && fieldRaid != undefined) {
						msgQueue.type = "raid"
						msgQueue.time = Date.now()
						msgQueue.src = srcAddr
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

console.log("Starting Mabicord.")
console.log("%s 어댑터로 %s 캡처하는 중...", device_address, cap_filter)
console.log("서버: %s\n", destination)
console.log("서버로 보내는 데이터:")
console.log("메시지에 <ALL_CHANNELS> 혹은 [채널12]가 포함될 경우:")
console.log("    발신자 IP, 메시지 채널 IP, 메시지 내용, 현재 시각\n")
console.log("서버로 발신된 데이터는 디스코드로 송신된 뒤 폐기됩니다.")
console.log("기타 문의는 Lx#2909으로 해주세요.")
