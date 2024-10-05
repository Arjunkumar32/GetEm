const mongoose = require('mongoose');
const regexCheckSchema = new mongoose.Schema({
  id: { 
    type: Number,
    required: true,
    unique: true 
  },

  pattern: { 
   type: String,
   required: true 
  },

  severity: { 
    type: Number,
    required: true 
  }
});

module.exports =new mongoose.model('RegexCheck', regexCheckSchema);