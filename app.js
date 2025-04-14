const express = require('express');
const path = require('path');
const mysql = require("mysql");
const dotenv = require('dotenv');

dotenv.config({path: './.env'});

const app = express();

const db = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});

const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));
// app.get("/login", (req, res) => { res.render("page2")});
app.set("view engine", "hbs");


db.connect( (error) =>{
    if(error) {
        console.log(error)
    }else{
        console.log("MYSQL CONNECTED")
    }
})

app.get("/", (req, res) => {
    res.render("index")
})

app.post('/login', (req,res) =>{
    console.log(req.body);
    const { email, password } = req.body;

    console.log('Login attempt:');
    console.log('Email:', email);
    console.log('Password:', password);

    if (!email || !password) {
        return res.send('⚠️ Please enter both email and password.');
    }

    const query = "'SELECT * FROM admin WHERE Useranme = 'kyle123@email.com' AND Password = 'kyle123'";
    db.query(query, [email, password], (err, results) => {
        if (err) {
        console.error('❌ Database error:', err);
        return res.send('🚫 An error occurred while checking your credentials.');
        }

        if (results.length > 0) {
        console.log('✅ Login successful for:', email);
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        } else {
        console.log('❌ Invalid login attempt for:', email);
        res.send('❌ Invalid email or password.');
        }
  });
})


app.listen(5000, () =>{
    console.log('Server Started on port 5000');
})

