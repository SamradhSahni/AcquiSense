const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CompanySchema = new Schema({
  name: { type: String, required: true, trim: true },
  // Optional: other company details
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Company', CompanySchema);