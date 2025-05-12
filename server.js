const express = require("express");
const app = express();
const path = require("path");
const env = require("dotenv").config();
const port = process.env.PORT || 3001;
const db = require("./config/db");
db();


app.use(express.json())
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"views/user"),path.join(__dirname,"views/admin")])


app.get("/",(req,res) => {
    res.render("otp-validation")
})

app.listen(port,() => {
    console.log("server is running http://localhost:3001")
})