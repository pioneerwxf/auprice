#!/usr/bin/env python3
# coding: utf-8
import sqlite3, os, requests, datetime, time, json
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash
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

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/today')
def today():
    pricelists = query_db('select * from pricelists')
    # print pricelists
    return render_template('html/today_line.html', pricelists=pricelists)

@app.route('/get_new_data')
def get_new_data():
    price = query_db('select * from pricelists order by id DESC limit 1')
    return json.dumps(price[0])

@app.route('/history')
def history():
    pricelists = query_db('select id, datetime, price_cn from history_prices order by utctime')
    dayslists = []
    interval = 100
    for item in pricelists:
        if item["id"] % interval == 0:
            dayslists.append(item) 
    return render_template('html/history_line.html', pricelists=dayslists)

@app.route('/trades')
def trades():
    new_price = json.loads(get_new_data())
    trades_lists = query_db('select * from trades order by end_status, create_time DESC')
    profits_done = [0,0]
    weights_hold = [0,0]
    mean_price = [0,0]
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
    return render_template('html/trades.html', trades_lists=trades_lists, count=count, new_price=new_price,mean_price=mean_price, profits_done=profits_done, weights_hold=weights_hold)

@app.route('/add', methods=['POST'])
def add_trade():
    category = int(request.form['category'])
    weight = float(request.form['weight'])
    create_status = int(request.form['create_status'])
    create_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    create_price = float(request.form['create_price'])
    db = get_db()
    db.execute('insert into trades (category, weight, create_time, create_price, create_status ) \
        values (?, ?, ?, ?, ?)',
        [category, weight, create_time, create_price, create_status])
    db.commit()
    flash('New entry was successfully posted')
    return redirect(url_for('trades'))

@app.route('/edit', methods=['POST'])
def edit_trade():
    tradeid = int(request.form['tradeid'])
    category = int(request.form['category'])
    weight = float(request.form['weight'])
    create_status = int(request.form['create_status'])
    create_time = request.form['create_time']
    create_price = float(request.form['create_price'])
    
    # end time
    end_status = int(request.form['end_status'])
    if end_status != -1:
        if request.form['end_time']:
            end_time = request.form['end_time']
        else:
            end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        end_time = None
    if request.form['end_price']:
        end_price = float(request.form['end_price'])
    else:
        end_price = 0
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
    return redirect(url_for('trades'))

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
    app.run(debug=True)
