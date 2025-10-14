const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String }, // In production, use bcrypt
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  created_at: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

