const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/focusguard_web';

async function connect() {
  await mongoose.connect(uri);
}

module.exports = { connect, mongoose };
