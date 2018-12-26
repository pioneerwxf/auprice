-- drop table if exists pricelists;
-- create table pricelists (
--   id integer primary key autoincrement,
--   datetime timestamp not null,
--   price_cn float not null
-- );
-- drop table if exists history_prices;
-- create table history_prices (
--   id integer primary key autoincrement,
--   datetime timestamp not null,
--   utctime integer not null,
--   price_cn float not null,
-- );

-- drop table if exists trades;
-- create table trades (
--   id integer primary key autoincrement,
--   category integer not null, 
--   weight float not null,
--   create_time timestamp,
--   create_price float not null,
--   create_status boolean not null,
--   end_time timestamp,
--   end_price float,
--   end_status boolean, 
--   profit float,
--   year_ratio float
-- );

drop table if exists user;
CREATE TABLE user (
  id integer primary key autoincrement,
  username varchar not null,
  name varchar not null,
  password varchar not null,
  phone varchar not null,
  create_time timestamp,
  investment integer not null, 
  config text, 
  is_active boolean, 
  strategy_name text, 
  is_test boolean, 
  balance float, 
  profits float, 
  hold_money float, 
  is_local boolean
  );

drop table if exists strategy;
create table strategy (
  id integer primary key autoincrement,
  content text not null,
  userid integer not null,
  create_time timestamp
);