const PulseOximeter = require('nonin-3230-ble');
const awsIot = require('aws-iot-device-sdk');
const { Button, RGBLed, Led } = require('pigpio-components');
const { enrollFingerAndRetrieveTemplate, setFingerprintTemplateAndVerify,
  blinkingFingerprintLed } = require('./fingerprint');
const { awsConfig } = require('./config.js');
const { delay } = require('./utils.js');

const NUMBER_OF_SENSOR_READINGS = 20;

/* Noble attaches a listener that interrupts the GPIO cleanup.
 * The Noble listener does not do anything else than
 * invoking process.exit(1) if it is the last listener, */
process.removeListener('SIGINT', process.listeners('SIGINT')[0]);

const device = awsIot.device(awsConfig);
const button = new Button({ gpio: 24, isPullup: true });
const leftLed = new RGBLed({ red: 25, green: 8, blue: 7 });
const rightLed = new RGBLed({ red: 17, green: 27, blue: 22 });
const oximeterLed = new Led(12);

device
  .on('connect', () => {
    device.subscribe('oximetry');
    leftLed.color('yellow').strobe(2000);
    rightLed.stop();
  })
  .on('error', (err) => console.log('error', err))
  .on('message', (topic, payload) => console.log('msg', topic, payload.toString()));


const showErrorLeds = () => {
  leftLed.stop().color('red').on();
  rightLed.stop().color('red').on();
  delay(4000).then(() => {
    rightLed.stop();
    leftLed.stop().color('orange').strobe(2000);
  });
};

const startMeasurement = () => {
  leftLed.color('green').stop().on();
  setFingerprintTemplateAndVerify()
    .then(() => {
      rightLed.stop().color('green').on();
      oximeterLed.setValue(255);
      let timer;
      let counter = 0;

      const onDiscover = ((pulseOximeter) => {
        pulseOximeter.connectAndSetup((error) => {
          if (error) {
            console.error(error);
          }
        });

        pulseOximeter
          .on('data', (data) => {
            counter += 1;
            device.publish('oximetry', JSON.stringify(data));
            if (counter === NUMBER_OF_SENSOR_READINGS) {
              leftLed.stop().color('yellow').strobe(2000);
              rightLed.stop();
              oximeterLed.off();
              clearTimeout(timer);
              pulseOximeter.completeMeasurement();
            }
          })
          .on('disconnect', () => {
            if (counter < NUMBER_OF_SENSOR_READINGS) {
              oximeterLed.off();
              showErrorLeds();
              clearTimeout(timer);
            }
          });

      });

      PulseOximeter.discover(onDiscover);

      timer = setTimeout(() => {
        if (counter < NUMBER_OF_SENSOR_READINGS) {
          oximeterLed.off();
          rightLed.off();
          leftLed.color('yellow').strobe(2000);
        }
        PulseOximeter.stopDiscover(onDiscover);
      }, 120000);

    },
    (error) => showErrorLeds());
};

button.on('click', () => {
  startMeasurement();
});

if (process.env.NODE_ENV === "development") {
  button.on('long press', () => {
    leftLed.color('green').on();
    enrollFingerAndRetrieveTemplate()
      .then(() => {
        rightLed.stop().color('green').on();
        delay(4000).then(() => {
          leftLed.color('yellow').strobe(2000);
          rightLed.stop();
        });
      }, (error) => showErrorLeds());
  });
}

