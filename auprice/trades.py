#!/usr/bin/env python3
# coding: utf-8
import sqlite3, os, requests, datetime, time, json
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash
from auprice import app

@app.route('/index')
def trades():
    trades_lists = app.query_db('select * from trades order by id')
    return render_template('index.html', trades_lists=trades_lists)
