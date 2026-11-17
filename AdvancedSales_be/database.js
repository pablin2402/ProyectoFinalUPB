const mongoose = require("mongoose");
const { MongoStore } = require("wwebjs-mongo");

const URI = process.env.MONGO_URI;
mongoose.set("strictQuery", false);

let store;

mongoose
  .connect(URI)
  .then(() => {
    console.log("Base de datos conectada");
    store = new MongoStore({ mongoose });
  })
  .catch((err) => console.log(err));

module.exports = { mongoose, store };