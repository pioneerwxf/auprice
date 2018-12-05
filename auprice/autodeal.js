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
    var interval_time = 100; // 循环监控间隔时间 单位 毫秒
    // online:
    //var siteUrl = 'https://www.augoto.com';
    // test:
    var siteUrl = 'https://augoto.com:5000';  // 线上 www.augoto.com, 本地 augoto.com:5000
    var up_price_difference = 0.2  // 设置上涨价差，到达价差即可交易，后续自动生成最佳价差
    var down_price_difference = 0.2  // 设置看跌价差，到达价差即可交易，后续自动生成最佳价差
    var price_error = 0.05 // 设置自动交易时允许的误差0.05元
    var range = 10 // 设置交易区间，超过range范围即可止损 5元
    var points = 20  // 设置交易点数，即在交易区间内平均或正态分布 points个点。10个点
    var media_point = 268; // 设置当前7日均值，以后由系统给出，272元/g
    var total_money = 1100000; // 设置满仓额度，每个点最多一个订单（不会出现同时看涨和看跌的情况）272000元
    var holds = get_holds();  // 初次获取持仓数据
    var main_area = $(document.getElementById('_left'));
    var tactic_matrix = gen_tactic_matrix(range,points,media_point,total_money,holds);
    if (main_area.length == 1){
        // 确认在正确的页面里执行操作
        console.log('√√√√√√√√√√ I am in the right place √√√√√√ begin to work  √√√√√√√√')
        // 开始监控
        var mainInterval = setInterval(main_function, interval_time);
    }
    function main_function(){
        // 首先获取当前交易中间价
        // online:
        // var mid_price = parseFloat(get_current_price());
        // test:
        var mid_price = parseFloat(get_history_price());
        console.log(mid_price)
        var sell_price = mid_price - 0.2;
        var buy_price = mid_price + 0.2;
        for (var i in tactic_matrix){
            var list = tactic_matrix[i]
            //console.log(list);
            // 处理先买入后卖出看涨的订单
            if (list.category == 1){
                // 准备卖出平仓——已经有交易id的
                if(list.id != 0){
                    if (sell_price - list.create_price > up_price_difference){
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        console.log("ID:"+list.id+"号准备交易，价差："+(sell_price - list.create_price)+"，重量："+list.weight);
                        // online:
                        // buy_then_sell(list.id,1,list.weight,list.create_price); // 1 代表卖出平仓
                        // test: 回测时直接修改交易记录，省去一系列流程
                        close_or_open_trade(1,list.id,sell_price,list.weight)  // 1代表先"买入"类别,tradeid=0则是开仓
                        break;
                    }
                }else{
                    // 准备买入开仓
                    // 如果当前买入价和矩阵空间的误差足够小  但买入价仍旧要不大于设定即可开始交易
                    var price_diff = list.create_price-buy_price
                    if (price_diff < price_error & price_diff >= 0){
                        console.log('当前买入价格'+buy_price+'距离设定价格'+list.create_price+'误差是：'+price_diff)
                        console.log('准备买入');
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        // online:
                        // buy_then_sell(list.id,0,list.weight,list.create_price); // 0 代表买入开仓
                        // test: 回测时直接修改交易记录，省去一系列流程
                        close_or_open_trade(1,list.id,buy_price,list.weight)  // 1代表先"买入"类别,tradeid=0则是开仓
                    }
                }
                //处理先卖出后买入的看跌订单
            }else if(list.category == -1){
                // 准备买入平仓——已有交易id
                if(list.id != 0){
                    if (list.create_price - buy_price > down_price_difference){
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        console.log("ID:"+list.id+"号准备交易，价差："+(buy_price - list.create_price)+"，重量："+list.weight);
                        // online:
                        // sell_then_buy(list.id,1,list.weight,list.create_price);  // 1 代表买入平仓
                        // test: 回测时直接修改交易记录，省去一系列流程
                        close_or_open_trade(-1,list.id,buy_price,list.weight)  // -1 代表先“卖出”类别，tradeid=0则是开仓
                        break;
                    }
                }else{
                    // 准备卖出开仓
                    // 如果当前卖出价和矩阵空间的误差足够小  但卖出价仍旧要大于设定即可开始交易
                    price_diff = sell_price - list.create_price;
                    if (price_diff < price_error &  price_diff >= 0){
                        console.log('当前卖出价格'+sell_price+'距离设定价格'+list.create_price+'误差是：'+price_diff)
                        console.log('准备卖出');
                        clearInterval(mainInterval); // 先将循环中断，执行本次交易
                        // online:
                        // sell_then_buy(list.id,0,list.weight,list.create_price);  // 0 代表卖出开仓
                        // test: 回测时直接修改交易记录，省去一系列流程
                        close_or_open_trade(-1,list.id,sell_price,list.weight)  // -1 代表先“卖出”类别，tradeid=0则是开仓
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
    function buy_then_sell(tradeid,buy_or_sell,amount,create_price,pre_deal_price){
        var deal_type;
        if(buy_or_sell==0){deal_type="↑买入开仓";}else{deal_type="↑卖出平仓";}
        console.log(deal_type+" 当前创建价格: ￥"+create_price+"/g");
        //选择先买入后卖出tab
        choose_firstbuy_tab();
        // 传入1，代表卖出平仓；
        choose_firstbuy_radio(buy_or_sell);
        input_up_amount_value(amount);
        click_next_step();
        setTimeout(function(){
            // 提交页面会返回交易的真实价格deal_price，因为时间差可能和传入的pre_deal_price有所差距,差距过大可不成交
            click_confirm_btn(function(deal_price){
                console.log("当前交易价格: ￥"+deal_price+"/g");
                sendSms(1, tradeid, buy_or_sell, amount, create_price, deal_price);  // 1代表先"买入"类型
                close_or_open_trade(1,tradeid,deal_price,amount)  // 1代表先"买入"类别,tradeid=0则是开仓
            })
        },5000);
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
            click_next_step();
            setTimeout(function(){
                click_confirm_btn(function(deal_price){
                    console.log("当前交易价格: ￥"+deal_price+"/g");
                    sendSms(-1, tradeid,sell_or_buy, amount, create_price, deal_price);  // -1类别代表先卖出类型
                    close_or_open_trade(-1,tradeid,deal_price,amount) // -1 代表先“卖出”类别，tradeid=0则是开仓
                })
            },5000);  //间隔5秒执行确认！！！测试期间请勿开启
        },5000);  //间隔5秒执行先卖出后买入tab后的其他动作
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
    function click_next_step(){
        console.log("点击下一步");
        var right_iframe = $(document.getElementById('_right'));
        var submit = right_iframe.contents().find("#tijiao");
        if(submit.length==1){submit[0].click();}
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
                // confirm[0].click();  // ！！！！测试时一定关闭确认按钮！！！！！！
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
        }, 1000);
    }

/////////////////////////////////////////////////////// ///////
///// 以下是和augoto交互的代码，获取持仓，关闭交易，和发送短信 ////////
/////////////////////////////////////////////////////// ///////

    // 获取augoto.com持仓数据 condition=sql 里的 where
    function get_holds(condition){
        //console.log('获取一次持仓数据')
        if (condition == null){
            // online:
            // condition = 'id>250';
            // test:
            condition = 'id>75';
        }
        var result = null;
        $.ajax({
            url: siteUrl+"/trades?hold=1&api=1&condition="+condition,
            type: 'get',
            async: false,
            success: function(data) {
                result = JSON.parse(data);
            }
        });
        return result;
    }

    // 修改augoto的交易数据，有id是平仓，没id是开仓，category=1先买入 -1先卖出，最终状态都是1=成交，没有挂单和观望
    function close_or_open_trade(category,tradeid,deal_price,weight){
        if (tradeid==0) {
        // 没有交易id，执行开仓动作
            var post_data = {'category':category,'create_price':deal_price, 'create_status':1, 'weight':weight}
            console.log('通知augoto开仓成交，创建一条记录');
            $.ajax({
                url: siteUrl+"/add?api=1",
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
            post_data = {'tradeid':tradeid, 'end_price':deal_price, 'end_status':1}
            console.log('通知augoto平仓成交');
            $.ajax({
                url: siteUrl+"/edit?api=1",
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
/////////////////////////////////////////////////////// ///////
///// 以下是和本地逻辑，策略空间、播放提醒声音等 ////////
/////////////////////////////////////////////////////// ///////
    // 生成策略空间矩阵
    function gen_tactic_matrix(range,points,media_point,total_money,holds){
        var per_amount = (total_money/media_point/points).toFixed(0);
        var distance = range/points;
        var tactic_matrix = [];
        for (var p=0;p<points;p++){
            var create_price = media_point-(range-1)/2 + p*distance;
            var found_up_points=0; //找到看涨的点已经下单
            var found_down_points=0; //找到看跌的点已经下单
            holds.forEach(function(hold) {
                if(Math.abs(hold.create_price-create_price)<distance/2){
                    tactic_matrix.push(hold);
                    if(hold.category==1){found_up_points=1}else{found_down_points=1}
                }
            });
            if (found_up_points==0){
                tactic_matrix.push({'id':0,'category':1,'create_price':create_price,'weight':per_amount});
            }
            if(found_down_points==0){
                tactic_matrix.push({'id':0,'category':-1,'create_price':create_price,'weight':per_amount});
            }
        }
        return tactic_matrix;
    }

    // 更新全局变量包括：最新持仓、策略空间、中间值、波动方差等；
    function update_configuration(){
        holds = get_holds();  // 更新持仓
        tactic_matrix = gen_tactic_matrix(range,points,media_point,total_money,holds); //更新策略空间
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

})();