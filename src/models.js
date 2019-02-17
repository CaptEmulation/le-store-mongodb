const { Schema } = require('mongoose');

const Account = exports.Account = new Schema({
  email: String,
  accountId: String,
  id: String,
  keypair: Object,
  agreeTos: Schema.Types.Mixed,
  receipt: Object,
}, { strict: false });


const Certificate = exports.Certificate = new Schema({
  email: String,
  accountId: String,
  domains: [String],
  cert: String,
  chain: String,
  privkey: String,
});
