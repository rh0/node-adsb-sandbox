const rtlsdr = require('rtl-sdr'),
      Demodulator = require('mode-s-demodulator'),
      AircraftStore = require('mode-s-aircraft-store'),
      Table = require('cli-table2'),
      figlet = require('figlet');

// Setup the table
var table = new Table({
  head: ['icao', 'callsign', 'lat', 'lon', 'speed', 'Alti'],
  style: {
    border: []
  },
  colWidths: [10, 10, 20, 20, 10, 10]
});

// 1337 ASCII
var titleGraphic = '';
figlet.text('ADSB Node', {
  font: 'Bloody',
}, function(err, data) {
  if(err) throw err;

  titleGraphic = data;
});

const store = new AircraftStore({
  timeout: 120000 // 2 mins
});

const deviceIndex = 0,
      autoGain = false,
      findMaxGain = true,
      ppmCorrection = 0,
      agcMode = true,
      freq = 1090e6,
      sampleRate = 2e6;

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
let gain = 0;
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

// Populate our aircraft store.
function onData (data, size) {
  demodulator.process(data, size, function(message) {
    store.addMessage(message);
  });
}

// Update the output every now and then.
var outputInterval = setInterval(function() {
  // Clear the table
  table.splice(0, table.length);

  // Loop through our aircraft store and output aircraft that have position data
  store.getAircrafts()
  .filter(function(aircraft) {
    return aircraft.lat;
  })
  .forEach(function(aircraft) {
    table.push([aircraft.icao,
                aircraft.callsign,
                aircraft.lat,
                aircraft.lng,
                Math.round(aircraft.speed),
                aircraft.altitude]);
  });

  console.log('\033[2J');
  console.log(titleGraphic);
  console.log('\n');
  console.log('Flights Within Range of %s', rtlsdr.get_device_name(0));
  console.log(table.toString());
}, 1000);

function onEnd() {
  console.log('onEnd');
}
