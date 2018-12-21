#!/usr/bin/env python3
# coding: utf-8
import sqlite3, os, requests, datetime, time, uuid, math, re, json, urllib2, urllib
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash
from flask_script import Manager
from datetime import datetime
app = Flask(__name__) # create the application instance :)
app.config.from_object(__name__) # load config from current file
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

def get_user(username):    
    user = query_db("select * from user where username='" + username  + "' limit 1")        
    return user[0]

def max_min_price_inrange(current_time,nhour):
    interval_numbers = nhour*60
    qrsult = query_db("select min(price_cn) as min_price, max(price_cn) as max_price from ( select price_cn from pricelists where datetime<'"+str(current_time)+"' order by id DESC limit "+str(interval_numbers)+")")
    max_price = qrsult[0]["max_price"]
    min_price = qrsult[0]["min_price"]
    # print "求",nhour,"小时内的最大最小值为：", [max_price,min_price]
    return [max_price,min_price]

# 计算n日均值
def get_avg_price(current_time,n):
    intervel_numbers = n*24*60
    qrsult = query_db("select avg(price_cn) as avg_price from ( select price_cn from pricelists where datetime<'"+current_time+"' order by id DESC limit "+str(intervel_numbers)+")")
    avg_price = round(qrsult[0]["avg_price"],2)

    return avg_price

def get_deal_space():
    pass

# 产生一次新的策略，可被调用，可以crontab执行
def gen_new_strategy(current_time,current_price,user):
    print "为用户：", user["username"] , "计算最新策略空间"
    strategy = []
    user = get_user(user["username"])   # 重新获取user的信息，可能balance已经更新过
    if not user:
        print "当前策略没有对应用户"
        return strategy
    current_price = float(current_price)
    investment = user["investment"]     # 总投资额度
    balance =  user["balance"]          # 监控剩余资金
    hold_money = user["hold_money"]     # 持仓金额
    CONFIG = json.loads(user["config"])
    points = CONFIG["points"]
    deal_range = CONFIG["range"]
    point_distance = round(float(deal_range) / float(points-1) , 2)
    left_points = 0 # 初始化没有下单的位置点数
    holds = query_db('select * from trades where end_status!=1 and userid='+str(user["id"])+' order by category, create_price DESC')
    

    # 在当前时间，对于当前空间，进行布点扫描
    avg_price = get_avg_price(current_time, 1) # 使用1天的均值作为中间值
    media_point = round(float(avg_price) / point_distance,0) * point_distance
    update_config(media_point,user)  # 更新用户的config
    # 1. 如果当余额大于零则继续布局开仓
    if balance > 0:
        # 当前价格落在交易区间以外时，即停止开仓交易，说明急涨急跌，以至均价跟不上变化，可以暂停交易，也可以改变策略
        if current_price < (media_point-float(deal_range)/2) or current_price > (media_point+float(deal_range)/2):
            print str(current_time)+"超出区间，没有策略，停止开仓交易当前价"+str(current_price)+", 中间价"+str(media_point)
        else:
            # 1.1 开仓策略：落在区间范围内时继续布局
            for p in range(0,points):
                create_price = round(media_point-float(deal_range)/2 + p*point_distance,2)
                found_up_points=0; # 该点看涨持仓 0=未下单
                found_down_points=0; # 该店看跌持仓 0=未下单
                
                # 和每个持仓进行比对
                for hold in holds[:]: # 使用holds[:]替代holds，为了使remove()后不影响原来的holds ！！！重要
                    # 如果针对该点已经持仓，或者该持仓在靠近布局点，则跳过该点
                    if(hold["price_for"] == create_price or abs(hold["create_price"]-create_price)<point_distance/2):
                        # strategy.append(hold)
                        # holds.remove(hold)  # 已经进入策略空间的持仓移出
                        if hold["category"]==1:
                            found_up_points=1
                        else:
                            found_down_points=1
                
                # 如果没找到持仓，则将该点写入策略库中
                # todo 
                # 权重部分以后写，当前是保守策略：超出均值不看涨，低于均值不看跌
                if found_up_points==0 and create_price < media_point:
                    left_points = left_points + 1
                    strategy.append({'id':0,'category':1,'create_price':create_price,'weight':0})
                if found_down_points==0 and create_price > media_point:
                    left_points = left_points + 1
                    strategy.append({'id':0,'category':-1,'create_price':create_price,'weight':0})

            # 此时得出每个点的可布局重量
            per_amount = int(balance / avg_price / left_points)
            for s in strategy:
                if(s["id"] == 0):
                    s["weight"] = per_amount

    # 2 持仓策略，调整预期平仓价格
    # 获取合理的交易价差, 返回值为[up_space, down_space]
    # deal_space = get_deal_space
    deal_space = [CONFIG["up_price_difference"],CONFIG["down_price_difference"]]
    up_space = deal_space[0]
    down_space = deal_space[1]
    for hold in holds:
        if hold["category"] == 1:
            hold["end_price"] = hold["create_price"] + up_space
        else:
            hold["end_price"] = hold["create_price"] - down_space
        strategy.append(hold)

    # 3. 将开仓持仓策略全部写入策略库
    # for s in strategy:
    #     print s
    print add_strategy(strategy,user)

def add_strategy(content, user):
    db = get_db()
    # 获取最新的策略比对是否一样，一样就不再更新
    strategy = query_db("select * from strategy where userid="+str(user["id"])+" order by id DESC limit 1 ")
    if len(strategy)>0:
        latest_content = strategy[0]['content']
    else:
        latest_content = ""
    content = json.dumps(content)
    if latest_content == content :
        return False
    else:
        create_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.execute('insert into strategy (content, create_time, userid ) values (?, ?, ?)',
            [content, create_time, user["id"]])
        db.commit()
        return True

def get_new_price():
    price = query_db('select price_cn from pricelists order by id DESC limit 1')
    latest_price = json.dumps(price[0]["price_cn"])
    return latest_price

# 为指定用户更新策略
@manager.command
def update_strategy(user):
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_price = get_new_price()
    gen_new_strategy(current_time,current_price,user)

def update_config(media_point, user):
    CONFIG = json.loads(user["config"])
    CONFIG["media_point"] = media_point
    config = json.dumps(CONFIG)
    db = get_db()
    db.execute("update user SET config=? WHERE id=?", [config, user["id"]])
    db.commit()

# 每15分钟run一次，为所有用户更新策略
@manager.command
def run_all():
    users = query_db('select * from user')
    for user in users:
        # 为使用此策略的用户更新策略
        if user["strategy_name"] == 'wxfs':
            update_strategy(user)

if __name__ == "__main__":
    manager.run()
