/**
 * Created by wangbb13 on 2015/11/11.
 */

function getWordFromStatus(act) {
    if (act.status == 0) {
        return '活动未开始';
    } else if (act.status == 1) {
        var now = new Date();
        if (now < act.start_time) {
            return '投票未开始'
        } else if (now < act.end_time) {
            return '投票进行中'
        } else {
            return '投票已结束'
        }
    } else if (act.status == 2){
        return '活动已结束'
    } else {
        return '未知错误'
    }
}

function timeFormatAlign(number) {
    return (number < 10) ? ('0' + number) : (number);
}

function getDate(dt) {
    dt = new Date(dt);
    return timeFormatAlign(dt.getDate()) + '日';
}

function getMonthDate(dt) {
    dt = new Date(dt);
    return timeFormatAlign(dt.getMonth() + 1) + '月' + getDate(dt);
}

function getFullDate(dt) {
    dt = new Date(dt);
    return dt.getFullYear() + '年' + getMonthDate(dt);
}

function getDay(dt) {
    dt = new Date(dt);
    var day = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return day[dt.getDay()];
}

function getTimeStr(dt) {
    dt = new Date(dt);
    return timeFormatAlign(dt.getHours()) + ':' + timeFormatAlign(dt.getMinutes());
}

function isSameYear(d1, d2) {
    d1 = new Date(d1);
    d2 = new Date(d2);
    return d1.getFullYear() == d2.getFullYear();
}

function isSameMonth(d1, d2) {
    d1 = new Date(d1);
    d2 = new Date(d2);
    return isSameYear(d1, d2) && (d1.getMonth() == d2.getMonth());
}

function isSameDay(d1, d2) {
//    d1 = new Date(d1);
//    d2 = new Date(d2);
    return isSameMonth() && (d1.getDate() == d2.getDate());
}

function getSmartTime(start_time, end_time) {
    var result = getFullDate(start_time) + ' ' + getDay(start_time) + ' ' + getTimeStr(start_time) + '-';
    if (isSameDay(start_time, end_time)) {
        result += getTimeStr(end_time);
    } else if (isSameMonth(start_time, end_time)) {
        result += getDate(end_time) + ' ' + getDay(end_time) + ' ' + getTimeStr(end_time);
    } else if (isSameYear(start_time, end_time)) {
        result += getMonthDate(end_time) + ' ' + getDay(end_time) + ' ' + getTimeStr(end_time);
    } else {
        result += getFullDate(end_time) + ' ' + getDay(end_time) + ' ' + getTimeStr(end_time);
    }
    return result;
}

function getTd(para) {
    return $('<td class="td-' + para + '"></td>');
}

function expend_long_text(dom) {
    var newhtl = '';
    var par = $(dom).parent();
    var refdata = par.text();
    dom = $(dom);
    refdata = refdata.substring(0, refdata.length - 3);
    newhtl = dom.attr('ref-data') + ' <a style="cursor:pointer;" ref-data="' + refdata + '" ref-hint="' + dom.text() + '" onclick="expand_long_text(this);">' + dom.attr('ref-hint') + '</a>';
    par.html(newhtl);
}

var duringact = [];

var tdMap = {
    'status': 'status',
    'name': 'text',
    'description': 'longtext',
    'activity_time': 'time',
    'operations': 'operation_links',
    'delete': 'deletelink'
};

var operationMap = {
    'export': function(act) {
        return (act.status != 0);
    },
    'detail': function(act) {
        return true;
    }
};

var tdActionMap = {
    'status': function(act, key) {
        return getWordFromStatus(act);
    },
    'text': function(act, key) {
        return act[key];
    },
    'longtext': function(act, key) {
        var str = act[key];
        if (str.length > 55) {
            str = str.substr(0, 55) + '...<a style="cursor:pointer;" ref-data="' + act[key] + '"ref-hint="收起" onclick="expend_long_text(this);">չ展开</a>';
        }
        return str;
    },
    'time': function(act, key) {
        return getSmartTime(act.start_time, act.end_time);
    },
    'operation_links': function(act, key) {
        var links = act[key];
        var result = [];
        var i, len;
        for (i in links) {
            if(operationMap[i](act)) {
                result.push('<a href="' + links[i] + '"target="' + operation_target[i] + '"><span class="glyphicon glyphicon-' + operation_icon[i] + '"></span>' + operation_name[i] + '</a>');
            }
        }
        return result.join('<br/>');
    },
    'deletelink': function(act, key) {
        if (typeof act[key] == 'undefined') {
            return;
        }
        var now = new Date();
        if (now > (act.start_time) && now < (act.end_time) && (act.status == 1)) {
            duringact.push(act[key]);
            return '<span id="del' + act[key] + '"class="td-ban glyphicon glyphicon-ban-circle"></span>';
        } else {
            return '<a href=\"javascript:void(0);\" id=\"'+act[key]+'\" onclick=\"deleteact(\''+act[key]+'\')\"><span class=\"glyphicon glyphicon-trash\"></span></a>';
        }
    }
};

function deleteact(actid) {
    var i = 0, len = activities.length;
    var curact;
    for ( ; i < len; i++) {
        if (activities[i].delete == actid) {
            curcat = activities[i];
            break;
        }
    }
    var content = 'ȷ��ɾ��<span style="color:red">' + getWordFromStatus(curcat) + '</span>�: <span style="color: red">' + curcat.name + '</span>?';
    $('#modalcontent').html(content);
    $('#' + actid).css("background-color", "#FFE4C4");
    $('#deleteid').val(actid);
    $('#delModal').modal({
        keyboard: false,
        backdrop: false
    });
}

function delCancel() {
    var delid = $('#deleteid').val();
    $('#' + delid).css("background-color", "#FFF");
}

function createTips() {
    var id;
    for (id in duringact) {
        $('#del' + duringact[id]).popover({
            html: true,
            placement: 'top',
            title: '',
            content: '<span style="color: red;">'
        });
    }
}

function appendAct(act) {
    var tr = $('<tr ' + ((typeof act.delete != 'undefined') ? ('id="' + act.delete + '"') : ('')) + '></tr>');
    var key;
    for (key in tdMap) {
        getTd(key).html(tdActionMap[tdMap[key]](act, key)).appendTo(tr);
    }
    $('#vote_body').append(tr);
}

function initialActs() {
    $('#vote_body').html('');
    var i, len = act.length;
    for (i = 0; i < len; i++) {
        appendAct(act[i]);
    }
    createTips();
}

initialActs();
