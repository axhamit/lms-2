const mongoose = require('mongoose');
const env = require('./env');
module.exports = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { autoIndex: !env.isProd ? true : true });
  console.log('MongoDB connected');
};
