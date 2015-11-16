var mongojs = require('mongojs');
var tickets = "ticket";
var activities = "activity";
var students = "student";
var admins = "manager";
var seats = "seat"
var votes = "vote"
var uservote = "uservote"

exports.tickets = tickets;
exports.activities = activities;
exports.students = students;
exports.admins = admins;
exports.seats = seats;
exports.votes = votes;
exports.uservote = uservote;

exports.db = mongojs('mongodb://localhost/ticket', [tickets, activities, students, admins, seats, votes, uservote]);

exports.getIDClass=function(idValue)
{
    idValue=""+idValue;
    return mongojs.ObjectId(idValue);
}

exports.authIP = "127.0.0.1";
exports.authPort = 9003;
exports.authPrefix = "/v1";
