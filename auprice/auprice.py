#!/usr/bin/env python3
# coding: utf-8
import sqlite3, os, requests, datetime, time, json,uuid
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash, jsonify, make_response, send_from_directory
from flask_wtf.csrf import CSRFProtect
from sendsms.demo_sms_send import send_sms
from config import CONFIG
from datetime import datetime
app = Flask(__name__) # create the application instance :)
app.config.from_object(__name__) # load config from current file

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

@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    if hasattr(g, 'sqlite_db'):
        g.sqlite_db.close()

def query_db(query, args=(), one=False):
    db = get_db()
    cur = db.execute(query, args)
    rv = [dict((cur.description[idx][0], value)
               for idx, value in enumerate(row)) for row in cur.fetchall()]
    return (rv[0] if rv else None) if one else rv

# @app.route('/.well-known/acme-challenge/C2vmfA83beBzU-Tm-Uh_C-NBBWlJKmgXxOzBWDWbTM8')
# def static_from_root():
#    return send_from_directory(".well-known/acme-challenge", "C2vmfA83beBzU-Tm-Uh_C-NBBWlJKmgXxOzBWDWbTM8",mimetype='text/plain')
# @app.route('/.well-known/acme-challenge/FE__xsBLbnEzPf2_Aoy32jA8NTq1ChiPLNARFLTChMo')
# def static_from_roots():
#     return send_from_directory(".well-known/acme-challenge", "FE__xsBLbnEzPf2_Aoy32jA8NTq1ChiPLNARFLTChMo",mimetype='text/plain')
@app.route('/sendsms')
def sendsms():
    __business_id = uuid.uuid1()
    tradeid = request.args.get('tradeid')  # 交易号，0代表开仓
    if tradeid == '0':
        phone = '13777414593'
    else:
        this_trade = query_db('select * from trades where id='+str(tradeid))
        this_user = query_db('select * from user where id='+str(this_trade[0]["userid"]))
        phone = this_user[0]['phone']
    category = int(request.args.get('category'))  # 交易类型
    deal_type = int(request.args.get('deal_type'))  # 交易类型
    if category==1 and deal_type == 0:
        deal_type_text = "买入开仓"  
    elif category==1 and deal_type == 1:
        deal_type_text = "卖出平仓"  
    elif category==-1 and deal_type == 0:
        deal_type_text = "卖出开仓"  
    else:
        deal_type_text = "买入平仓" 
    deal_type_text = tradeid+"号：" +  deal_type_text
    weight = float(request.args.get('weight'))  # 交易重量
    create_price = float(request.args.get('create_price'))  # 起始价格
    end_price = float(request.args.get('end_price'))  # 成交价格
    profit = round(weight * (end_price-create_price) * category, 2)  # 收益
    sms_template = "SMS_151545719"   # 成交提醒短信模板
    params = "{\"deal_type\":\"%s\",\"weight\":\"%s\",\"create_price\":\"%s\",\"end_price\":\"%s\",\"profit\":\"%s\"}" \
        % (deal_type_text, weight, create_price, end_price, profit)
    print(send_sms(__business_id, phone, '王先锋', sms_template, params))  # 签名不能更改！！
    resp = jsonify(json.dumps({"result":"发送短信成功"}))
    # 跨域设置
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/')
def index():
    user = get_user(request.args.get('user')) # 尝试获取账户英文名
    return render_template('index.html', user=user)

@app.route('/get_strategy')
def get_strategy():
    api = request.args.get('api')  # 代表是api的请求
    user = get_user(request.args.get('user'))
    if api:
        strategy = query_db("select * from strategy where userid="+str(user["id"])+" order by id DESC limit 1 ") # select the latest one strategy
        resp = jsonify(json.dumps(strategy[0]))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp

@app.route('/get_price')
def get_price():
    api = request.args.get('api')  # 代表是api的请求, 请求最近一次未被测试的数据
    datefrom = request.args.get('from')
    dateto = request.args.get('to')
    if api:
        if datefrom and dateto:
            pricelists = query_db("select * from pricelists where datetime>='"+datefrom+"' and datetime<='"+dateto+"'") # select n days
        else:
            pricelists = query_db('select * from pricelists order by id DESC limit 1') # select the last one entry
        resp = jsonify(json.dumps(pricelists))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp

@app.route('/today')
def today():
    user = get_user(request.args.get('user'))
    api = request.args.get('api')  # 代表是api的请求, 请求最近一次未被测试的数据
    if api:
        pricelists = query_db('select * from pricelists where test=0 order by id limit 1') # select 2 days
        this_test_id = pricelists[0]["id"]
        db = get_db()
        db.execute('update pricelists SET test=1 WHERE id>=? and id<?',[this_test_id,(int(this_test_id+10))])
        db.commit()
        flash('flag: this data has been tested')
        resp = jsonify(json.dumps(pricelists[0]))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    else:
        pricelists = query_db('select * from pricelists order by id DESC limit 10080') # select 2 days
        pricelists.reverse()
        # print pricelists
        return render_template('html/today_line.html', pricelists=pricelists,user=user)

@app.route('/analyse')
def analyse():
    user = get_user(request.args.get('user'))
    trades_lists = query_db("select * from trades where end_status=1 and userid=" + str(user["id"])+ " order by end_time")
    profit_accumulate_list = []
    profit_accumulate = 0
    time_list = []
    net_value_list = []
    for trade in trades_lists:
        net_array = {}
        profit_accumulate = profit_accumulate + trade["profit"]
        start_time = datetime.strptime(user['create_time'], '%Y-%m-%d %H:%M:%S')
        end_time = datetime.strptime(trade["end_time"], '%Y-%m-%d %H:%M:%S')
        cost_time = (end_time - start_time).total_seconds()
        profit_per_year = round(profit_accumulate/user['investment']/cost_time*(365*24*3600), 4)
        net_value = round(profit_accumulate / user['investment'] + 1,3)
        end_time = trade["end_time"]

        net_array["profit_per_year"] = profit_per_year
        net_array["value"] = net_value
        net_array["end_time"] = end_time
        net_value_list.append(net_array)
    return render_template('html/analyse_line.html', net_value_list=net_value_list,user=user)

@app.route('/get_new_data')
def get_new_data():
    price = query_db('select * from pricelists order by id DESC limit 1')
    return json.dumps(price[0])

@app.route('/get_user')
def get_user(*args):    
    api = request.args.get('userapi')  # 代表是api的请求
    name = request.args.get('name')  # name代表是中文实名
    if api and name:  # 先处理网络请求
        username = name
    else:
        username = args[0]
    defaut_user = query_db("select * from user where id=1")
    if not username:
        # user default user
        user = defaut_user
    else:
        # 中文名或英文名都尝试搜索
        user = query_db("select * from user where username='" + username + "' or name='" + username + "' limit 1")
    # 用做接口返回json
    if api:
        resp = jsonify(json.dumps(user[0]))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    else:
        
        return user[0]

@app.route('/history')
def history():
    user = get_user(request.args.get('user'))
    pricelists = query_db('select id, datetime, price_cn from history_prices order by utctime')
    dayslists = []
    interval = 100
    for item in pricelists:
        if item["id"] % interval == 0:
            dayslists.append(item) 
    return render_template('html/history_line.html', pricelists=dayslists,user=user)

@app.route('/trades')
def trades():
    user = get_user(request.args.get('user'))
    print user['username']
    new_price = json.loads(get_new_data())
    hold = request.args.get('hold')  # 持仓的key
    api = request.args.get('api')  # 代表是api的请求
    condition = request.args.get('condition')  # 返回condition
    if hold :
        # 只看持仓数据
        if condition:
            condition = condition + " and end_status!=1"
        else:
            condition = "end_status!=1"
        trades_lists = query_db("select * from trades where " + condition + " and userid='" + str(user["id"]) + "' \
            order by category, create_price DESC")
        # 用做接口返回json
        if api:
            resp = jsonify(json.dumps(trades_lists))
            # 跨域设置
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
    else:
        trades_lists = query_db("select * from trades where userid='" + str(user["id"]) + "' order by end_status, id DESC")
    profits_done = [0,0] # 已成交收益
    weights_hold = [0,0] # 持仓重量，[先买入, 先卖出]
    mean_price = [0,0] # 
    for trade in trades_lists:
        if trade["category"] ==1:  # 先买入
            if (trade["create_status"] == 1) & (trade["end_status"] != 1):  # 已开仓 等待 平仓
                mean_price[0] = round((mean_price[0] * weights_hold[0] + trade["create_price"] * trade["weight"]) / (weights_hold[0]+trade["weight"]),2)
                weights_hold[0] = weights_hold[0] + trade["weight"]

            elif (trade["create_status"] == 1) & (trade["end_status"] == 1):  # 完成交易
                profits_done[0] = trade["profit"] + profits_done[0]
        else:  # 先卖出
            if (trade["create_status"] == 1) & (trade["end_status"] != 1):  # 已开仓 等待 平仓
                mean_price[1] = round((mean_price[1] * weights_hold[1] + trade["create_price"] * trade["weight"]) / (weights_hold[1]+trade["weight"]),2)
                weights_hold[1] = weights_hold[1] + trade["weight"]
            elif (trade["create_status"] == 1) & (trade["end_status"] == 1):  # 完成交易
                profits_done[1] = trade["profit"] + profits_done[1]

    count = len(trades_lists)
    if trades_lists:
        now_time = datetime.strptime(trades_lists[0]["create_time"],"%Y-%m-%d %H:%M:%S")
    else:
        now_time = datetime.now()
    start_time = datetime.strptime(user['create_time'], '%Y-%m-%d %H:%M:%S')
    cost_time = (now_time - start_time).total_seconds()
    profit_per_year = round((profits_done[0] + profits_done[1])/user['investment'] / cost_time * (365*24*3600) * 100, 2)
    hold_profit = weights_hold[0]*(new_price["price_cn"]-0.2-mean_price[0])+weights_hold[1]*(mean_price[1]-(new_price["price_cn"]+0.2))
    hold_cost = weights_hold[0] * mean_price[0] + weights_hold[1] * mean_price[1]
    if hold_cost:
        profit_hold_percent = round(hold_profit / hold_cost * 100, 2)
    else:
        profit_hold_percent = 0
    return render_template('html/trades.html',user=user, profit_hold_percent=profit_hold_percent, trades_lists=trades_lists, count=count, new_price=new_price,mean_price=mean_price, profits_done=profits_done, weights_hold=weights_hold, profit_per_year=profit_per_year)

csrf = CSRFProtect()
@csrf.exempt
@app.route('/add', methods=['POST'])
def add_trade():
    user = get_user(request.args.get('user'))# 尝试获取账户名
    api = request.args.get('api')  # 代表是api的请求
    if api:
        category = int(request.json['category'])
        weight = float(request.json['weight'])
        create_status = int(request.json['create_status'])
        create_price = float(request.json['create_price'])
        price_for = float(request.json['price_for'])  # 记录当前开仓的触发价格
    else:
        category = int(request.form['category'])
        weight = float(request.form['weight'])
        create_status = int(request.form['create_status'])
        create_price = float(request.form['create_price'])
        price_for = create_price
    create_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    end_status = False
    db = get_db()
    db.execute('insert into trades (category, weight, create_time, create_price, price_for, create_status, end_status, userid ) \
        values (?, ?, ?, ?, ?, ?, ?, ?)',
        [category, weight, create_time, create_price, price_for, create_status, end_status, user["id"]])
    db.commit()
    flash('New entry was successfully posted')
    if api:
        resp = jsonify(json.dumps({"result":True}))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    else:
        return redirect(url_for('trades',user=user['username']))

@csrf.exempt
@app.route('/add_strategy', methods=['POST'])
def add_strategy():
    user = get_user(request.args.get('user'))# 尝试获取账户名
    api = request.args.get('api')  # 代表是api的请求
    if api:
        content = request.json['content']
        create_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db = get_db()
        db.execute('insert into strategy (content, create_time, userid ) values (?, ?, ?)',
            [content, create_time, user["id"]])
        db.commit()
        flash('New strategy was successfully posted')
        resp = jsonify(json.dumps({"result":True}))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    else:
        return jsonify(json.dumps({"result":"Faild"}))

@csrf.exempt
@app.route('/edit', methods=['POST'])
def edit_trade():
    user = get_user(request.args.get('user'))# 尝试获取账户名
    api = request.args.get('api')  # 代表是api的请求
    if api:
        tradeid = int(request.json['tradeid'])
    else:
        tradeid = int(request.form['tradeid'])
    this_trade = query_db('select * from trades where id='+str(tradeid))
    # 如果没有传值，则默认开仓时候的状态
    if api:
        category = this_trade[0]["category"]
        create_status = this_trade[0]["create_status"]
        create_time = this_trade[0]["create_time"]
        create_price = this_trade[0]["create_price"]
        weight = this_trade[0]["weight"]
        end_status = int(request.json['end_status'])
        end_price = float(request.json['end_price'])
    else:
        weight = float(request.form['weight'])
        category = int(request.form['category'])
        create_status = int(request.form['create_status'])
        create_time = request.form['create_time']
        create_price = float(request.form['create_price'])
        end_status = int(request.form['end_status'])
        if request.form['end_price']:
            end_price = float(request.form['end_price'])
        else:
            end_price = 0

    # end time
    end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    
    # 成交以后计算利润
    if int(create_status) == 1 and int(end_status) == 1:
        profit = (end_price - create_price) * category * weight
        start_time = time.mktime(datetime.strptime(create_time, '%Y-%m-%d %H:%M:%S').timetuple())
        trade_time = time.mktime(datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S').timetuple())
        year_ratio = round((end_price - create_price) * category / (create_price) * (365*24*3600)/(trade_time-start_time),4)
    else:
        profit = 0
        year_ratio = 0
    db = get_db()
    db.execute('update trades SET category=?, weight=?, create_time=?, create_price=?, create_status=?, end_time=?, end_price=?, end_status=?, profit=?, year_ratio=? \
        WHERE id=?',
        [category, weight, create_time, create_price, create_status, end_time, end_price, end_status, profit, year_ratio,tradeid])
    db.commit()
    flash('New entry was successfully edited')
    if api:
        resp = jsonify(json.dumps({"result":True}))
        # 跨域设置
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    else:
        return redirect(url_for('trades',user=user['username']))

@app.route('/del', methods=['GET'])
def del_trade():
    tradeid = int(request.args.get('tradeid'))
    print tradeid
    db = get_db()
    db.execute('delete from trades WHERE id=?',[tradeid])
    db.commit()
    flash('an entry was deleted')
    return redirect(url_for('trades'))

if __name__ == '__main__':
    app.run(debug=True, port=5000, ssl_context=('/Users/pioneer/www/cert/certificate.crt', '/Users/pioneer/www/cert/private.key'))
