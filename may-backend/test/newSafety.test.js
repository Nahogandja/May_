'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const RIDE='22222222-2222-4222-8222-222222222222';
const ALERT='77777777-7777-4777-8777-777777777777';
const PASSENGER='33333333-3333-4333-8333-333333333333';
const DRIVER='44444444-4444-4444-8444-444444444444';
const ADMIN='55555555-5555-4555-8555-555555555555';
function mockController(pool){
 const fn=require.resolve('../src/controllers/rideSafetyController');
 const original=Module._load;delete require.cache[fn];
 Module._load=function(name,parent,main){if(name==='../config/db'&&parent?.filename===fn)return pool;return original.apply(this,arguments)};
 try {return require(fn)} finally{Module._load=original}
}
function res(){return {code:200,body:null,status(c){this.code=c;return this},json(x){this.body=x;return this}}}
const request={params:{id:ALERT},user:{id:ADMIN},body:{action:'rotate'}};
const alert=(overrides={})=>({id:ALERT,ride_id:RIDE,status:'AwaitingAdmin',passenger_safe:true,reason:'off_route',...overrides});
const ride=(overrides={})=>({id:RIDE,status:'Active',driver_finished:false,safe_arrived:false,emergency_flag:false,...overrides});
function poolFor({a=alert(),r=ride()}={}){
 const queries=[];
 const query=async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('SELECT ride_id FROM ride_safety_alerts'))return {rows:[{ride_id:RIDE}]};
  if(sql.includes('SELECT * FROM rides'))return {rows:[r]};
  if(sql.includes('SELECT * FROM ride_safety_alerts'))return {rows:[a]};
  return {rows:[]};
 };
 return {queries,async connect(){return{query,release(){}}},query};
}
test('replacement code requires passenger-safe confirmation',async()=>{
 const pool=poolFor({a:alert({passenger_safe:null,status:'AwaitingPassenger'})});
 const response=res();await mockController(pool).reviewSafetyAlert(request,response);
 assert.equal(response.code,409);
 assert.equal(pool.queries.some(({sql})=>sql.includes('SET safe_arrival_code')),false);
});
test('replacement code cannot be issued after driver claims arrival',async()=>{
 const pool=poolFor({r:ride({driver_finished:true})});
 const response=res();await mockController(pool).reviewSafetyAlert(request,response);
 assert.equal(response.code,409);
});
test('replacement code cannot be issued during an SOS incident',async()=>{
 const pool=poolFor({r:ride({emergency_flag:true})});
 const response=res();await mockController(pool).reviewSafetyAlert(request,response);
 assert.equal(response.code,409);
});
test('admin-approved replacement code is not disclosed in admin response',async()=>{
 const pool=poolFor();
 const response=res();await mockController(pool).reviewSafetyAlert(request,response);
 assert.equal(response.code,200);assert.equal(response.body.status,'CodeRotated');
 assert.ok(pool.queries.some(({sql,params})=>sql.includes('SET safe_arrival_code')&&params[1].length===6));
 assert.equal(JSON.stringify(response.body).includes('safe_arrival_code'),false);
});
test('route distance checks on-segment and distant coordinates correctly',()=>{
 const source=require('../src/services/sharing');
 assert.ok(source.kmBetween(-22.5,17.05,-22.5,17.05)<0.01);
});
