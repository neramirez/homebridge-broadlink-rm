const ping = require('ping');
const broadlink = require('./broadlink');
const delayForDuration = require('./delayForDuration');
const dgram = require('dgram');
const Mutex = require('await-semaphore').Mutex;

const pingFrequency = 5000;
const keepAliveFrequency = 90000;
const pingTimeout = 5;

const startKeepAlive = (device, log) => {
  if(!device.host.port) {return;}
  setInterval(() => {
    if(broadlink.debug) {log('\x1b[33m[DEBUG]\x1b[0m Sending keepalive to', device.host.address,':',device.host.port)}
    const socket = dgram.createSocket({ type:'udp4', reuseAddr:true }); 
    let packet = Buffer.alloc(0x30, 0);
    packet[0x26] = 0x1;
    socket.send(packet, 0, packet.length, device.host.port, device.host.address, (err, bytes) => {
      if (err) {log('\x1b[33m[DEBUG]\x1b[0m send keepalive packet error', err)}
    });
    socket.close();
  }, keepAliveFrequency);
}

const startPing = (device, log) => {
  device.state = 'unknown';
  device.retryCount = 1;

  setInterval(() => {
    try {
      ping.sys.probe(device.host.address, (active, err) => {
        if(err){
          log(`Error pinging Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}): ${err}`);
          throw err;
        }
        
        if (!active && device.state === 'active' && device.retryCount === 2) {
          log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) is no longer reachable after three attempts.`);

          device.state = 'inactive';
          device.retryCount = 0;
        } else if (!active && device.state === 'active') {
          if(broadlink.debug) {log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) is no longer reachable. (attempt ${device.retryCount})`);}

          device.retryCount += 1;
        } else if (active && device.state !== 'active') {
          if (device.state === 'inactive') {log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) has been re-discovered.`);}

          device.state = 'active';
          device.retryCount = 0;
        } else if (active && device.retryCount !== 0 ) {
          //Acive - reset retry counter
          device.retryCount = 0;
        }
      }, {timeout: pingTimeout})
    } catch (err) {
      log(`Error pinging Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}): ${err}`);
    }
  }, pingFrequency);
}

const discoveredDevices = {};
const manualDevices = {};
let discoverDevicesInterval;

const discoverDevices = (automatic = true, log, logLevel, deviceDiscoveryTimeout = 60) => {
  broadlink.log = log;
  broadlink.debug = logLevel <=1;
  //broadlink.logLevel = logLevel;

  if (automatic) {
    this.discoverDevicesInterval = setInterval(() => {
      broadlink.discover();
    }, 2000);

    delayForDuration(deviceDiscoveryTimeout).then(() => {
      clearInterval(this.discoverDevicesInterval);
    });

    broadlink.discover();
  }

  broadlink.on('deviceReady', (device) => {
    let macAddressParts, macAddress;
    if (device.mac.includes(":")) {
      macAddress = device.mac;
    }else{
      macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || [];
      macAddress = macAddressParts.join(':');
    }
    device.host.macAddress = macAddress;



    log(`\x1b[35m[INFO]\x1b[0m Discovered ${device.model} (${device.type.toString(16)}) at ${device.host.address} (${device.host.macAddress}) with delayAfter (${device.host.delayAfter} ${JSON.stringify(device.host)})`);
    addDevice(device);

    startPing(device, log);
    startKeepAlive(device, log);
  })
}

const addDevice = (device) => {
  if (!device.isUnitTestDevice && (discoveredDevices[device.host.address] || discoveredDevices[device.host.macAddress])) {return;}

  device.mutex = new Mutex();

  discoveredDevices[device.host.address] = device;
  discoveredDevices[device.host.macAddress] = device;
}

const getDevice = ({ host, log, learnOnly }) => {
  let device;

  if (host) {
    device = discoveredDevices[host];

    // Create manual device
    if (!device && !manualDevices[host]) {
      const device = { host: { address: host } };
      manualDevices[host] = device;

      startPing(device, log);
      startKeepAlive(device, log);
    }
  } else { // use the first one of no host is provided
    const hosts = Object.keys(discoveredDevices);
    if (hosts.length === 0) {
      // log(`Send data (no devices found)`);

      return;
    }

    // Only return device that can Learn Code codes
    if (learnOnly) {
      for (let i = 0; i < hosts.length; i++) {
        let currentDevice = discoveredDevices[hosts[i]];

        if (currentDevice.enterLearning) {
          device = currentDevice

          break;
        }
      }

      if (!device) {log(`Learn Code (no device found at ${host})`);}
    } else {
      device = discoveredDevices[hosts[0]];

      if (!device) {log(`Send data (no device found at ${host})`);}
    }
  }

  return device;
}

module.exports = { getDevice, discoverDevices, addDevice };
