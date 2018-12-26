// ==UserScript==
// @name         工行黄金自动交易
// @namespace    icbc
// @version      1.0
// @description  登录工行进行黄金自动交易
// @author       xianfeng wang
// @include      https://mybank.icbc.com.cn/servlet/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // configurations
    var interval_time = 5000; // 循环监控间隔时间 单位 毫秒
    var siteUrl = 'https://www.augoto.com'  // 默认线上
    var userdiv = $("#custName_id2",top.window.document); // 欢迎您，XXX
    var name = userdiv.text().split('，')[1];
    var user = get_userinfo(name); // 从线上获取userinfo
    if (user.is_local == 1){
        siteUrl = 'https://augoto.com:5000';
        user = get_userinfo(name);
    }
    console.log(siteUrl);
    // 设置配置文件
    // {"up_price_difference":0.5,"down_price_difference":0.5,"price_error":0.05,"range":3,"points":7,"media_point":273}
    var CONFIG = JSON.parse(user.config);
    var total_money = user.investment; // 设置满仓额度
    var up_price_difference = CONFIG.up_price_difference; //0.5 // 设置上涨价差，到达价差即可交易，后续自动生成最佳价差
    var down_price_difference = CONFIG.down_price_difference; //0.5 // 设置看跌价差，到达价差即可交易，后续自动生成最佳价差
    var price_error = CONFIG.price_error; // 0.05 // 设置自动交易时允许的误差0.05元
    var range = CONFIG.range; // 3 设置交易区间，超过range范围即可止损 5元
    var points = CONFIG.points; // 5 设置交易点数，即在交易区间内平均或正态分布 points个点。10个点
    var media_point = CONFIG.media_point //273; // 设置当前7日均值，以后由系统给出，272元/g
    // var holds = get_holds(name); // 初次获取持仓数据
    //增加一次策略
    // gen_tactic_matrix(range,points,media_point,total_money,holds);
    // 获取最新策略空间
    var tactic_matrix = get_latest_strategy(name);
    //console.log(tactic_matrix);
    load_userinfo(); // 显示用户信息在页面
    var main_area = $(document.getElementById('_left'));
    if (main_area.length == 1 & user.is_active == 1){
        // 确认在正确的页面里 并且 当前user是参与自动化交易的
        console.log('√√√√√√√√√√ I am in the right place √√√√√√ begin to work  √√√√√√√√')
        // 开始监控
        var mainInterval = setInterval(main_function, interval_time);
    }
    function main_function(){
        // 首先获取当前交易中间价
        // online:
        var mid_price = parseFloat(get_current_price());
        // test:
        // var mid_price = parseFloat(get_history_price());
        var sell_price = mid_price - 0.2;
        var buy_price = mid_price + 0.2;
        for (var i in tactic_matrix){
            var list = tactic_matrix[i]
            // console.log(list);
            // 处理先买入后卖出看涨的订单
            if (list.category == 1){
                // 准备卖出平仓——已经有交易id的
                if(list.id != 0){
                    if (sell_price > list.end_price){
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        console.log("ID:"+list.id+"号准备交易，价差："+(sell_price - list.create_price)+"，重量："+list.weight);
                        // online:
                        if (user.is_test==0){
                            buy_then_sell(list.id,1,list.weight,list.create_price); // 1 代表卖出平仓
                        }else{
                            // test: 回测时直接修改交易记录，省去一系列流程
                            close_or_open_trade(1,list.id,sell_price,list.weight,list.create_price) // 代表先"买入"类别,tradeid=0则是开仓
                        }
                        break;
                    }
                }else{
                    // 准备买入开仓
                    // 如果当前买入价和矩阵空间的误差足够小  但买入价仍旧要不大于设定即可开始交易
                    if (buy_price < list.create_price){
                        console.log('当前买入价格'+buy_price+'设定价格'+list.create_price)
                        console.log('准备买入');
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        // online:
                        if (user.is_test==0){
                            buy_then_sell(list.id,0,list.weight,list.create_price); // 0 代表买入开仓
                        }else{
                            // test: 回测时直接修改交易记录，省去一系列流程
                            close_or_open_trade(1,list.id,buy_price,list.weight,list.create_price) // 1代表先"买入"类别,tradeid=0则是开仓
                        }
                    }
                }
                //处理先卖出后买入的看跌订单
            }else if(list.category == -1){
                // 准备买入平仓——已有交易id
                if(list.id != 0){
                    if (buy_price < list.end_price){
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        console.log("ID:"+list.id+"号准备交易，价差："+(buy_price - list.create_price)+"，重量："+list.weight);
                        // online:
                        if (user.is_test==0){
                            sell_then_buy(list.id,1,list.weight,list.create_price); // 1 代表买入平仓
                        }else{
                            // test: 回测时直接修改交易记录，省去一系列流程
                            close_or_open_trade(-1,list.id,buy_price,list.weight,list.create_price) // -1 代表先“卖出”类别，tradeid=0则是开仓
                        }
                        break;
                    }
                }else{
                    // 准备卖出开仓
                    if (sell_price > list.create_price){
                        console.log('当前卖出价格：'+sell_price+'，设定价格：'+list.create_price)
                        console.log('准备卖出');
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        // online:
                        if (user.is_test==0){
                            sell_then_buy(list.id,0,list.weight,list.create_price); // 0 代表卖出开仓
                        }else{
                            // test: 回测时直接修改交易记录，省去一系列流程
                            close_or_open_trade(-1,list.id,sell_price,list.weight,list.create_price) // -1 代表先“卖出”类别，tradeid=0则是开仓
                        }
                        break;
                    }
                }
            }
        }
    }

////////////////////////////////////////////////
///// 定义基本操作：先卖出和先买入开仓和平仓 ////////
////////////////////////////////////////////////

    // 先买入后卖出函数 buy_or_sell按钮： 0=买入开按钮 1=卖出平仓按钮, pre_deal_price：触发交易的价位，并非实际交易价
    function buy_then_sell(tradeid,buy_or_sell,amount,create_price){
        var deal_type;
        if(buy_or_sell==0){deal_type="↑买入开仓";}else{deal_type="↑卖出平仓";}
        console.log(deal_type+" 当前创建价格: ￥"+create_price+"/g");
        //选择先买入后卖出tab
        choose_firstbuy_tab();
        // 传入1，代表卖出平仓；
        choose_firstbuy_radio(buy_or_sell);
        input_up_amount_value(amount);
        click_next_step(1,buy_or_sell, amount,function(can_next){ // 1代表先"买入"类型
            if (can_next){ // 如果可交易数量足够才会继续下一步
                click_confirm_btn(function(deal_price){
                    // 提交页面会返回交易的真实价格deal_price
                    console.log("当前交易价格: ￥"+deal_price+"/g");
                    sendSms(1, tradeid, buy_or_sell, amount, create_price, deal_price); // 1代表先"买入"类型
                    close_or_open_trade(1,tradeid,deal_price,amount,create_price) // 1代表先"买入"类别,tradeid=0则是开仓
                })
            }else{
                console.log('可交易数量不够，取消交易');
            }
        });
    }
    // 先卖出后买入函数, sell_or_buy 0=卖出开仓  1=买入平仓
    function sell_then_buy(tradeid,sell_or_buy,amount,create_price){
        var deal_type;
        if(sell_or_buy==0){deal_type="↓卖出开仓"}else{deal_type="↓买入平仓"}
        console.log(deal_type+" 当前创建价格: ￥"+create_price+"/g");
        choose_firstsell_tab();
        // 上面这个tab按钮点了很久后才会加载刷新，后续动作需要等待5s
        setTimeout(function(){
            choose_firstsell_radio(sell_or_buy);
            input_down_amount_value(amount);
            click_next_step(-1,sell_or_buy,amount,function(can_next){ // -1类别代表先卖出类型
                if (can_next){
                    click_confirm_btn(function(deal_price){
                        console.log("当前交易价格: ￥"+deal_price+"/g");
                        sendSms(-1, tradeid,sell_or_buy, amount, create_price, deal_price); // -1类别代表先卖出类型
                        close_or_open_trade(-1,tradeid,deal_price,amount,create_price) // -1 代表先“卖出”类别，tradeid=0则是开仓
                    })
                }else{
                    console.log('可交易数量不够，取消交易');
                }
            });
        },3000); //间隔5秒执行先卖出后买入tab后的其他动作
    }


////////////////////////////////////////////////
///// 以下是和工行交互的代码，大部分是模拟点击 ////////
////////////////////////////////////////////////

    // 获取当前价格
    function get_current_price(){
        var left_iframe = $(document.getElementById('_left'));
        var mid_price = left_iframe.contents().find("td#middleprice_901");
        if (mid_price.length == 1){
            console.log("获取当前价格："+mid_price.text());
            return mid_price.text();
        }
    }
    // 输入指定先买入后卖出(多头)交易数量函数, var: amount./g
    function input_up_amount_value(amount){
        // 如果不指定交易量直接拒绝交易
        if (amount == null){ return }
        // 最小交易重量1g
        if (amount<1) { amount = 1; }
        var right_iframe = $(document.getElementById('_right'));
        var mount_input = right_iframe.contents().find("tr#tranamount input");
        if (mount_input.length == 1){
            mount_input.val(amount);
        }
    }
    // 输入指定先卖出后买入（空头）交易数量函数, var: amount./g
    function input_down_amount_value(amount){
        // 如果不指定交易量直接拒绝交易
        if (amount == null){ return }
        // 最小交易重量1g
        if (amount<1) { amount = 1; }
        var right_iframe = $(document.getElementById('_right'));
        var mount_input = right_iframe.contents().find("td input#goldAmount");
        if (mount_input.length == 1){
            mount_input.val(amount);
        }
    }

    // 模拟点击先买入后卖出tab
    function choose_firstbuy_tab(){
        console.log("选择『先买入后卖出』tab");
        var firstbuy_tab = $("#ebdp-pc4promote-menu-level1-text-1");
        //console.log(firstbuy_tab);
        if(firstbuy_tab.length==1){firstbuy_tab[0].click();}
    }
    //模拟点击先卖出后买入tab
    function choose_firstsell_tab(){
        console.log("选择『先卖出后买入』tab");
        var firstsell_tab = $("#ebdp-pc4promote-menu-level1-text-2");
        //console.log(firstsell_tab);
        if(firstsell_tab.length==1){firstsell_tab[0].click();}
    }

    // 先买入后卖出的交易类型，buy=买入开仓，传入0，sell=卖出平仓，传入1
    function choose_firstbuy_radio(buy_or_sell){
        console.log("选择交易类型：买入开仓/卖出平仓");
        var right_iframe = $(document.getElementById('_right'));
        var firstbuy_radio = right_iframe.contents().find("#transign input[name*='transSignRadio']");
        //console.log(firstbuy_radio);
        if(firstbuy_radio.length==2){firstbuy_radio[buy_or_sell].click();}
    }
    // 先卖出后买入的交易类型，sell=卖出开仓，传入0，sell=买入平仓，传入1
    function choose_firstsell_radio(sell_or_buy){
        console.log("选择交易类型：卖出开仓/买入平仓");
        var right_iframe = $(document.getElementById('_right'));
        var firstsell_radio = right_iframe.contents().find("input#transSign");
        //console.log(firstsell_radio);
        if (firstsell_radio.length ==2) {
            firstsell_radio[sell_or_buy].click();
        }
    }
    // 模拟点击下一步
    function click_next_step(category,is_open,amount, callback){
        console.log("点击下一步");
        var right_iframe = $(document.getElementById('_right'));
        var submit = right_iframe.contents().find("#tijiao");
        var validBalance = right_iframe.contents().find("#validBalance a");
        console.log(validBalance);
        var maxAmount_div, maxAmount;
        validBalance[0].click();
        setTimeout(function(){
            if(is_open == 0){ // 针对开仓的情况监测最大可交易数量
                if(category == 1){
                    right_iframe.contents().find('#notice').remove();
                    maxAmount_div = right_iframe.contents().find("#maxgoldAmount");
                }else{
                    right_iframe.contents().find("#maxAmount span").remove();
                    maxAmount_div = right_iframe.contents().find("#maxAmount");
                }
                maxAmount = parseFloat(maxAmount_div.text())
                console.log(maxAmount)
                if(submit.length==1 & maxAmount>amount){
                    submit[0].click();
                    // 通过callback 返回是否成功进行下一步
                    callback(true);
                }else{
                    callback(false);
                }
            }else{ // 平仓一律通知成功下一步
                submit[0].click();
                callback(true);
            }
        },2000);
    }
    //模拟点击提交
    function click_confirm_btn(callback){
        console.log("准备提交交易了。需要多次循环确认交易按钮。。。。。");
        var interval_for_confirm = setInterval(function(){
            var right_iframe = $(document.getElementById('_right'));
            var confirm = right_iframe.contents().find("#queren");
            var total_price = right_iframe.contents().find('span.redTrace:eq(1)').text();
            var total_amount = right_iframe.contents().find('span.redTrace:eq(0)').text();
            var deal_price = (parseFloat(total_price.replace(",", ""))/parseFloat(total_amount)).toFixed(2);
            var firstbuy_tab = $("#ebdp-pc4promote-menu-level1-text-1");
            var firstsell_tab = $("#ebdp-pc4promote-menu-level1-text-2");
            if (confirm.length ==1 ){
                if (user.is_local == 0){
                    confirm[0].click(); // ！！！！本地测试时不执行确认按钮！！！！！！
                }
                // 一但找到提交按钮 立即停止，避免重复交易
                clearInterval(interval_for_confirm);
                // 播放声音提醒交易成功
                playVoice();
                //回到主交易界面，开始新的循环
                firstsell_tab[0].click();
                firstbuy_tab[0].click();
                //返回真实交易价格
                callback(deal_price);

            }
        }, 4000);
    }

/////////////////////////////////////////////////////// ///////
///// 以下是和augoto交互的代码，获取持仓，关闭交易，和发送短信 ////////
/////////////////////////////////////////////////////// ///////
    // 获取augoto.com的用户信息，name来自工行登录后的用户名
    function get_userinfo(name){
        var result = null;
        $.ajax({
            url: siteUrl+"/get_user?userapi=1&name="+encodeURI(name),
            type: 'get',
            async: false,
            success: function(data) {
                result = JSON.parse(data);
            }
        });
        return result;
    }

    // 获取augoto.com持仓数据 condition=sql 里的 where
    function get_holds(name){
        //console.log('获取一次持仓数据')
        // online:
        var condition = 'id>235';
        // test:
        // var condition = 'id>75';
        var result = null;
        $.ajax({
            url: siteUrl+"/trades?hold=1&api=1&condition="+condition+"&user="+encodeURI(name),
            type: 'get',
            async: false,
            success: function(data) {
                result = JSON.parse(data);
            }
        });
        return result;
    }

    // 修改augoto的交易数据，有id是平仓，没id是开仓，category=1先买入 -1先卖出，最终状态都是1=成交，没有挂单和观望
    function close_or_open_trade(category,tradeid,deal_price,weight,create_price){
        if (tradeid==0) {
        // 没有交易id，执行开仓动作
            var post_data = {'category':category,'create_price':deal_price, 'create_status':1, 'weight':weight, 'price_for':create_price}
            console.log(post_data)
            console.log('通知augoto开仓成交，创建一条记录');
            $.ajax({
                url: siteUrl+"/add?api=1"+"&user="+encodeURI(name),
                type: 'post',
                dataType: 'json',
                contentType: "application/json",
                data: JSON.stringify(post_data),
                success: function(data) {
                    // 平仓成功后请求最新配置数据：持仓、策略等
                    update_configuration();
                    var result = data;
                    return result;
                },
                error: function( jqXhr, textStatus, errorThrown ){
                    console.log( errorThrown );
                }
            });
        }else{
        // 有交易id，执行平仓动作 不修改weight的值
            post_data = {'tradeid':tradeid, 'weight':weight, 'end_price':deal_price, 'end_status':1}
            console.log('通知augoto平仓成交');
            $.ajax({
                url: siteUrl+"/edit?api=1"+"&user="+encodeURI(name),
                type: 'post',
                dataType: 'json',
                contentType: "application/json",
                data: JSON.stringify(post_data),
                success: function(data) {
                    // 平仓成功后请求最新配置数据：持仓、策略等
                    update_configuration();
                    var result = data;
                    return result;
                },
                error: function( jqXhr, textStatus, errorThrown ){
                    console.log( errorThrown );
                }
            });
        }
    }

    // 命令augoto发送成交短信 //category：1看涨 or -1看跌，deal_type:0开仓 or 1平仓
    function sendSms(category,tradeid,deal_type, weight, create_price, deal_price)
    {
        console.log("准备发送短信");
        if (deal_type == 0){
            create_price = deal_price; // 开仓时，创建价格即是最终的交易价格，以交易价为准
        }
        var result = null;
        $.ajax({
            url: siteUrl+"/sendsms?category="+category+"&tradeid="+tradeid+"&deal_type="+deal_type+"&weight="+weight+"&create_price="+create_price+"&end_price="+deal_price,
            type: 'get',
            async: false,
            success: function(data) {
                result = data;
            }
        });
        return result;
    }

    function get_history_price(){
        var result = null;
        $.ajax({
            url: siteUrl+"/today?api=1",
            type: 'get',
            async: false,
            success: function(data) {
                result = JSON.parse(data).price_cn;
                console.log(JSON.parse(data).datetime)
            }
        });
        return result;
    }

    // 增加新的策略空间
    function add_strategy(content){
        // 没有交易id，执行开仓动作
        var post_data = {'content':JSON.stringify(content)}
        $.ajax({
            url: siteUrl+"/add_strategy?api=1"+"&user="+encodeURI(name),
            type: 'post',
            dataType: 'json',
            contentType: "application/json",
            data: JSON.stringify(post_data),
            success: function(data) {
                var result = data;
                console.log(result);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log( errorThrown );
            }
        });
    }

    // 获取augoto.com 的策略数据
    function get_latest_strategy(name){
        var result = null;
        $.ajax({
            url: siteUrl+"/get_strategy?hold=1&api=1&user="+encodeURI(name),
            type: 'get',
            async: false,
            success: function(data) {
                result = JSON.parse(data);
                result = JSON.parse(result.content);
            }
        });
        return result;
    }



/////////////////////////////////////////////////////// ///////
///// 以下是和本地逻辑，策略空间、播放提醒声音等 ////////
/////////////////////////////////////////////////////// ///////
    // 生成策略空间矩阵
    function gen_tactic_matrix(range,points,media_point,total_money,holds){
        console.log("生成策略空间")
        // 计算当前布局区间范围
        var current_range = [media_point-parseFloat(range)/2 , media_point+parseFloat(range)/2]
        var left_money = user.balance; // 监控剩余资金
        var left_points = 0 // 监控剩余点位
        var tactic_matrix = [];
        holds.forEach(function(hold) {
            // 为尺寸增加平仓的点 end_price
            if(hold.id>0){
                delete hold.create_time;
                delete hold.create_status;
                delete hold.end_time;
                delete hold.profit;
                delete hold.end_status;
                delete hold.year_ratio;
                delete hold.end_status;
                if (hold.category==1){
                    hold.end_price = hold.create_price + up_price_difference;
                }else{
                    hold.end_price = hold.create_price - down_price_difference;
                }
            }
        });
        console.log("剩余资金："+left_money);
        console.log("中间点位："+media_point);
        if(left_money > 0){
            var distance = parseFloat(range/(points-1)).toFixed(2);
            for (var p=0;p<points;p++){
                var create_price = (media_point-parseFloat(range/2) + p*distance).toFixed(2);
                var found_up_points=0; //找到看涨的点已经下单
                var found_down_points=0; //找到看跌的点已经下单
                holds.forEach(function(hold) {
                    // if(Math.abs(hold.create_price-create_price)<distance/2){  // 判断当前持仓价格在目标点附近，就跳过该目标点
                    if(hold.price_for == create_price || Math.abs(hold.create_price-create_price)<distance/2 ){ // 判断当前持仓点的price_for和目标点一致，也可以跳过该目标点
                        var index = holds.indexOf(hold);
                        holds.splice(index,1); // 从第index个元素起，删除后面的1个元素
                        tactic_matrix.push(hold);
                        if(hold.category==1){found_up_points=1}else{found_down_points=1}
                    }
                });
                // 均值以上不再买入
                if (found_up_points==0 & create_price <= media_point){
                    left_points = left_points + 1 ;
                    tactic_matrix.push({'id':0,'category':1,'create_price':create_price,'weight':0});
                }
                // 均指以下不再卖出
                if(found_down_points==0 & create_price > media_point){
                    left_points = left_points + 1 ;
                    tactic_matrix.push({'id':0,'category':-1,'create_price':create_price,'weight':0});
                }
            }
            console.log("剩余点位："+left_points);
            var per_amount = parseFloat(left_money/media_point/left_points).toFixed(0);
            tactic_matrix.forEach(function(t){
                if (t.id == 0){
                    t.weight = per_amount;
                }
            })
            // 加入剩余不在策略空间的持仓
            holds.forEach(function(hold) {
                tactic_matrix.push(hold);
            });
        }else{
            // 如果已经满仓或者满位，直接返回持仓即可
            holds.forEach(function(hold) {
                tactic_matrix.push(hold);
            });
        }
        // wxfs 策略通过这里写入数据库，其他策略有其他写入渠道
        if (user.strategy_name == 'wxfs'){
            add_strategy(tactic_matrix);
        }
    }

    // 更新全局变量包括：最新持仓、策略空间、中间值、波动方差等；
    function update_configuration(){
        // holds = get_holds(name);  // 更新持仓
        // tactic_matrix = gen_tactic_matrix(range,points,media_point,total_money,holds); //更新策略空间
        tactic_matrix = get_latest_strategy(name);  // 获取最新策略
        mainInterval = setInterval(main_function, interval_time); // 开始新的监控循环
    }

    // 更新中间价 传入augoto历史数据库.
    function update_midprice(interval){
        if (interval == null){
            interval = 5000;
        }else{
            interval = interval * 1000;
        }
        setInterval(function(){
            //console.log("get mid-price every "+interval + 'ms.');
            var current_price = get_current_price();
        }, interval);
    }

    // 本地播放音乐函数
    function playVoice()
    {
        //非IE内核浏览器
        console.log("准备播放音乐");
        var strAudio = "<audio id='audioPlay' src='https://www.augoto.com/static/notice.mp3' hidden='true'>";
        if($("body").find("audio").length <= 0){
         $("body").append(strAudio);
        }
        var audio = document.getElementById("audioPlay");
        //浏览器支持 audio
        audio.play();
    }

    function load_userinfo(){
        var logodiv = $("#myname",top.window.document);
        var info = "<div id='userinfo' style='background:yellow;color:red;width:200px;height:170px;padding:10px 20px;line-height:24px;font-size:14px;'>姓名："+
            user.name+"<br>是否激活："+user.is_active+" <a class='user_status_button' id='is_active' style='padding:0 10px; background:white;font-size:12px; cursor:pointer;' href='javascript:;'>更改</a><br>是否实盘："+
            (1-user.is_test)+" <a class='user_status_button' id='is_test' style='padding:0 10px; background:white;font-size:12px; cursor:pointer;' href='javascript:;'>更改</a><br>是否本地："+
            user.is_local+" <a class='user_status_button' id='is_local' style='padding:0 10px; background:white;font-size:12px; cursor:pointer;' href='javascript:;'>更改</a><br>策略代号："+
            user.strategy_name+"<br>策略空间："+tactic_matrix.length+"条可执行 <a id='strategy_list' style='padding:0 10px; background:white;font-size:12px; cursor:pointer;' href='javascript:;'>显示</a><br>24h均值："+
            media_point+"</div>";
        logodiv.find("#userinfo").remove();
        logodiv.append(info);

        $(".user_status_button",top.window.document).click(function(){
            var key = $(this).attr('id');
            if (key == 'is_local'){ // 针对切换本地/线上, 永远只要更新线上的即可，本地的is_local应该永远为1
                siteUrl = "https://www.augoto.com";
            }
            $.ajax({
                url: siteUrl+"/change_user_status?api=1&user="+encodeURI(name)+"&key="+key,
                type: 'get',
                async: false,
                success: function(data) {
                    var result = JSON.parse(data);
                }
            });
        })
        $("#strategy_list",top.window.document).click(function(){
            var content = "ID   |  多空   |  始价  |  终价  |  重量"
            tactic_matrix.forEach(function(strategy) {
                content = content + "\n" + strategy.id + " | " + strategy.category + " | " + parseFloat(strategy.create_price).toFixed(2) + " | " + parseFloat(strategy.end_price).toFixed(2) + " | " + strategy.weight;
            });
            alert(content);
        })

    }

})();