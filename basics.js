var rtlsdr = require('rtl-sdr'),
    Demodulator = require('mode-s-demodulator'),
    Table = require('cli-table2'),
    figlet = require('figlet');

var table = new Table({
  head: ['icao', 'identity', 'callsign', 'lat', 'lon', 'Alti'],
  style: {
    border: []
  },
  colWidths: [10, 10, 10, 10, 10, 10]
});

var titleGraphic = '';
figlet.text('ADSB Node', {
  font: 'Bloody',
}, function(err, data) {
  if(err) throw err;

  titleGraphic = data;
});

const deviceIndex = 0,
      autoGain = false,
      findMaxGain = true,
      ppmCorrection = 0,
      agcMode = true,
      freq = 1090e6,
      sampleRate = 2e6;

let gain = 0;

const vendor = Buffer.alloc(256),
      product = Buffer.alloc(256),
      serial = Buffer.alloc(256);

const deviceCount = rtlsdr.get_device_count();
const demodulator = new Demodulator();

if(!deviceCount) {
  console.log('No supported RTL-SDR devices found.');
  process.exit(1);
}

console.log('Found %d device(s).', deviceCount);
rtlsdr.get_device_usb_strings(deviceIndex, vendor, product, serial);
console.log('%s, %s, SN: %s', vendor, product, serial);

const dev = rtlsdr.open(deviceIndex);
if(typeof dev === 'number') {
  console.log('Error opening the RTLSDR device: %s', dev);
  process.exit(1);
}

console.log('Provisioning Radio...');
// Set Max Gain
rtlsdr.set_tuner_gain_mode(dev, 1);
if(!autoGain) {
  if(findMaxGain) {
    // Find the maximum gain available
    const gains = new Int32Array(100);
    const numgains = rtlsdr.get_tuner_gains(dev, gains);
    //console.log('numgains: %d', numgains);
    gain = gains[numgains - 1];
    console.log('Max available gain is: %d', gain / 10);
  }
  console.log('Setting gain to: %d', gain / 10);
  rtlsdr.set_tuner_gain(dev, gain);
} else {
  console.log('Using automatic gain control');
}

// Set the frequency correction value for the device
rtlsdr.set_freq_correction(dev, ppmCorrection);

// Enable or disable the internal digital AGC of the RTL2822
rtlsdr.set_agc_mode(dev, agcMode ? 1 : 0);

// Tune center frequency
rtlsdr.set_center_freq(dev, freq);

// Select sample rate
rtlsdr.set_sample_rate(dev, sampleRate);

// Reset the internal buffer
rtlsdr.reset_buffer(dev);

console.log('Gain reported by device: %d', rtlsdr.get_tuner_gain(dev) / 10);

// Lets read some data
const bufNum = 12;
const bufLen = 2 ** 18; // 256K
rtlsdr.read_async(dev, onData, onEnd, bufNum, bufLen);

function onData (data, size) {
  demodulator.process(data, size, function(message) {
    //console.log(message);
    if(message.rawLatitude !== null) {
      var isNewAircraft = true;
      table.forEach(function(x,i,table) {
        if(x.indexOf(message.icao) === 0) {
          isNewAircraft = false;
          table[i] = [message.icao,
                      message.identity,
                      message.callsign,
                      message.rawLatitude,
                      message.rawLongitude,
                      message.altitude];
        }
      });
      if(isNewAircraft === true) {
        table.push([message.icao,
                    message.identity,
                    message.callsign,
                    message.rawLatitude,
                    message.rawLongitude,
                    message.altitude]);
      }
      console.log('\033[2J');
      console.log(titleGraphic);
      console.log('\n');
      console.log('Flights Within Range of %s', rtlsdr.get_device_name(0));
      console.log(table.toString());
      //console.log('ICAO: %s Callsign: %s Lat/Lon: %d/%d Alti: %d', message.icao, message.callsign, message.rawLatitude, message.rawLongitude, message.altitude);
    }
  });
}

function onEnd() {
  console.log('onEnd');
}


