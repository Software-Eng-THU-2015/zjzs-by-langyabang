var template = require('./reply_template');
var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");
var checker = require("./checkRequest");
var basicInfo = require("../weixin_basic/settings.js");

//Attentez: keep the activity::key unique globally.
var TICKET_DB = model.tickets;
var USER_DB = model.students;
var ACTIVITY_DB = model.activities;
var SEAT_DB = model.seats;
var db = model.db;

var alphabet = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM0123456789";

var act_cache={};
var rem_cache={};
var tik_cache={};
var usr_lock={};

exports.clearCache=function()
{
    act_cache={};
}

//抢票时验证用户是否绑定
function verifyStudent(openID,ifFail,ifSucc)
{
    db[USER_DB].find({weixin_id:openID,status:1},function(err,docs)
    {
        if (err || docs.length==0)
        {
            ifFail();
            return;
        }
        ifSucc(docs[0].stu_id);
    });
}
exports.verifyStu=verifyStudent;

//被赠票的学生
function verifyDonatedStudent(donatedStuNum,ifFail,ifSucc)
{
    db[USER_DB].find({stu_id:donatedStuNum,status:1},function(err,docs)
    {
        if (err || docs.length==0)
        {
            ifFail();
            return;
        }
        ifSucc(docs[0].weixin_id);
    });
}
exports.verifyDonatedStu=verifyDonatedStudent;

function verifyActivities(actKey,ifFail,ifSucc)
{
    var timer = new Date();
    var current=timer.getTime();
    var theAct=act_cache[actKey];
    if (theAct)
    {
        if (current<theAct.book_end)
        {
            if (current>theAct.book_start)
            {
                ifSucc(theAct._id,theAct);
                return;
            }
            ifFail(theAct.book_start-current);
            return;
        }
        act_cache[actKey]=null;
        tik_cache[actKey]=null;
        ifFail();
        return;
    }
    db[ACTIVITY_DB].find(
        {
            key:actKey,
            book_end:{$gt:current},
            status:1
        },function(err,docs)
        {
            if (err || docs.length==0)
            {
                ifFail();
                return;
            }
            act_cache[actKey]=docs[0];
            if (current>docs[0].book_start)
            {
                ifSucc(docs[0]._id,docs[0]);
                return;
            }
            else
            {
                ifFail(docs[0].book_start-current);
                if (tik_cache[actKey]==null)
                {
                    lock.acquire("rem_tik_fetcher",function()
                    {
                        if (tik_cache[actKey]!=null)
                        {
                            lock.release("rem_tik_fetcher");
                            return;
                        }
                        tik_cache[actKey]={};
                        tik_cache[actKey].tikMap={};
                        tik_cache[actKey].usrMap={};
                        lock.release("rem_tik_fetcher");
                        return;
                    });
                }
                return;
            }
        });
}
function getRandomString()
{
    var ret="";

    for (var i=0;i<13;i++)
        ret+=alphabet[Math.floor(Math.random()*alphabet.length)];
    return ret;
}
//Attentez: this function can only be called on condition that the collection is locked.
function generateUniqueCode(callback,prefix,actKey)
{
    while (true)
    {
        var tickCode=prefix+"_"+getRandomString();
        if (tik_cache[actKey].tikMap[tickCode]==null)
        {
            callback(tickCode);
            return;
        }
    }
}
function presentTicket(msg,res,tick,act)
{
    var tmp="恭喜，抢票成功！\n";
    var i;
    var str;
    console.log(tick.ticketCodes.length);
    for (i = 0; i < tick.ticketCodes.length; i++)
    {
        str = "点我查看电子票" + toString(i + 1);
        tmp += template.getHyperLink( str, urls.ticketInfo + "?ticketid=" + tick.ticketCodes[i]);
    }
    if (act.need_seat!=0)
        tmp+="\n注意:该活动需在抢票结束前选座(区)，请进入电子票选择。";
    res.send(template.getPlainTextTemplate(msg,tmp));
}
function fetchRemainTicket(key,callback)
{
    if (rem_cache[key]!=null)
    {
        callback();
        return;
    }
    lock.acquire("rem_tik_fetcher",function()
    {
        if (rem_cache[key]!=null)
        {
            lock.release("rem_tik_fetcher");
            callback();
            return;
        }
        db[ACTIVITY_DB].find(
            {
                key:key,
                status:1
            },function(err,docs)
            {
                if (err || docs.length==0)
                {
                    lock.release("rem_tik_fetcher");
                    return;
                }
                if (tik_cache[key]==null)
                {
                    tik_cache[key]={};
                    tik_cache[key].tikMap={};
                    tik_cache[key].usrMap={};
                    db[TICKET_DB].find({activity:docs[0]._id},function(err2,docs2)
                    {
                        if (err2)
                        {
                            lock.release("rem_tik_fetcher");
                            return;
                        }
                        for (var i=0;i<docs2.length;i++)
                        {
                            tik_cache[key].tikMap[docs2[i].unique_id]=true;
                            if (docs2[i].status!=0)
                                tik_cache[key].usrMap[docs2[i].stu_id]++;
                        }
                        rem_cache[key]=docs[0].remain_tickets;
                        lock.release("rem_tik_fetcher");
                        callback();
                        return;
                    });
                }
                else
                {
                    rem_cache[key]=docs[0].remain_tickets;
                    lock.release("rem_tik_fetcher");
                    callback();
                    return;
                }
            });
    });
}

function getTimeFormat(timeInMS)
{
    var sec=Math.floor(timeInMS/1000);
    var min=Math.floor(sec/60);
    var hou=Math.floor(min/60);

    sec-=min*60;
    min-=hou*60;
    if (hou+min+sec==0)
        return "1秒";
    return (hou>0?hou+"小时":"")+(min>0?min+"分":"")+(sec>0?sec+"秒":"");
}

function needValidateMsg(msg) {
    return template.getPlainTextTemplate(msg,'<a href="' + urls.validateAddress
        + '?openid=' + msg.FromUserName +  '">请先点我绑定学号。</a>');
}

exports.check_get_ticket=function(msg)
{
    if (checker.checkMenuClick(msg).substr(0,basicInfo.WEIXIN_BOOK_HEADER.length)===basicInfo.WEIXIN_BOOK_HEADER)
        return true;
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="抢票" || msg.Content[0].substr(0,3)==="抢票 ")
            return true;
    return false;
}
exports.faire_get_ticket=function(msg,res)
{
    var actName, ticketNumber, openID;
    var ticketUniqueCode = new Array();

    if (msg.MsgType[0]==="text")
    {
        if (msg.Content[0]==="抢票")
        {
            res.send(template.getPlainTextTemplate(msg,"请使用“抢票 活动代称 抢票张数（最多3张）”的命令或菜单按钮完成指定活动的抢票。"));
            return;
        }
        else
        {
            actName=msg.Content[0].split(" ")[1];
            ticketNumber = parseInt(msg.Content[0].split(" ")[2]);
            if (ticketNumber != NaN) {
                if (ticketNumber > 3) {
                    res.send(template.getPlainTextTemplate(msg, "抢票数大于3张，系统无法进行抢票，请重新输入命令。"));
                    return;
                }
            }
            else
            {
                res.send(template.getPlainTextTemplate(msg, "请输入具体抢票张数。"));
                return;
            }
        }
    }
    else
    {
        actName=msg.EventKey[0].substr(basicInfo.WEIXIN_BOOK_HEADER.length);
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        if (usr_lock[stuID]!=null)
        {
            res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
            return;
        }

        verifyActivities(actName,function(tl)
        {
            if (tl==null)
                res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动处于抢票期。"));
            else
                res.send(template.getPlainTextTemplate(msg,"该活动将在 "+getTimeFormat(tl)+" 后开始抢票，请耐心等待！"));
        },function(actID,staticACT)
        {
            fetchRemainTicket(actName,function()
            {
                //Attentez: unlike stuID which is THUid, act id is simply act._id
                if (tik_cache[actName].usrMap[stuID] == 3)
                {
                    res.send(template.getPlainTextTemplate(msg,"你已经有3张票啦，不能再多抢啦！请用查票功能查看抢到的票吧！"));
                    return;
                }
                else
                {
                    if (usr_lock[stuID]!=null)
                    {
                        res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
                        return;
                    }
                    usr_lock[stuID]="true";

                    if (rem_cache[actName]==0)
                    {
                        usr_lock[stuID]=null;
                        res.send(template.getPlainTextTemplate(msg,"对不起，票已抢完...\n(╯‵□′)╯︵┻━┻。"));
                        return;
                    }
                    for (var j = 0; j < ticketNumber; j++) {
                        rem_cache[actName]--;
                        db[ACTIVITY_DB].update(
                            {
                                _id: actID
                            },
                            {
                                $inc: {remain_tickets: -1}
                            }, {multi: false}, function (err, result) {
                                if (err || result.n == 0) {
                                    usr_lock[stuID] = null;
                                    res.send(template.getPlainTextTemplate(msg, "(╯‵□′)╯︵┻━┻"));
                                    return;
                                }
                                var ss = actID.toString();
                                generateUniqueCode(function (tiCode) {
                                    tik_cache[actName].tikMap[tiCode] = true;
                                    tik_cache[actName].usrMap[stuID]++;
                                    db[TICKET_DB].insert(
                                        {
                                            stu_id: stuID,
                                            unique_id: tiCode,
                                            activity: actID,
                                            status: 1,
                                            seat: "",
                                            cost: (staticACT.need_seat == 2 ? parseInt(staticACT.price) : 0)
                                        }, function () {
                                            usr_lock[stuID] = null;
                                            ticketUniqueCode.push(tiCode);
                                            return;
                                        });
                                }, ss.substr(0, 8) + ss.substr(14), actName);
                            });
                    }
                    presentTicket(msg, res, {ticketCodes:ticketUniqueCode}, staticACT);
                }
            });
        });
    });
}
//========================================
exports.check_reinburse_ticket=function(msg)
{
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="退票" || msg.Content[0].substr(0,3)==="退票 ")
            return true;
    return false;
}
exports.faire_reinburse_ticket=function(msg,res)
{
    var actName,openID;
    if (msg.Content[0]==="退票")
    {
        //WARNING: Fill the activity name!!
        res.send(template.getPlainTextTemplate(msg,"请使用“退票 活动代称”的命令完成指定活动的退票。"));
        return;
    }
    else
    {
        actName=msg.Content[0].substr(3);
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        verifyActivities(actName,function()
        {
            res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动处于退票期。"));
        },function(actID)
        {
            db[TICKET_DB].findAndModify(
                {
                    query: {stu_id:stuID,activity:actID,status:1},
                    update: {$set: {status:0}}
                },function(err,result)
                {
                    if (err || result==null)
                    {
                        res.send(template.getPlainTextTemplate(msg,
                            "未找到您的抢票记录或您的票已经支付，退票失败。如为已支付票，请联系售票机构退还钱款后退票。"));
                        return;
                    }
                    if (result.seat!="" && result.seat!=null)
                    {
                        var incIndex={};
                        incIndex[result.seat]=1;
                        db[SEAT_DB].update({activity:actID},
                            {
                                $inc: incIndex
                            },function()
                            {
                                //Nothing? Oui, ne rien.
                            });
                    }

                    fetchRemainTicket(actName,function()
                    {
                        db[ACTIVITY_DB].update({_id:actID},
                            {
                                $inc: {remain_tickets:1}
                            },{multi:false},function()
                            {
                                rem_cache[actName]++;
                                tik_cache[actName].usrMap[stuID]=null;
                                res.send(template.getPlainTextTemplate(msg,"退票成功。"));
                                return;
                            });
                    });
                });
        });
    });
}
//========================================
exports.check_list_ticket=function(msg)
{
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="查票")
            return true;
    if (checker.checkMenuClick(msg)===basicInfo.WEIXIN_EVENT_KEYS['ticket_get'])
        return true;
    return false;
}
function renderTicketList(oneTicket,oneActivity,isSingle)
{
    var ret={};

    if (isSingle)
    {
        //Attentez: notify the user to select seat.
        ret[template.rich_attr.title]="抢票成功！";
        ret[template.rich_attr.description]=oneActivity.name;
    }
    else
        ret[template.rich_attr.title]=oneActivity.name;
    ret[template.rich_attr.url]=urls.ticketInfo+"?ticketid="+oneTicket.unique_id;
    ret[template.rich_attr.picture]=oneActivity.pic_url;

    return ret;
}
exports.faire_list_ticket=function(msg,res)
{
    var openID;

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        db[TICKET_DB].find(
            {
                stu_id:stuID,
                $or:[{status:1},{status:2}]
            },function(err,docs)
            {
                if (err || docs.length==0)
                {
                    res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                    return;
                }
                var actList=[];
                var actMap={};
                var list2Render=[];
                for (var i=0;i<docs.length;i++)
                {
                    actList.push({_id:docs[i].activity});
                }
                db[ACTIVITY_DB].find(
                    {
                        $or: actList
                    },function(err1,docs1)
                    {
                        if (err1 || docs1.length==0)
                        {
                            res.send(template.getPlainTextTemplate(msg,"出错了 T T，稍后再试。"));
                            return;
                        }
                        //WARNING: what if tickets>=WEIXIN_LIMIT?
                        for (var i=0;i<docs1.length;i++)
                        {
                            actMap[docs1[i]._id]=docs1[i];
                        }

                        var tmpEle;
                        tmpEle={};
                        tmpEle[template.rich_attr.title]="\n我的票夹\n";
                        tmpEle[template.rich_attr.description]=
                            "以下列表中是您抢到的票。(如果超过9个则可能有省略)";

                        list2Render.push(tmpEle);
                        for (var i=0;i<docs.length;i++)
                        {
                            list2Render.push(renderTicketList(docs[i],actMap[docs[i].activity],false));
                        }
                        res.send(template.getRichTextTemplate(msg,list2Render));
                    });
            });
    });
}
//赠票
exports.check_donate_ticket=function(msg)
{
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="赠票" || msg.Content[0].substr(0,3)==="赠票 ")
            return true;
    return false;
}
exports.faire_donate_ticket=function(msg,res)
{
    var actName,donatedStuNum,openID;
    if (msg.Content[0]==="赠票")
    {
        //WARNING: Fill the activity name!!
        res.send(template.getPlainTextTemplate(msg,"请使用“赠票 活动名称 学号”的命令完成指定活动的赠票。"));
        return;
    }
    else
    {
        actName = msg.Content[0].split(" ")[1];
        donatedStuNum = msg.Content[0].split(" ")[2];
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        verifyActivities(actName,function()
        {
            res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动可以赠票。"));
        },function(actID, staticACT)
        {
            verifyDonatedStudent(donatedStuNum,function()
            {
                res.send(template.getPlainTextTemplate(msg,"被赠票的用户没有绑定学号，无法完成赠票。"));
            },function(donatedStuID) {
                db[TICKET_DB].findAndModify(
                    {
                        query: {stu_id: stuID, activity: actID, status: 1},
                        update: {$set: {status: 0}}
                    }, function (err, result) {
                        if (err || result == null) {
                            res.send(template.getPlainTextTemplate(msg,
                                "未找到您的抢票记录，赠票失败。"));
                            return;
                        }
                        //移除旧票，生成新票
                        var ss=actID.toString();
                        generateUniqueCode(function(tiCode)
                        {
                            tik_cache[actName].usrMap[stuID]=null;
                            tik_cache[actName].tikMap[tiCode]=true;
                            tik_cache[actName].usrMap[donatedStuNum]=true;
                            db[TICKET_DB].remove(
                                {
                                    stu_id:stuID
                                }
                            );
                            db[TICKET_DB].insert(
                                {
                                    stu_id:     donatedStuNum,
                                    unique_id:  tiCode,
                                    activity:   actID,
                                    status:     1,
                                    seat:       "",
                                    cost:       (staticACT.need_seat==2?parseInt(staticACT.price):0)
                                }, function()
                                {
                                    usr_lock[donatedStuNum]=null;
                                    // presentTicket(msg,res,{unique_id:tiCode},staticACT);
                                    return;
                                });
                            res.send(template.getPlainTextTemplate(msg, "赠票成功。"));
                            return;
                        },ss.substr(0,8)+ss.substr(14),actName);

                        //对座位不需要处理
                        /*if (result.seat != "" && result.seat != null) {
                         var incIndex = {};
                         incIndex[result.seat] = 1;
                         db[SEAT_DB].update({activity: actID},
                         {
                         $inc: incIndex
                         }, function () {
                         //Nothing? Oui, ne rien.
                         });
                         }

                         fetchRemainTicket(actName, function () {
                         db[ACTIVITY_DB].update({_id: actID},
                         {
                         $inc: {remain_tickets: 1}
                         }, {multi: false}, function () {
                         rem_cache[actName]++;
                         tik_cache[actName].usrMap[stuID] = null;
                         tik_cache[actName].usrMap[donatedStuNum] = true;
                         res.send(template.getPlainTextTemplate(msg, "赠票成功。"));
                         return;
                         });
                         });*/
                    });
            });
        });
    });
}
