const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const bodyparser = require("body-parser");

require("./database");

const apiRoute = require("./routes/routes");
const inventaryRoute = require("./routes/inventary.route");
const userRoute = require("./routes/client.route");
const pdfController = require("./controllers/pdfController");
const triggerController = require("./controllers/TriggerController");

const app = express();

app.use(morgan("dev"));
app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use("/whatsapp", triggerController);
app.use("/whatsapp", pdfController);
app.use("/whatsapp", apiRoute);
app.use("/whatsapp", inventaryRoute);
app.use("/whatsapp", userRoute);


const port = process.env.PORT || 3057;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
