const assert = require('assert')

const {getDevice} = require('./getDevice');
const convertProntoCode = require('./convertProntoCode')

module.exports = async ({host, hexData, log, name, logLevel, withDelay}) => {
    assert(hexData && typeof hexData === 'string', `\x1b[31m[ERROR]: \x1b[0m${name} sendData (HEX value is missing)`);

    // Check for pronto code
    if (hexData.substring(0, 4) === '0000') {
        if (logLevel <= 1) {
            log(`\x1b[33m[DEBUG]\x1b[0m ${name} sendHex (Converting Pronto code "${hexData}" to Broadlink code)`);
        }
        hexData = convertProntoCode(hexData, log);
        if (logLevel <= 1) {
            log(`\x1b[33m[DEBUG]\x1b[0m ${name} sendHex (Pronto code successfuly converted: "${hexData}")`);
        }

        if (!hexData) {
            return log(`\x1b[31m[ERROR] \x1b[0m${name} sendData (A Pronto code was detected however its conversion to a Broadlink code failed.)`);
        }

    }

    // Get the Broadlink device
    const device = getDevice({host, log});

    if (!device) {
        if (!host) {
            return log(`\x1b[31m[ERROR] \x1b[0m${name} sendData (no device found, ensure the device is not locked)`);
        }

        return log(`\x1b[31m[ERROR] \x1b[0m${name} sendData (no device found at ${host}, ensure the device is not locked)`);
    }

    if (!device.sendData) {
        return log(`\x1b[31m[ERROR] \x1b[0mThe device at ${device.host.address} (${device.host.macAddress}) doesn't support the sending of IR or RF codes.`);
    }
    if (hexData.includes('5aa5aa555')) {
        return log(`\x1b[31m[ERROR] \x1b[0mThis type of hex code (5aa5aa555...) is no longer valid. Use the included "Learn Code" accessory to find new (decrypted) codes.`);
    }

    await device.mutex.use(async () => {
        const hexDataBuffer = new Buffer(hexData, 'hex');
        device.sendData(hexDataBuffer, logLevel, hexData);
        if (logLevel <= 2) {
            log(`${name} delay ${device.host.delayAfter} sendHex (${device.host.address}; ${device.host.macAddress}) ${hexData}`);
        }
        if (device.host.delayAfter) {
            if (withDelay) {
                await new Promise(r => setTimeout(r, device.host.delayAfter));
                if (logLevel <= 1) {
                    log(`\x1b[33m[DEBUG]\x1b[0m ${name} cooling down for (${device.host.delayAfter}ms)`);
                }
            } else {
                log(`\x1b[33m[DEBUG]\x1b[0m ${name} Delay after was set for the BroadLink device however, no doDelayAfter for (${name})`);
            }
        }
    });
}
