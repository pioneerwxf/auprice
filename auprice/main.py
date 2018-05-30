#!/usr/bin/env python3
# coding: utf-8
"""
    main.py
    ~~~~~~~~~~
    所有后台脚本的入口
"""
# import os
# import sys
# import signal
# import multiprocessing
import requests
import time


# from script import adb
# from script import helper
# from script import matrix
# from script import xiaobian
# from script.helper import Logger, Shell
# from script import service
# from script import local
# import config

# shell = Shell()
# sys.path.insert(0, helper.get_project_path())
# r = helper.get_redis_client()

# define some constant, will be configer file later
time_interval = 60
auprice_api = "https://www.gomegold.com/Index/MethodQuoteprice"  # 国美黄金接口


def get_auprice(time_interval):
    while True:
        aup_re = requests.post(auprice_api, data = {})
        aup_price = round(aup_re.json()['responseParams'],2)
        print(str(time_interval) + " 秒内黄金实时价格     ----买入价：" + str(aup_price - 0.24) + "         ---卖出价：" + str(aup_price - 0.64))
        time.sleep(time_interval)   # Delay for time_interval seconds.


if __name__ == "__main__":
    get_auprice(time_interval)

    # import argparse
    # parser = argparse.ArgumentParser()
    # subparsers = parser.add_subparsers(dest="command")

    # #  子命令1，本地的命令
    # parser_local = subparsers.add_parser('local', help='本地执行的命令,执行一次')

    # group = parser_local.add_mutually_exclusive_group(required=False)
    # group.add_argument(
    #     "--clear_apk", required=False, action="store", nargs="+",
    #     help="清理小编的升级apk文件"
    # )
    