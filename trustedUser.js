const mongoose = require('mongoose');

const TrustedUserSchema = new mongoose.Schema({
    userId: { 
      type: String,
      required: true 
      } 
});

module.exports = mongoose.model('TrustedUser', TrustedUserSchema);

