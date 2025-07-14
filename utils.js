// utils.js
const { CAP_ZONE_OPTIONS, CAP_ZONE_SIZE } = require('./config');

function genCapZone() {
  const choice = Math.random() < 0.5 ? CAP_ZONE_OPTIONS[0] : CAP_ZONE_OPTIONS[1];
  return { x: choice.x, y: choice.y, size: CAP_ZONE_SIZE };
}


module.exports = { genCapZone};

