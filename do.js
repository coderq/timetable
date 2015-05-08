/**
 * Created by CoderQ on 2015/4/28.
 */
"use strict";

var fs = require('fs');
var xlsx = require('node-xlsx');
var course_table = require('./demo/course');
var classes = require('./demo/class');
var teachers = require('./demo/teacher');

// ts 教师课程表状态集合
// cs 班级课程表状态集合
var ts = {}, cs = {};

function cloneObj (object) {
    return JSON.parse(JSON.stringify(object));
}

// 将课程表状态表转换成字符串
function table2string (table) {
    return table
        .map(function (item) {
            return item
                .join('|');
        })
        .map(function (item) {
            return item
                .replace(/,/g, '');
        })
        .join(',');
}

// 将字符串转换成课程表状态表
function string2table (table) {
    return table
        .split(',')
        .map(function (item) {
            return item
                .split('|')
                .map(function (item) {
                    return item
                        .split('');
                });
        });
}

// 将数组转为对象
function array2object (ary) {
    var ret = {};
    ary.forEach(function (item) {
        ret[item.id] = item;
    });
    return ret;
}

// 生成数组并随机排序
function getRand (range) {
    var ary = range.constructor == Array ? range : [], i;
    if (!ary.length && !isNaN(i = Number(range))) {
        while (i-- > 0) ary.push(i);
    }
    return ary.sort(function () {return Math.random() - .5});
}

// 当前时间段是否存在于特殊设定（set,unset条件）
function inSpecials (i, j, k, condition) {
    if (!condition) return false;

    for (var x = 0, l = condition.length; x < l; x++) {
        if ((null === condition[x][0] || condition[x][0] == i) &&
            (null === condition[x][1] || condition[x][1] == j) &&
            (null === condition[x][2] || condition[x][2] == k)) {
            return true
        }
    }
    return false;
}

// 初始化课程表状态
function initCourseStatus (course_table, condition) {
    var status = [], def = 0, spec = 1,
        specials = condition && (condition.set || condition.unset);
    if (condition && condition.set) {
        def = 1;
        spec = 0;
    }
    for (var i = 0, il = course_table.length; i < il; i++) {
        status.push([]);
        for (var j = 0, jl = course_table[i].length; j < jl; j++) {
            status[i].push([]);
            for (var k = 0, kl = course_table[i][j].length; k < kl; k++) {
                if (inSpecials(i, j, k, specials)) {
                    status[i][j].push(spec);
                } else {
                    status[i][j].push(def);
                }
            }
        }
    }
    return status;
}

// 初始化班级状态
function initClassStatus (course_table, classes) {
    classes.forEach(function (cls) {
        cs[cls.id] = initCourseStatus(course_table, cls.condition);
        var subject, only;
        for (subject in cls.subject) {
            only = cls.subject[subject].condition && cls.subject[subject].condition.only;
            if (only) {
                only.forEach(function (item) {
                    cs[cls.id][item[0]][item[1]][item[2]] = {
                        teacher: cls.subject[subject].teacher,
                        subject: subject
                    };
                })
            }
        }
    });
}

// 初始化教师状态
function initTeacherStatus (course_table, teachers) {
    for (var i = 0, l = teachers.length; i < l; i++) {
        ts[teachers[i].id] = initCourseStatus(course_table, teachers[i].condition);
    }
}

// 初始化教师权级，权级高的科目先排序
function initTeacherLevel (teachers) {
    teachers.forEach(function (teacher) {
        var m = table2string(ts[teacher.id]).match(/1/g);
        teacher.level = m ? m.length : 0;
    });
}

// 将老师按照权级排序
function sortTeacher (teachers) {
    var has_sort = false, tmp;
    teachers.forEach(function (item, i) {
        if (i == teachers.length - 1) return item;
        if (teachers[i].level < teachers[i + 1].level) {
            tmp = teachers[i];
            teachers[i] = teachers[i + 1];
            teachers[i + 1] = tmp;
            has_sort = true;
        }
    });
    if (has_sort) return sortTeacher(teachers);
    else return teachers;
}

// 获取可以执教该班级的所有老师，并按排课权级排列
function getTeachableTeachers (cls, teachers) {
    var cls_ts = [];
    for (var s in cls.subject) {
        // 课程指定了固定上课时间，无需排课
        if (cls.subject[s].condition && cls.subject[s].condition.only) continue;
        for (var i = 0, l = teachers.length; i < l; i++) {
            if (cls.subject[s].teacher == teachers[i].id && s == teachers[i].subject) {
                cls_ts.push(teachers[i]);
            }
        }
    }
    return sortTeacher(cls_ts);
}

// 检测出该老师在该天授课数量
function countTeacherDayCourse (day_table, teacher_id) {
    var count = 0;
    for (var i = 0, il = day_table.length; i < il; i++) {
        for (var j = 0, jl = day_table[i].length; j < jl; j++) {
            if (day_table[i][j].teacher == teacher_id) count++;
        }
    }
    return count;
}

// 检测出该老师在当前时间段是否已经排课
function hasTeacherTimeCourse (time_table, teacher_id) {
    var count = 0;
    for (var i = 0, l = time_table.length; i < l; i++) {
        if (time_table[i].teacher == teacher_id) count++;
    }
    return count;
}

// 查询出满足2连堂的时间段
function getConn2CoursePos (cs, ts, count, teacher) {
    var week = getRand(course_table.length), w;
    var day = getRand(course_table[0].length), d;
    for (var i = 0, il = week.length; i < il; i++) {
        w = week[i];
        // 如果当天老师授课量已超过规定数目，则不再授课
        if (countTeacherDayCourse(cs[w], teacher.id) >= count.day) continue;
        for (var j = 0, jl = cs[w].length; j < jl; j++) {
            d = day[j];
            // 如果老师在当前时间段已经排课，则不再排课
            if (hasTeacherTimeCourse(cs[w][d], teacher.id) > 0) continue;
            for (var k = 0, kl = cs[w][d].length; k < kl; k++) {
                if (k <= cs[w][d].length - 2 &&
                    cs[w][d][k] == 0 && cs[w][d][k+1] == 0 &&
                    ts[w][d][k] == 0 && ts[w][d][k+1] == 0) {
                    return {i: w, j: d, k: k};
                }
            }
        }
    }
    return false;
}

// 查询满足单堂的时间段
function getCoursePos (cs, ts, count, teacher) {
    var week = getRand(course_table.length), w;
    var day = getRand(course_table[0].length), d;
    for (var i = 0, il = week.length; i < il; i++) {
        w = week[i];
        // 如果当天老师授课量已超过规定数目，则不再授课
        if (countTeacherDayCourse(cs[w], teacher.id) >= count.day) continue;
        for (var j = 0, jl = cs[w].length; j < jl; j++) {
            d = day[j];
            // 如果老师在当前时间段已经排课，则不再排课
            if (hasTeacherTimeCourse(cs[w][d], teacher.id) > 0) continue;
            for (var k = 0, kl = cs[w][d].length; k < kl; k++) {
                if (cs[w][d][k] == 0 && ts[w][d][k] == 0) {
                    return {i: w, j: d, k: k};
                }
            }
        }
    }
    return false;
}

function start () {
    var subject, cls_teachers, pos;

    classes.forEach(function (cls) {
        subject = cloneObj(cls.subject);
        cls_teachers = getTeachableTeachers(cls, teachers);
        cls_teachers.forEach(function (teacher) {
            teacher.condition = teacher.condition || {};
            while (subject[teacher.subject].count.week >= 2 &&
                teacher.condition.conn2 &&
                (pos = getConn2CoursePos(cs[cls.id], ts[teacher.id], subject[teacher.subject].count, teacher))) {
                cs[cls.id][pos.i][pos.j][pos.k] = {teacher: teacher.id, subject:teacher.subject};
                cs[cls.id][pos.i][pos.j][pos.k + 1] = {teacher: teacher.id, subject:teacher.subject};
                ts[teacher.id][pos.i][pos.j][pos.k] = {cls: cls.id};
                ts[teacher.id][pos.i][pos.j][pos.k + 1] = {cls: cls.id};
                subject[teacher.subject].count.week -= 2;
            }
            while (subject[teacher.subject].count.week > 0 && (pos = getCoursePos(cs[cls.id], ts[teacher.id], subject[teacher.subject].count, teacher))) {
                cs[cls.id][pos.i][pos.j][pos.k] = {teacher: teacher.id, subject:teacher.subject};
                ts[teacher.id][pos.i][pos.j][pos.k] = {cls: cls.id};
                subject[teacher.subject].count.week -= 1;
            }
        });
    });
}

function csToExcel () {
    var table = [], teacher_obj = array2object(teachers);

    classes.forEach(function (cls) {
        var status = cs[cls.id].slice(0);
        var name = cls.name;
        var data = [];
        status.forEach(function (item, i) {
            status[i] = Array.prototype.concat.apply([], item);
        });
        status.forEach(function (day, i) {
            day.forEach(function (course, j) {
                if (!data[j]) data[j] = [];
                if (course.constructor == Object) {
                    data[j].push(course.subject/* + (course.teacher && teacher_obj[course.teacher].name)*/);
                } else {
                    data[j].push('');
                }
            });
        });
        data.unshift(['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']);
        table.push({name: name, data: data});
    });
    var buffer = xlsx.build(table);
    fs.writeFileSync('./class_course.xlsx', buffer);
}

function tsToExcel () {
    var table = [], class_obj = array2object(classes);
    teachers.forEach(function (cls) {
        var status = ts[cls.id].slice(0);
        var name = cls.name;
        var data = [];
        status.forEach(function (item, i) {
            status[i] = Array.prototype.concat.apply([], item);
        });
        status.forEach(function (day, i) {
            data.push([]);
            day.forEach(function (course, j) {
                if (!data[j]) data[j] = [];
                if (course.constructor == Object) {
                    data[j].push(course.cls && class_obj[course.cls].name);
                } else {
                    data[j].push('');
                }
            });
        });
        data.unshift(['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']);
        table.push({name: name, data: data});
    });
    var buffer = xlsx.build(table);
    fs.writeFileSync('./teacher_course.xlsx', buffer);
}

(function () {
    initClassStatus(course_table, classes);
    initTeacherStatus(course_table, teachers);
    initTeacherLevel(teachers);

    start();
    csToExcel();
    tsToExcel();
}());