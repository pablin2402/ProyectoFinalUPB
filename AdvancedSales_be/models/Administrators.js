const mongoose = require("mongoose");
const { Schema } = mongoose;


const userSchema = new Schema({
    creationDate: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    id_owner: { type: String, require: true },
    salesId: { type: Schema.ObjectId, ref:"SalesMan" },
});

module.exports = mongoose.model("Administrators", userSchema);
