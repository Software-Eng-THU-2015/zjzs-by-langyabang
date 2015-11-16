/**
 * Created by WYX on 2015/11/11.
 */
var express = require('express');
var router = express.Router();

var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");

var VOTE_DB = model.votes;
var USERVOTE_DB = model.uservote;
var db = model.db;

function addZero(num)
{
    if (num<10)
        return "0"+num;
    return ""+num;
}
function getTime(datet,isSecond)
{
    if (!(datet instanceof Date))
        datet=new Date(datet);
    datet.getMinutes();
    return datet.getFullYear() + "Äê"
        + (datet.getMonth()+1) + "ÔÂ"
        + (datet.getDate()) + "ÈÕ "
        + addZero(datet.getHours()) + ":"
        + addZero(datet.getMinutes())
        + (isSecond===true? ":"+datet.getSeconds() : "");
}
router.get("/", function(req, res, next)
{
    if (req.query.actid == null)
    {
        res.send("Vote Activity not exist!");
        return;
    }
    //WARNING: 500 when invalid id
    var theActID=model.getIDClass(req.query.actid);
    var theUserID=req.query.userid;
    db[VOTE_DB].find(
        {
            _id:theActID
//            status:{$gt:0}
        },function(err, docs)
        {
            if (err || docs.length==0)
            {
                res.send("Vote Activity not exist!");
                return;
            }
            db[USERVOTE_DB].find(
                {
                    "userId":theUserID, "actid":req.query.actid
                },function(err1,docs_vote) {
                    var isVote = 0;
                    if (docs_vote.length != 0) {
                        isVote = 1;
                    }
                    var theAct = docs[0];
                    var nowStatus = 0;
                    var current = (new Date()).getTime();
                    if (current < theAct.end_time)
                        nowStatus = 0;
                    else
                        nowStatus = 1;
                    var tmp =
                    {
                        act_name: theAct.name,
                        act_start: theAct.start_time,
                        act_end: theAct.end_time,
                        act_key: theAct.key,
                        act_pic_url: theAct.pic_url,
                        act_desc: theAct.description
                            .replace(/ /g, "&nbsp;")
                            .replace(/"/g, "&quot;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/\\n/g, "<br>"),
                        quesions_num: theAct.question_num,
                        questions: theAct.questions,
                        options_num: theAct.options_num,
                        options_min: theAct.options_min,
                        options_max: theAct.options_max,
                        options: theAct.options,
                        options_tickets: theAct.options_tickets,
                        cur_time: getTime(new Date(), true),
                        time_rem: Math.round((theAct.end_time - current) / 1000),
                        vote_status: nowStatus,
                        is_vote: isVote,
                        current_time: (new Date()).getTime()
                    };

                    res.render("activity_vote_user", tmp);
                });
        });
});

router.post("/", function(req, res) {
    var resData = {};
    var select_vote = eval(req.body.select);
    var theActID=model.getIDClass(req.query.actid);
    var theUserID=req.query.userid;
    db[VOTE_DB].find(
        {
            _id:theActID
//            status:{$gt:0}
        },function(err, docs)
        {
            var theAct = docs[0];
            db[USERVOTE_DB].find(
                {
                    "userId":theUserID, "actid":req.query.actid
                },function(err1, docs_vote) {
                    resData.message = "success";
                    console.log(docs_vote.length);
                    if (docs_vote.length > 0) {
                        res.send(JSON.stringify(resData));
                        return;
                    }
                    for (var i = 0; i < select_vote.length; i++) {
                        if (select_vote[i].length < theAct.options_min[i] || select_vote[i].length > theAct.options_max[i]) {
                            resData.message = "failed";
                            break;
                        }
                        for (var j = 0; j < select_vote[i].length; j++) {
                            theAct.options_tickets[i][select_vote[i][j]]++;
                        }
                    }
                    if (resData.message == "success") {
                        db[USERVOTE_DB].insert({
                            "userId": theUserID,
                            "actid": req.query.actid,
                            "options_tickets": select_vote
                        });
                        db[VOTE_DB].update({_id: theActID}, {$set: {"options_tickets": theAct.options_tickets}});
                    }
                    res.send(JSON.stringify(resData));
                });
        });
});
module.exports = router;
