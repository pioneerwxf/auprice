#!/usr/bin/env python3
# coding: utf-8
import sqlite3, os, requests, datetime, time, uuid, math, re, json
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash
from flask_script import Manager

from auprice import app
from sendsms.demo_sms_send import send_sms
manager = Manager(app)

# Load default config and override config from an environment variable
app.config.update(dict(
    DATABASE=os.path.join(app.root_path, 'flaskr.db'),
    SECRET_KEY='development key',
    USERNAME='admin',
    PASSWORD='default'
))

def connect_db():
    """Connects to the specific database."""
    rv = sqlite3.connect(app.config['DATABASE'])
    rv.row_factory = sqlite3.Row
    return rv

def get_db():
    """Opens a new database connection if there is none yet for the
    current application context.
    """
    if not hasattr(g, 'sqlite_db'):
        g.sqlite_db = connect_db()
    return g.sqlite_db

def query_db(query, args=(), one=False):
    db = get_db()
    cur = db.execute(query, args)
    rv = [dict((cur.description[idx][0], value)
               for idx, value in enumerate(row)) for row in cur.fetchall()]
    return (rv[0] if rv else None) if one else rv

@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    if hasattr(g, 'sqlite_db'):
        g.sqlite_db.close()

def get_auprice():
    aup_price = None
    nowtime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    auprice_api = "https://www.gomegold.com/Index/MethodQuoteprice"  # 国美黄金接口     
    while not aup_price:
        try:
            aup_re = requests.post(auprice_api, data = {})
            aup_price = round(aup_re.json()['responseParams'],2)
        except Exception, e:
            print "接口异常 60s后重新尝试"
            time.sleep(60)
            continue
    print(nowtime + " 黄金实时价格     ----买入价：" + str(aup_price - 0.2) + "         ---卖出价：" + str(aup_price - 0.6))
    return aup_price

@manager.command
def sendsms(sms_template, nowtime=None, buy_price=None, sell_price=None, float_price=None, price_array=None, time_interval=None):
    __business_id = uuid.uuid1()
    if sms_template == "SMS_133964781": # 整数阈值短信模板
        params = "{\"time\":\"%s\",\"price_buy\":\"%s\",\"price_sell\":\"%s\"}" % (nowtime, buy_price, sell_price)
    elif sms_template == "SMS_133979780": # 监控10分钟的数据波动短信模板
        params = "{\"price_float\":\"%s\",\"price_array\":\"%s\"}" % (float_price, price_array)
    elif sms_template == "SMS_133969878": # 监控10分钟的数据波动短信模板
        params = "{\"time_interval\":\"%s\",\"price_float\":\"%s\", \"price_array\":\"%s\"}" % (time_interval, float_price, price_array)
    print(send_sms(__business_id, "13777414593", "王先锋", sms_template, params))

@manager.command
def add_entry():
    time_interval = 60
    db = get_db()
    price_array = []
    sendsms_time = datetime.datetime.now()
    while True:
        nowtime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        aup_price = get_auprice()
        buy_price = round(aup_price - 0.2,2)
        sell_price = round(aup_price - 0.6,2)
        price_array.append(sell_price)
        if len(price_array) >= 30:  # 监控半小时内的数据 一分钟一次 故数组长度为30即可
            price_array.pop(0)
        if len(price_array) >1:
            if (math.ceil(price_array[-1]) != math.ceil(price_array[-2])) & ((datetime.datetime.now()-sendsms_time).total_seconds()>1800): #10分钟内不重复发短信
                sendsms(sms_template = "SMS_133964781",nowtime = nowtime, buy_price = buy_price, sell_price = sell_price)
                sendsms_time = datetime.datetime.now()
                print "发送整数阈值短信成功"
        if len(price_array) >= 10:  # 监控10分钟的数据波动，10分钟波动大于0.5元需要关注
            if (abs(price_array[-1] - price_array[-10]) >= 0.5)  & ((datetime.datetime.now()-sendsms_time).total_seconds()>1800): #10分钟内不重复发短信
                sendsms(sms_template = "SMS_133979780", float_price = abs(price_array[-1] - price_array[-10]), price_array = str(price_array[-10]) + '~' + str(price_array[-1]))
                sendsms_time = datetime.datetime.now()
                print "发送10分钟内波动过大短信成功"
        if len(price_array) >= 20:  # 监控10分钟的数据波动，10分钟波动大于0.5元需要关注
            if (abs(price_array[-1] - price_array[-20]) >= 0.5) & ((datetime.datetime.now()-sendsms_time).total_seconds()>1800):
                sendsms(sms_template = "SMS_133969878", time_interval = "20", float_price = abs(price_array[-1] - price_array[-20]), price_array = str(price_array[-20]) + '~' + str(price_array[-1]))
                sendsms_time = datetime.datetime.now()
                print "发送20分钟内波动过大短信成功"
        # if len(price_array) >= 30:  # 监控10分钟的数据波动，10分钟波动大于0.5元需要关注
        #     if abs(price_array[-1] - price_array[-30]) >= 0.5 :
        #         sendsms(sms_template = "SMS_133969878", time_interval = "30", float_price = abs(price_array[-1] - price_array[-30]), price_array = str(price_array[-30]) + '~' + str(price_array[-1]))
        #         print "发送30分钟内波动过大短信成功"
        db.execute('insert into pricelists (datetime, price_cn) values (?, ?)',
                     [nowtime, aup_price])
        db.commit()
        print price_array   # 打印监控的价格数组
        time.sleep(time_interval)   # Delay for time_interval seconds.

@manager.command
def add_history_entry():
    time_interval = 24*60*60 # 每次执行一天的历史数据
    db = get_db()
    while True:
        price = query_db('select * from history_prices order by utctime limit 1')
        if price:
            last_time = price[0]['utctime']
            print last_time
        else:
            last_time = time.mktime(time.localtime())
        query_end = int(last_time * 1000)
        query_start = int((last_time - time_interval) * 1000)
        auprice_api = "https://data.gold.org/charts/goldprice/jsonp/currency/cny/weight/grams/width/811/period/" + str(query_start) + "," + str(query_end) #1525442960000,1526444960000"  # 历史黄金接口
        print auprice_api
        aup_re = requests.get(auprice_api, data = {})
        aup_prices = json.loads("{" + re.findall(r'[^({})]+', aup_re.content)[2] + "}")['CNY']
        for p in aup_prices:
            utctime = p[0]/1000
            price = p[1]
            datetime = time.strftime("%Y-%m-%d %H:%M:%S",time.localtime(utctime))
            db.execute('insert into history_prices (datetime, utctime, price_cn) values (?, ?, ?)',
                     [datetime, utctime, price])
            db.commit()
        print "日期：" + datetime + "的数据执行完毕，共计" + str(len(aup_prices)) + "条数据；休息60s"
        time.sleep(60)   # 休息10s后继续前一天的历史数据

if __name__ == "__main__":
    manager.run()
