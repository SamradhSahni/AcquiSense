const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GroupSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  permissions: [{ type: String, trim: true }], // e.g., 'user:create', 'report:view', 'task:assign'
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true });

// Ensure group name is unique per company
GroupSchema.index({ name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Group', GroupSchema);