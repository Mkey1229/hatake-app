
// ── Supabase設定 ───────────────────────────────────────────────
const SUPABASE_URL = "https://hagkeqlvesuybdgjrtln.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZ2tlcWx2ZXN1eWJkZ2pydGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzE5OTgsImV4cCI6MjA5NTMwNzk5OH0.H2rXdielApV1dIy_evZg0tU9S60yqKjeinuv3xFelhk";

// ユーザーIDを取得（端末固有のID）
function getUserId() {
  let uid = localStorage.getItem("hatake_uid");
  if (!uid) {
    uid = Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem("hatake_uid", uid);
  }
  return uid;
}

// Supabaseにデータを保存
async function saveToSupabase(fields) {
  try {
    const userId = getUserId();
    const toSave = fields.map(f => ({...f, vPaths:[...f.vPaths], hPaths:[...f.hPaths]}));
    const res = await fetch(SUPABASE_URL + "/rest/v1/fields", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        id: userId,
        user_id: userId,
        data: toSave,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch(e) { return false; }
}

// Supabaseからデータを読み込む
async function loadFromSupabase() {
  try {
    const userId = getUserId();
    const res = await fetch(SUPABASE_URL + "/rest/v1/fields?id=eq." + userId, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return data[0].data.map(f => ({
      ...f,
      vPaths: new Set(f.vPaths||[]),
      hPaths: new Set(f.hPaths||[])
    }));
  } catch(e) { return null; }
}


// ── グループ管理 ───────────────────────────────────────────────
// 同じ野菜・同じ植えた日の畝をグループとして扱う
function getGroupKey(bed){
  if(bed.veggie==="空き"||!bed.pd) return null;
  return bed.veggie+"__"+bed.pd;
}
function getGroup(field, bed){
  const key=getGroupKey(bed);
  if(!key) return [bed];
  return field.beds.filter(b=>getGroupKey(b)===key);
}
function isGroupLeader(field, bed){
  // グループの中で row,col が最小の畝がリーダー
  const group=getGroup(field,bed);
  if(group.length<=1) return false;
  const leader=group.reduce((a,b)=>a.row<b.row||(a.row===b.row&&a.col<b.col)?a:b);
  return leader.id===bed.id;
}

import { useState, useRef, useEffect, useMemo } from "react";

const VG=[
  {name:"空き",color:"#e8e8e0",family:null,rest:0,sd:null,ld:null,sow:null},
  {name:"トマト",color:"#ffc5b8",family:"ナス科",rest:3,sd:90,ld:75,sow:{cold:[5,6],warm:[4,5],hot:[3,5]}},
  {name:"ミニトマト",color:"#ffd5c0",family:"ナス科",rest:3,sd:80,ld:65,sow:{cold:[5,6],warm:[4,5],hot:[3,5]}},
  {name:"なす",color:"#d8b8f0",family:"ナス科",rest:3,sd:90,ld:70,sow:{cold:[5,6],warm:[4,5],hot:[3,5]}},
  {name:"ピーマン",color:"#b8f0b8",family:"ナス科",rest:3,sd:100,ld:80,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"パプリカ",color:"#ffcca0",family:"ナス科",rest:3,sd:110,ld:90,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"じゃがいも",color:"#ffe0a0",family:"ナス科",rest:3,sd:90,ld:90,sow:{cold:[4,5],warm:[3,4],hot:[2,3]}},
  {name:"きゅうり",color:"#a8e8d8",family:"ウリ科",rest:2,sd:65,ld:55,sow:{cold:[5,6],warm:[4,5],hot:[3,5]}},
  {name:"スイカ",color:"#ffb8b8",family:"ウリ科",rest:3,sd:100,ld:90,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"メロン",color:"#c8f0e8",family:"ウリ科",rest:3,sd:110,ld:100,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"ズッキーニ",color:"#a0ddd0",family:"ウリ科",rest:2,sd:55,ld:50,sow:{cold:[5,6],warm:[4,5],hot:[3,5]}},
  {name:"かぼちゃ",color:"#ffe0b0",family:"ウリ科",rest:2,sd:110,ld:100,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"だいこん",color:"#f0f0f0",family:"アブラナ科",rest:1,sd:60,ld:null,sow:{cold:[8,9],warm:[8,10],hot:[9,10]}},
  {name:"キャベツ",color:"#b8f0c8",family:"アブラナ科",rest:1,sd:90,ld:70,sow:{cold:[7,8],warm:[7,9],hot:[8,9]}},
  {name:"ブロッコリー",color:"#90d8a8",family:"アブラナ科",rest:1,sd:90,ld:70,sow:{cold:[7,8],warm:[7,9],hot:[8,9]}},
  {name:"白菜",color:"#d8f5e0",family:"アブラナ科",rest:1,sd:80,ld:60,sow:{cold:[8,8],warm:[8,9],hot:[9,9]}},
  {name:"小松菜",color:"#a8e8b8",family:"アブラナ科",rest:1,sd:40,ld:null,sow:{cold:[4,9],warm:[3,10],hot:[2,11]}},
  {name:"水菜",color:"#c8f5d8",family:"アブラナ科",rest:1,sd:45,ld:null,sow:{cold:[4,9],warm:[3,10],hot:[2,11]}},
  {name:"にんじん",color:"#ffcc88",family:"セリ科",rest:1,sd:100,ld:null,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"ほうれん草",color:"#88d8b0",family:"アカザ科",rest:1,sd:45,ld:null,sow:{cold:[8,9],warm:[9,10],hot:[10,11]}},
  {name:"レタス",color:"#e8f8d0",family:"キク科",rest:1,sd:60,ld:50,sow:{cold:[4,5],warm:[3,5],hot:[2,4]}},
  {name:"サニーレタス",color:"#ffd8b8",family:"キク科",rest:1,sd:55,ld:45,sow:{cold:[4,5],warm:[3,5],hot:[2,4]}},
  {name:"えだまめ",color:"#d0f0a0",family:"マメ科",rest:1,sd:80,ld:null,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"いんげん",color:"#e8f8b0",family:"マメ科",rest:1,sd:55,ld:null,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"ねぎ",color:"#e8f5d0",family:"ユリ科",rest:1,sd:120,ld:90,sow:{cold:[3,4],warm:[3,4],hot:[2,3]}},
  {name:"たまねぎ",color:"#e0d0f8",family:"ユリ科",rest:1,sd:180,ld:150,sow:{cold:[9,9],warm:[9,10],hot:[10,10]}},
  {name:"さつまいも",color:"#ffc898",family:"ヒルガオ科",rest:3,sd:130,ld:120,sow:{cold:[6,6],warm:[5,6],hot:[4,5]}},
  {name:"とうもろこし",color:"#fff0a8",family:"イネ科",rest:1,sd:85,ld:null,sow:{cold:[5,6],warm:[4,5],hot:[3,4]}},
  {name:"オクラ",color:"#b8e8b0",family:"アオイ科",rest:1,sd:60,ld:50,sow:{cold:[6,6],warm:[5,6],hot:[4,5]}},
  {name:"いちご",color:"#ffc0d8",family:"バラ科",rest:2,sd:null,ld:60,sow:{cold:[9,10],warm:[9,10],hot:[10,11]}},
  {name:"バジル",color:"#b0f0c8",family:"シソ科",rest:1,sd:50,ld:40,sow:{cold:[5,6],warm:[4,6],hot:[3,5]}},
  {name:"シソ",color:"#d8b8f0",family:"シソ科",rest:1,sd:60,ld:null,sow:{cold:[5,6],warm:[4,6],hot:[3,5]}},
  {name:"その他",color:"#e0e5e8",family:null,rest:0,sd:null,ld:null,sow:null},
];
const ZONES=[
  {key:"cold",label:"寒冷地",emoji:"❄️",desc:"北海道・東北など"},
  {key:"warm",label:"温暖地",emoji:"🌤",desc:"関東・東海・関西など"},
  {key:"hot",label:"暖地",emoji:"☀️",desc:"九州・四国・沖縄など"},
];
const COMPANION={
  "トマト":{good:[["バジル","害虫忌避"],["ねぎ","土壌菌抑制"]],bad:[["きゅうり","水分競合"],["じゃがいも","疫病リスク"]]},
  "なす":{good:[["ねぎ","土壌菌抑制"],["シソ","害虫忌避"]],bad:[["トマト","害虫共有"]]},
  "きゅうり":{good:[["ねぎ","土壌菌抑制"],["レタス","地温保持"]],bad:[["トマト","水分競合"]]},
  "えだまめ":{good:[["とうもろこし","相互補助"]],bad:[["ねぎ","生育阻害"]]},
  "バジル":{good:[["トマト","害虫忌避"],["ピーマン","害虫忌避"]],bad:[["シソ","競合"]]},
  "ねぎ":{good:[["トマト","土壌菌抑制"],["きゅうり","土壌菌抑制"]],bad:[["えだまめ","生育阻害"]]},
};

const today=()=>new Date().toISOString().split("T")[0];
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x.toISOString().split("T")[0];};
const getV=n=>VG.find(v=>v.name===n)||VG[0];
const getColor=n=>getV(n).color;
function calcEst(name,ft,pd,cd){
  if(!pd||name==="空き")return"";
  const v=getV(name),days=ft==="sd"?v.sd:v.ld,d=days!=null?days:parseInt(cd);
  return d&&!isNaN(d)?addDays(pd,d):"";
}
function getStatus(bed){
  if(!bed||bed.veggie==="空き")return{label:"空き",color:"#aaa",bg:"#f5f5f5"};
  if(bed.harv)return{label:"収穫済",color:"#6d9e6a",bg:"#eaf4e8"};
  if(!bed.est)return{label:"管理中",color:"#a0845c",bg:"#f5ede2"};
  if(today()>=bed.est)return{label:"収穫時期！",color:"#c0392b",bg:"#fdecea"};
  return{label:"生育中",color:"#4a7fa5",bg:"#e8f2f8"};
}
function getAvoid(hist){
  const now=new Date(),res=[];
  for(const h of(hist||[])){
    const v=getV(h.veggie);if(!v.family||!v.rest)continue;
    const rem=v.rest-(now-new Date(h.harv||h.pd))/(365.25*24*3600*1000);
    if(rem>0){const ex=res.find(r=>r.family===v.family),r2=parseFloat(rem.toFixed(1));
      if(!ex)res.push({family:v.family,rem:r2,list:VG.filter(x=>x.family===v.family&&x.name!=="空き"&&x.name!=="その他").map(x=>x.name)});
      else if(r2>ex.rem)ex.rem=r2;}
  }
  return res;
}
function getRotWarn(hist,name){
  const v=getV(name);if(!v.family)return null;const now=new Date();
  for(const h of(hist||[])){const hv=getV(h.veggie);if(hv.family!==v.family)continue;
    const ago=(now-new Date(h.harv||h.pd))/(365.25*24*3600*1000);
    if(ago<v.rest)return{family:v.family,need:v.rest,ago:ago.toFixed(1)};}
  return null;
}
function getCompanion(field,bed){
  const cp=COMPANION[bed.veggie];if(!cp)return{goods:[],bads:[]};
  const adj=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>field.beds.find(b=>b.row===bed.row+dr&&b.col===bed.col+dc)?.veggie).filter(Boolean);
  return{goods:cp.good.filter(([n])=>adj.includes(n)).map(([n,r])=>({veggie:n,reason:r})),
         bads:cp.bad.filter(([n])=>adj.includes(n)).map(([n,r])=>({veggie:n,reason:r}))};
}

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
function makeBed(fid,r,c){return{id:`${fid}-${r}-${c}`,row:r,col:c,veggie:"空き",ft:"ld",pd:"",est:"",harv:"",memo:"",photos:[],hist:[]};}
function makeField(name,rows,cols,pw){
  const id=uid();const beds=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)beds.push(makeBed(id,r,c));
  return{id,name,rows,cols,pw:pw||"",notes:"",vPaths:new Set(),hPaths:new Set(),beds};
}
function makeDemo(){
  const f1=makeField("畑A",3,4,"");
  const s=(r,c,v,ft,pd,harv,memo,hist)=>{const b=f1.beds.find(b=>b.row===r&&b.col===c);Object.assign(b,{veggie:v,ft,pd,est:calcEst(v,ft,pd,""),harv:harv||"",memo:memo||"",hist:hist||[]});};
  s(0,0,"トマト","ld","2026-04-10","","",[{veggie:"なす",ft:"ld",pd:"2023-04-10",harv:"2023-09-01",memo:""}]);
  s(0,1,"バジル","ld","2026-04-20","","");s(0,2,"なす","ld","2026-05-01","","");s(0,3,"ピーマン","ld","2026-05-05","","");
  s(1,0,"ほうれん草","sd","2026-04-15","","");s(1,2,"レタス","ld","2026-04-18","","");
  s(2,0,"だいこん","sd","2026-05-10","","");s(2,2,"にんじん","sd","2026-05-10","","");
  f1.vPaths=new Set(["0-1","1-1","2-1"]);f1.hPaths=new Set(["1-0","1-1","1-2","1-3"]);
  f1.notes="・トマトの脇芽かき\n・水やり（月水金）";
  const f2=makeField("畑B",2,3,"");
  const s2=(r,c,v,ft,pd)=>{const b=f2.beds.find(b=>b.row===r&&b.col===c);Object.assign(b,{veggie:v,ft,pd,est:calcEst(v,ft,pd,"")});};
  s2(0,0,"スイカ","ld","2026-05-01");s2(0,2,"えだまめ","sd","2026-04-20");
  f2.vPaths=new Set(["0-1","1-1"]);
  return[f1,f2];
}

export default function App(){
  const[zone,setZone]=useState(()=>{try{return localStorage.getItem("hz")||"";}catch{return"";}});
  const[fields,setFields]=useState(()=>{
    try{
      const saved=localStorage.getItem("hatake_fields");
      if(saved){
        const parsed=JSON.parse(saved);
        // Set を復元
        return parsed.map(f=>({...f,vPaths:new Set(f.vPaths||[]),hPaths:new Set(f.hPaths||[])}));
      }
    }catch(e){}
    return makeDemo();
  });
  const[screen,setScreen]=useState(()=>{try{return localStorage.getItem("hz")?"home":"zone";}catch{return"zone";}});
  const[fieldId,setFieldId]=useState(null);const[bedId,setBedId]=useState(null);
  const[form,setForm]=useState({});const[popup,setPopup]=useState(null);
  const[copied,setCopied]=useState(null);const[pwInput,setPwInput]=useState("");const[pwErr,setPwErr]=useState(false);
  const[editNotes,setEditNotes]=useState(false);const[notesVal,setNotesVal]=useState("");
  const[groupEdit,setGroupEdit]=useState(null);

  const curField=fields.find(f=>f.id===fieldId)||null;
  const curBed=curField?.beds.find(b=>b.id===bedId)||null;
  const popField=popup?fields.find(f=>f.id===popup.fid)||null:null;
  const popBed=popField?.beds.find(b=>b.id===popup.bid)||null;
  const zoneObj=ZONES.find(z=>z.key===zone);
  // 起動時にSupabaseからデータを読み込む
  useState(()=>{
    loadFromSupabase().then(data=>{
      if(data&&data.length>0){
        setFields(data);
      }
    });
  });

  const upd=fn=>setFields(prev=>{
    const next=fn(prev);
    try{
      // SetをArrayに変換してlocalStorageに保存
      const toSave=next.map(f=>({...f,vPaths:[...f.vPaths],hPaths:[...f.hPaths]}));
      localStorage.setItem("hatake_fields",JSON.stringify(toSave));
    }catch(e){}
    // Supabaseにも保存（非同期）
    saveToSupabase(next);
    return next;
  });

  const goHome=()=>{setScreen("home");setFieldId(null);setBedId(null);setCopied(null);setEditNotes(false);setPopup(null);};
  const openField=f=>{setEditNotes(false);setPopup(null);if(f.pw){setPwInput("");setPwErr(false);setFieldId(f.id);setScreen("auth");}else{setFieldId(f.id);setScreen("field");}};
  const authOk=()=>{if(pwInput===curField?.pw){setScreen("field");setPwErr(false);}else setPwErr(true);};
  const openBedEdit=(fId,bId)=>{const f=fields.find(x=>x.id===fId),b=f?.beds.find(x=>x.id===bId);if(!f||!b)return;setFieldId(fId);setBedId(bId);setPopup(null);setForm({veggie:b.veggie||"空き",ft:b.ft||"ld",pd:b.pd||today(),cd:"",harv:b.harv||"",memo:b.memo||"",photos:b.photos||[]});setScreen("bed");};
  const saveBed=()=>{
    const f=fields.find(x=>x.id===fieldId),b=f?.beds.find(x=>x.id===bedId);if(!f||!b)return;
    const est=calcEst(form.veggie,form.ft,form.pd,form.cd);
    let hist=[...(b.hist||[])];if(b.veggie!=="空き"&&b.veggie!==form.veggie&&b.pd)hist=[{veggie:b.veggie,ft:b.ft,pd:b.pd,harv:b.harv,memo:b.memo},...hist];
    const u={...b,veggie:form.veggie,ft:form.ft,pd:form.veggie==="空き"?"":form.pd,est:form.veggie==="空き"?"":est,harv:form.veggie==="空き"?"":form.harv,memo:form.memo,photos:form.photos||[],hist};
    upd(fs=>fs.map(x=>x.id!==fieldId?x:{...x,beds:x.beds.map(y=>y.id!==bedId?y:u)}));setScreen("field");
  };
  const pasteBed=tId=>{if(!copied||!fieldId)return;upd(fs=>fs.map(x=>x.id!==fieldId?x:{...x,beds:x.beds.map(b=>b.id!==tId?b:{...b,veggie:copied.veggie,ft:copied.ft,pd:copied.pd,est:calcEst(copied.veggie,copied.ft,copied.pd,""),harv:copied.harv,memo:copied.memo})}));};
  const toggleV=(fId,r,gc)=>upd(fs=>fs.map(f=>{if(f.id!==fId)return f;const p=new Set(f.vPaths);const k=`${r}-${gc}`;p.has(k)?p.delete(k):p.add(k);return{...f,vPaths:p};}));
  const toggleH=(fId,gr,c)=>upd(fs=>fs.map(f=>{if(f.id!==fId)return f;const p=new Set(f.hPaths);const k=`${gr}-${c}`;p.has(k)?p.delete(k):p.add(k);return{...f,hPaths:p};}));
  const addField=(name,rows,cols,pw)=>{upd(fs=>[...fs,makeField(name||("畑"+(fs.length+1)),rows,cols,pw)]);setScreen("home");};
  const delField=()=>{upd(fs=>fs.filter(f=>f.id!==fieldId));goHome();};
  // グループ全体を一括更新
  function saveGroupBed(groupBeds, changes){
    upd(fs=>fs.map(f=>f.id!==fieldId?f:{...f,beds:f.beds.map(b=>{
      if(!groupBeds.find(g=>g.id===b.id)) return b;
      return {...b,...changes};
    })}));
    setGroupEdit(null);
    setPopup(null);
    setScreen("field");
  }
  const saveNotes=()=>{upd(fs=>fs.map(f=>f.id!==fieldId?f:{...f,notes:notesVal}));setEditNotes(false);};

  if(screen==="zone")return(
    <Shell title="🌱 畑ノート" sub="お住まいの地域を選んでください">
      <p style={{color:"#888",fontSize:13,margin:"0 0 16px"}}>地域によって播種・定植の適期が変わります</p>
      {ZONES.map(z=><div key={z.key} style={S.zoneCard} onClick={()=>{setZone(z.key);try{localStorage.setItem("hz",z.key);}catch{};setScreen("home");}}><span style={{fontSize:28}}>{z.emoji}</span><div><div style={{fontWeight:700,color:"#2d4a1e"}}>{z.label}</div><div style={{fontSize:12,color:"#888"}}>{z.desc}</div></div></div>)}
    </Shell>
  );

  if(screen==="auth")return(
    <Shell title={curField?.name||""} back={goHome}>
      <div style={{textAlign:"center",paddingTop:32}}><div style={{fontSize:40,marginBottom:8}}>🔒</div><div style={{fontWeight:700,fontSize:16,color:"#2d4a1e",marginBottom:20}}>パスワードを入力</div>
      <input style={{...S.input,textAlign:"center",letterSpacing:4,fontSize:20}} type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&authOk()} autoFocus/>
      {pwErr&&<div style={{color:"#c0392b",fontSize:13,marginTop:8}}>パスワードが違います</div>}
      <button style={{...S.btnP,marginTop:16}} onClick={authOk}>開く</button></div>
    </Shell>
  );

  if(screen==="home")return(
    <Shell title="🌱 畑ノート" right={<div style={{display:"flex",gap:6}}><button style={S.hBtn} onClick={()=>setScreen("zone")}>{zoneObj?.emoji} {zoneObj?.label}</button><button style={S.hBtn} onClick={()=>setScreen("addField")}>＋</button></div>}>
      {fields.length===0&&<Empty text="＋ ボタンで畑を追加"/>}
      {fields.map(f=>{
        const act=f.beds.filter(b=>b.veggie!=="空き");
        return(
          <div key={f.id} style={S.card} onClick={()=>openField(f)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontWeight:700,fontSize:16,color:"#2d4a1e"}}>{f.name}</span>{f.pw&&<span style={{fontSize:12,color:"#aaa"}}>🔒</span>}</div>
              <span style={{fontSize:12,color:"#aaa"}}>{f.rows}列×{f.cols}畝</span>
            </div>
            <MiniMap field={f}/>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
              {[["収穫時期！","#c0392b","#fdecea"],["生育中","#4a7fa5","#e8f2f8"],["収穫済","#6d9e6a","#eaf4e8"]].map(([lbl,c,bg])=>{const n=act.filter(b=>getStatus(b).label===lbl).length;return n>0?<Chip key={lbl} l={lbl+" "+n} c={c} bg={bg}/>:null;})}
            </div>
            {f.notes&&<div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f0ede8"}}><div style={{fontSize:11,fontWeight:600,color:"#a0845c",marginBottom:3}}>📋 次の作業</div><div style={{fontSize:12,color:"#555",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{f.notes}</div></div>}
          </div>
        );
      })}
    </Shell>
  );

  if(screen==="field"&&curField)return(
    <Shell title={curField.name} back={()=>{setCopied(null);goHome();}} right={copied?<button style={{...S.hBtn,background:"rgba(192,57,43,0.85)"}} onClick={()=>setCopied(null)}>✕ キャンセル</button>:<button style={S.hBtn} onClick={()=>setScreen("fieldSet")}>⚙</button>}>
      {copied&&<div style={S.clipBar}><div style={{width:10,height:10,borderRadius:"50%",background:getColor(copied.veggie),flexShrink:0}}/><span style={{fontSize:12,flex:1}}><b>{copied.veggie}</b> コピー中 — 長押しスワイプで連続ペースト</span></div>}
      {!copied&&<div style={S.hint}>💡 畝タップ→詳細　長押しスワイプ→コピペ　畝間タップ→通路</div>}
      <FieldMap field={curField} copied={copied}
        onBedTap={bed=>{if(copied)pasteBed(bed.id);else setPopup({fid:curField.id,bid:bed.id});}}
        onBedLongPress={bed=>{if(bed.veggie!=="空き")setCopied({veggie:bed.veggie,ft:bed.ft,pd:bed.pd,harv:bed.harv,memo:bed.memo});}}
        onBedSwipePaste={bed=>pasteBed(bed.id)}
        onVGap={(r,c)=>toggleV(curField.id,r,c)} onHGap={(r,c)=>toggleH(curField.id,r,c)}
      />
      <Legend/>
      <div style={S.notesBox}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontWeight:700,fontSize:14,color:"#2d4a1e"}}>📋 次にやる作業メモ</span>{!editNotes&&<button style={S.editBtn} onClick={()=>{setNotesVal(curField.notes||"");setEditNotes(true);}}>編集</button>}</div>
        {editNotes?(<><textarea style={{...S.input,height:88,resize:"none",fontSize:14}} value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="・トマトの脇芽かき&#10;・水やり（月水金）" autoFocus/><div style={{display:"flex",gap:8,marginTop:8}}><button style={{...S.btnP,flex:1,marginTop:0}} onClick={saveNotes}>保存</button><button style={{flex:1,border:"1.5px solid #ddd",borderRadius:14,padding:"12px",fontSize:14,background:"white",color:"#888",cursor:"pointer"}} onClick={()=>setEditNotes(false)}>キャンセル</button></div></>)
        :curField.notes?(<div>{curField.notes.split("\n").filter(l=>l.trim()).map((line,i,arr)=>(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 0",borderBottom:i<arr.length-1?"1px solid #f5f0ea":"none"}}><div style={{width:16,height:16,borderRadius:4,border:"2px solid #b5d5a0",background:"white",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:6,height:6,borderRadius:"50%",background:"#b5d5a0"}}/></div><div style={{fontSize:13,color:"#333",lineHeight:1.5,flex:1}}>{line.replace(/^[・\-\*•]\s*/,"")}</div></div>))}</div>)
        :(<div style={{fontSize:13,color:"#ccc",textAlign:"center",padding:"12px 0",cursor:"pointer"}} onClick={()=>{setNotesVal("");setEditNotes(true);}}>タップしてメモを追加</div>)}
      </div>
      {popup&&popBed&&popField&&<BedPopup bed={popBed} field={popField} zone={zone} zoneObj={zoneObj}
        onEdit={()=>openBedEdit(popField.id,popBed.id)}
        onCopy={()=>{setCopied({veggie:popBed.veggie,ft:popBed.ft,pd:popBed.pd,harv:popBed.harv,memo:popBed.memo});setPopup(null);}}
        onClose={()=>setPopup(null)}
        onEditGroup={group=>{setGroupEdit(group);setPopup(null);}}
      />}
      {groupEdit&&curField&&<GroupEditPopup group={groupEdit} field={curField} onSave={saveGroupBed} onClose={()=>setGroupEdit(null)}/>}
    </Shell>
  );

  if(screen==="fieldSet"&&curField)return(
    <Shell title={curField.name+" 設定"} back={()=>setScreen("field")}>
      <Label>畑の名前</Label><input style={S.input} defaultValue={curField.name} onChange={e=>upd(fs=>fs.map(f=>f.id!==fieldId?f:{...f,name:e.target.value}))}/>
      <Label>パスワード（共有時に設定）</Label><input style={S.input} type="password" placeholder="未設定の場合は空白" defaultValue={curField.pw} onChange={e=>upd(fs=>fs.map(f=>f.id!==fieldId?f:{...f,pw:e.target.value}))}/>
      <div style={{fontSize:11,color:"#aaa",marginTop:4}}>同じパスワードを共有することで複数人で管理できます</div>
      <button style={{...S.btnD,marginTop:24}} onClick={delField}>この畑を削除する</button>
    </Shell>
  );

  if(screen==="bed"&&curBed){
    const v=getV(form.veggie),canS=v.sd!=null,canL=v.ld!=null,est=calcEst(form.veggie,form.ft,form.pd,form.cd);
    const avoid=getAvoid(curBed.hist||[]),warn=getRotWarn(curBed.hist||[],form.veggie),sow=zone&&v.sow?v.sow[zone]:null;
    const cp=form.veggie!=="空き"&&curField?getCompanion({...curField,beds:curField.beds.map(b=>b.id===bedId?{...b,veggie:form.veggie}:b)},{...curBed,veggie:form.veggie}):{goods:[],bads:[]};
    return(
      <Shell title="畝の編集" back={()=>setScreen("field")} right={form.veggie!=="空き"?<button style={S.hBtn} onClick={()=>{setCopied({veggie:form.veggie,ft:form.ft,pd:form.pd,harv:form.harv,memo:form.memo});setScreen("field");}}>📋 コピー</button>:null}>
        <div style={{color:"#888",fontSize:12,marginBottom:12}}>{curField?.name} — {curBed.row+1}列目 {curBed.col+1}番畝</div>
        {avoid.length>0&&<div style={S.avoidBox}><div style={{fontWeight:700,fontSize:13,marginBottom:6}}>🚫 この畝で避ける野菜</div>{avoid.map((a,i)=><div key={i} style={{marginBottom:i<avoid.length-1?8:0}}><div style={{fontSize:12,fontWeight:700,color:"#8a3a00"}}>{a.family} — あと約{a.rem}年空けるとよい</div><div style={{fontSize:11,color:"#a05020",marginTop:2,lineHeight:1.6}}>避けるべき野菜：{a.list.join("・")}</div></div>)}</div>}
        {warn&&<div style={S.warnBox}>⚠️ <b>{warn.family}</b> {warn.ago}年前に作付け／あと約{(warn.need-parseFloat(warn.ago)).toFixed(1)}年空けるとよい</div>}
        <Label>野菜</Label>
        <select style={S.input} value={form.veggie} onChange={e=>{const n=e.target.value;setForm(f=>({...f,veggie:n,ft:getV(n).ld!=null?"ld":"sd"}));}}>
          {VG.map(v=>{const bad=avoid.some(a=>a.list.includes(v.name));return(<option key={v.name} value={v.name}>{bad?"⚠ ":""}{v.name}</option>);})}
        </select>
        {form.veggie!=="空き"&&<>
          {getV(form.veggie).family&&getV(form.veggie).rest>0&&<div style={{background:"#f5f5f0",borderRadius:10,padding:"8px 12px",fontSize:12,color:"#666",marginTop:6}}>ℹ️ <b>{getV(form.veggie).family}</b> は連作を <b>{getV(form.veggie).rest}年</b> 空けることを推奨</div>}
          {(cp.goods.length>0||cp.bads.length>0)&&<div style={{...S.cpBox,marginTop:6}}><div style={{fontWeight:700,fontSize:12,marginBottom:6}}>🌿 隣の畝との相性</div>{cp.goods.map((g,i)=><div key={i} style={{fontSize:12,marginBottom:3}}>✅ <b>{g.veggie}</b> — {g.reason}</div>)}{cp.bads.map((b,i)=><div key={i} style={{fontSize:12,marginBottom:3}}>❌ <b>{b.veggie}</b> — {b.reason}</div>)}</div>}
          {sow&&<div style={{...S.sowBox,marginTop:6}}>🌍 {zoneObj?.label}：播種・定植の目安 <b>{sow[0]}月〜{sow[1]}月</b></div>}
          <Label>植え方</Label>
          <div style={{display:"flex",gap:8}}>
            {[["sd","🌰 種から",canS,v.sd],["ld","🌿 苗から",canL,v.ld]].map(([t,lbl,ok,days])=><button key={t} style={{...S.ftBtn,...(form.ft===t?S.ftBtnOn:{}),opacity:ok?1:0.4}} onClick={()=>ok&&setForm(f=>({...f,ft:t}))}>{lbl}<span style={{fontSize:10,color:"#999",fontWeight:400,display:"block"}}>{days!=null?days+"日":"非対応"}</span></button>)}
          </div>
          {form.veggie==="その他"&&<><Label>収穫までの日数</Label><input style={S.input} type="number" placeholder="例:60" value={form.cd} onChange={e=>setForm(f=>({...f,cd:e.target.value}))}/></>}
          <Label>植えた日</Label><input style={S.input} type="date" value={form.pd} onChange={e=>setForm(f=>({...f,pd:e.target.value}))}/>
          {est&&<div style={S.estBox}>🗓 収穫予定：<b>{est}</b></div>}
          <Label>実際の収穫日</Label><input style={S.input} type="date" value={form.harv} onChange={e=>setForm(f=>({...f,harv:e.target.value}))}/>
          <Label>メモ</Label><textarea style={{...S.input,height:64,resize:"none"}} value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))}/>
          <Label>写真（最大5枚）</Label><MultiPhotoPicker photos={form.photos||[]} onChange={photos=>setForm(f=>({...f,photos}))}/>
        </>}
        <div style={{height:80}}/>{/* 固定ボタン分のスペース */}
        {(curBed.hist||[]).length>0&&<div style={{marginTop:20}}><div style={{fontSize:13,fontWeight:700,color:"#666",borderTop:"1px solid #eee",paddingTop:12,marginBottom:8}}>📜 作付け履歴</div>{curBed.hist.map((h,i)=><div key={i} style={{display:"flex",gap:8,padding:"8px 0",borderBottom:i<curBed.hist.length-1?"1px solid #f5f0ea":"none"}}><div style={{width:10,height:10,borderRadius:"50%",background:getColor(h.veggie),flexShrink:0,marginTop:3}}/><div><div style={{fontWeight:700,fontSize:13,color:"#2d4a1e"}}>{h.veggie} <span style={{fontSize:11,fontWeight:400,color:"#aaa"}}>{h.ft==="sd"?"🌰":"🌿"}</span></div><div style={{fontSize:11,color:"#999"}}>🌱{h.pd}{h.harv?" ✅"+h.harv:""}</div>{h.memo&&<div style={{fontSize:11,color:"#bbb",fontStyle:"italic"}}>📝{h.memo}</div>}</div></div>)}</div>}
      <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"12px 16px 32px",background:"white",borderTop:"1px solid #eee",zIndex:50,maxWidth:390,margin:"0 auto"}}>
        <button style={{...S.btnP,marginTop:0,marginBottom:0}} onClick={saveBed}>保存する</button>
      </div>
      </Shell>
    );
  }

  if(screen==="addField")return(<AddField onAdd={addField} onBack={()=>setScreen("home")}/>);
  return null;
}

function AddField({onAdd,onBack}){
  const[name,setName]=useState("");const[rows,setRows]=useState("3");const[cols,setCols]=useState("4");const[pw,setPw]=useState("");
  return(<Shell title="新しい畑を追加" back={onBack}><Label>畑の名前</Label><input style={S.input} placeholder="例: 畑A" value={name} onChange={e=>setName(e.target.value)}/><Label>列数（縦）</Label><input style={S.input} type="number" min="1" max="8" value={rows} onChange={e=>setRows(e.target.value)}/><Label>畝の数（横）</Label><input style={S.input} type="number" min="1" max="8" value={cols} onChange={e=>setCols(e.target.value)}/><div style={{...S.estBox,marginTop:8}}>{rows}列 × {cols}畝 ＝ {(parseInt(rows)||1)*(parseInt(cols)||1)} マス</div><div style={{marginTop:12,background:"#f8f5f0",borderRadius:12,padding:12,border:"1px solid #e8ddd0"}}><div style={{fontSize:12,color:"#888",marginBottom:6}}>🔒 パスワード（共有する場合のみ）</div><input style={S.input} type="password" placeholder="未設定の場合は空白" value={pw} onChange={e=>setPw(e.target.value)}/></div><button style={S.btnP} onClick={()=>onAdd(name,parseInt(rows)||3,parseInt(cols)||4,pw)}>畑を作成する</button></Shell>);
}

function BedPopup({bed,field,zone,zoneObj,onEdit,onCopy,onClose,onEditGroup}){
  const st=getStatus(bed),v=getV(bed.veggie),isEmpty=bed.veggie==="空き";
  const cp=!isEmpty?getCompanion(field,bed):{goods:[],bads:[]};
  const warn=!isEmpty?getRotWarn(bed.hist||[],bed.veggie):null;
  const sow=zone&&v.sow?v.sow[zone]:null;
  const group=!isEmpty?getGroup(field,bed):[];
  const isGroup=group.length>1;
  return(<div style={S.overlay} onClick={onClose}><div style={S.popup} onClick={e=>e.stopPropagation()}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:36,height:36,borderRadius:10,background:getColor(bed.veggie),flexShrink:0}}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:17,color:"#2d4a1e"}}>{isEmpty?"空き畝":bed.veggie}</div><div style={{fontSize:12,color:"#aaa"}}>{field.name} — {bed.row+1}列目 {bed.col+1}番畝</div></div><button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:"#aaa",cursor:"pointer",lineHeight:1}}>✕</button></div>
    {!isEmpty&&<>
      {(bed.photos||[]).length>0&&(
              <div style={{marginBottom:10}}>
                {bed.photos.map((p,i)=>(
                  <div key={i} style={{borderRadius:10,overflow:"hidden",marginBottom:i<bed.photos.length-1?6:0}}>
                    <img src={p} alt={"写真"+(i+1)} style={{width:"100%",maxHeight:160,objectFit:"cover",display:"block"}}/>
                  </div>
                ))}
              </div>
            )}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}><span style={{...S.chip,color:st.color,background:st.bg}}>{st.label}</span><span style={{...S.chip,color:"#555",background:"#f0f0ec"}}>{bed.ft==="sd"?"🌰 種":"🌿 苗"}</span>{sow&&<span style={{...S.chip,color:"#2471a3",background:"#e8f3fb"}}>📅 {sow[0]}〜{sow[1]}月</span>}</div>
      <div style={{background:"#f8f8f5",borderRadius:10,padding:"10px 12px",marginBottom:10}}>{bed.pd&&<div style={{fontSize:13,color:"#555",marginBottom:4}}>🌱 植えた日：<b>{bed.pd}</b></div>}{bed.est&&<div style={{fontSize:13,color:"#3a6e20",marginBottom:4}}>🗓 収穫予定：<b>{bed.est}</b></div>}{bed.harv&&<div style={{fontSize:13,color:"#6d9e6a"}}>✅ 収穫日：<b>{bed.harv}</b></div>}</div>
      {bed.memo&&<div style={{fontSize:13,color:"#555",marginBottom:10,padding:"8px 12px",background:"#fffbf0",borderRadius:8,border:"1px solid #f0e8c0"}}>📝 {bed.memo}</div>}
      {warn&&<div style={{...S.warnBox,marginBottom:10}}>⚠️ <b>{warn.family}</b> {warn.ago}年前に作付け／あと約{(warn.need-parseFloat(warn.ago)).toFixed(1)}年空けるとよい</div>}
      {(cp.goods.length>0||cp.bads.length>0)&&<div style={{...S.cpBox,marginBottom:10}}><div style={{fontWeight:700,fontSize:12,marginBottom:6}}>🌿 隣の畝との相性</div>{cp.goods.map((g,i)=><div key={i} style={{fontSize:12,marginBottom:3}}>✅ <b>{g.veggie}</b> — {g.reason}</div>)}{cp.bads.map((b,i)=><div key={i} style={{fontSize:12,marginBottom:3}}>❌ <b>{b.veggie}</b> — {b.reason}</div>)}</div>}
      {(bed.hist||[]).length>0&&<div style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:700,color:"#666",marginBottom:6}}>📜 作付け履歴</div>{bed.hist.map((h,i)=><div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:i<bed.hist.length-1?"1px solid #f0ede8":"none"}}><div style={{width:8,height:8,borderRadius:"50%",background:getColor(h.veggie),flexShrink:0,marginTop:4}}/><div><div style={{fontSize:12,fontWeight:700,color:"#2d4a1e"}}>{h.veggie} <span style={{fontWeight:400,color:"#aaa"}}>{h.ft==="sd"?"🌰":"🌿"}</span></div><div style={{fontSize:11,color:"#999"}}>🌱{h.pd}{h.harv?" ✅"+h.harv:""}</div></div></div>)}</div>}
    </>}
    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
      <button style={{...S.btnP,flex:1,marginTop:0,minWidth:120}} onClick={onEdit}>{isEmpty?"🌱 野菜を登録":"✏️ 個別編集"}</button>
      {!isEmpty&&<button style={{flex:1,minWidth:120,background:"#e8f5e0",border:"1.5px solid #b5d5a0",borderRadius:14,padding:"14px",fontSize:14,fontWeight:700,color:"#2d6a20",cursor:"pointer"}} onClick={onCopy}>📋 コピー</button>}
    </div>
    {isGroup&&<button style={{...S.btnP,marginTop:8,background:"linear-gradient(135deg,#3a6a8a,#5a9ab5)"}} onClick={()=>onEditGroup(group)}>🌿 グループ全体を編集（{group.length}畝）</button>}

  </div></div>);
}


// ── グループ編集ポップアップ ─────────────────────────────────
function GroupEditPopup({group,field,onSave,onClose}){
  const bed=group[0];
  const[harv,setHarv]=useState(bed.harv||"");
  const[memo,setMemo]=useState(bed.memo||"");
  const allHarvested=group.every(b=>b.harv);
  const st=getStatus(bed);
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={S.popup} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:getColor(bed.veggie),flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:17,color:"#2d4a1e"}}>{bed.veggie}</div>
            <div style={{fontSize:12,color:"#aaa"}}>🌿 {group.length}畝グループ — 🌱 {bed.pd}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:"#aaa",cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        {/* グループ内の畝一覧 */}
        <div style={{background:"#f8f8f5",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#666",marginBottom:6}}>グループの畝</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {group.map((b,i)=>(
              <span key={i} style={{fontSize:11,background:getColor(b.veggie),color:"#2d3a2e",borderRadius:6,padding:"2px 8px"}}>
                {b.row+1}列{b.col+1}番
              </span>
            ))}
          </div>
        </div>
        {/* 一括収穫記録 */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#666",marginBottom:4}}>✅ 収穫日（全畝に適用）</div>
          <input style={S.input} type="date" value={harv} onChange={e=>setHarv(e.target.value)}/>
        </div>
        {/* 一括メモ */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:600,color:"#666",marginBottom:4}}>📝 メモ（全畝に適用）</div>
          <textarea style={{...S.input,height:64,resize:"none"}} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例：豊作でした！"/>
        </div>
        <button style={{...S.btnP,marginTop:0}} onClick={()=>onSave(group,{harv,memo})}>
          🌿 {group.length}畝まとめて保存
        </button>
      </div>
    </div>
  );
}

// FieldMap: Canvas で描画（JSXのレイアウト問題を根本排除）
function FieldMap({field,copied,onBedTap,onBedLongPress,onBedSwipePaste,onVGap,onHGap}){
  const C=field.cols,R=field.rows;
  const W=Math.max(34,Math.floor(210/C));
  const G=5,P=9;
  const LABEL=20;

  // 座標計算（通路あり/なし関係なく常にP幅で固定→グリッドが動かない）
  const colX=[];colX[0]=LABEL;
  for(let c=0;c<C;c++){colX[c+1]=colX[c]+W+P;}
  const rowY=[];rowY[0]=0;
  for(let r=0;r<R;r++){rowY[r+1]=rowY[r]+W+P;}
  const totalW=colX[C],totalH=rowY[R];

  function joined(r1,c1,r2,c2){
    if(copied)return false;
    const b1=field.beds.find(b=>b.row===r1&&b.col===c1);
    const b2=field.beds.find(b=>b.row===r2&&b.col===c2);
    if(!b1||!b2||b1.veggie==="空き"||b1.veggie!==b2.veggie)return false;
    if(r1===r2)return!field.vPaths.has(`${r1}-${Math.max(c1,c2)}`);
    if(c1===c2)return!field.hPaths.has(`${Math.max(r1,r2)}-${c1}`);
    return false;
  }

  // タッチ判定用の矩形リスト
  const bedRects=useRef([]);
  const gapRects=useRef([]);

  // タッチ処理
  const containerRef=useRef(null);
  const ts=useRef({active:false,moved:false,longFired:false,cx:0,cy:0,timer:null,pasted:new Set()});

  function getRelXY(clientX,clientY){
    const el=containerRef.current;if(!el)return{x:0,y:0};
    const r=el.getBoundingClientRect();
    return{x:clientX-r.left+el.scrollLeft,y:clientY-r.top};
  }
  function hitBed(x,y){return bedRects.current.find(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)||null;}
  function hitGap(x,y){return gapRects.current.find(g=>x>=g.x&&x<g.x+g.w&&y>=g.y&&y<g.y+g.h)||null;}

  function onTS(e){
    const t=e.touches[0],s=ts.current;
    const{x,y}=getRelXY(t.clientX,t.clientY);
    s.active=true;s.moved=false;s.longFired=false;s.pasted=new Set();s.cx=t.clientX;s.cy=t.clientY;
    clearTimeout(s.timer);
    if(!copied){s.timer=setTimeout(()=>{if(s.moved)return;s.longFired=true;const b=hitBed(x,y);if(b){const bed=field.beds.find(bd=>bd.row===b.r&&bd.col===b.c);if(bed&&bed.veggie!=="空き"){if(navigator.vibrate)navigator.vibrate(40);onBedLongPress(bed);}}},480);}
  }
  function onTM(e){
    const t=e.touches[0],s=ts.current;if(!s.active)return;
    const dx=Math.abs(t.clientX-s.cx),dy=Math.abs(t.clientY-s.cy);
    if(dx>6||dy>6){s.moved=true;clearTimeout(s.timer);}
    if(copied&&s.moved){e.preventDefault();const{x,y}=getRelXY(t.clientX,t.clientY);const b=hitBed(x,y);if(b&&!s.pasted.has(`${b.r},${b.c}`)){s.pasted.add(`${b.r},${b.c}`);const bed=field.beds.find(bd=>bd.row===b.r&&bd.col===b.c);if(bed)onBedSwipePaste(bed);}}
  }
  function onTE(e){
    const t=e.changedTouches[0],s=ts.current;clearTimeout(s.timer);if(!s.active)return;s.active=false;
    if(s.longFired||s.moved)return;
    const{x,y}=getRelXY(t.clientX,t.clientY);
    const b=hitBed(x,y);if(b){const bed=field.beds.find(bd=>bd.row===b.r&&bd.col===b.c);if(bed){onBedTap(bed);return;}}
    const g=hitGap(x,y);if(g){if(g.type==="v")onVGap(g.r,g.c);else onHGap(g.r,g.c);}
  }

  // 全セルを描画
  const SOIL_V="repeating-linear-gradient(180deg,#b8935a 0,#b8935a 3px,#cca97a 3px,#cca97a 7px)";
  const SOIL_H="repeating-linear-gradient(90deg,#b8935a 0,#b8935a 3px,#cca97a 3px,#cca97a 7px)";

  // 畝とギャップを描画するdivリストを生成
  const cells=[];
  const newBedRects=[];
  const newGapRects=[];

  for(let r=0;r<R;r++){
    for(let c=0;c<C;c++){
      const x=colX[c],y=rowY[r];
      const bed=field.beds.find(b=>b.row===r&&b.col===c)||makeBed(field.id,r,c);
      const isEmpty=bed.veggie==="空き",isPaste=!!copied;
      const st=getStatus(bed),warn=!!getRotWarn(bed.hist||[],bed.veggie);
      const isH=st.label==="収穫時期！",isD=st.label==="収穫済";
      const hasHist=(bed.hist||[]).length>0;
      const jU=r>0&&joined(r,c,r-1,c),jD=r<R-1&&joined(r,c,r+1,c);
      const jL=c>0&&joined(r,c,r,c-1),jR=c<C-1&&joined(r,c,r,c+1);
      const bg=isEmpty?(isPaste?"#d4edda":"#f0ede8"):getColor(bed.veggie);
      const bc=isPaste?"#5a8a3c":warn?"#e67e22":isH?"#c0392b":isD?"#6d9e6a":"rgba(0,0,0,0.12)";
      const bw=isPaste||warn||isH||isD?2:1.5;
      const bs=isPaste?"dashed":"solid";
      newBedRects.push({x,y,w:W,h:W,r,c});

      // 畝セル
      cells.push(
        <div key={"b"+r+","+c} style={{
          position:"absolute",left:x,top:y,width:W,height:W,
          background:bg,
          borderRadius:`${jU||jL?0:8}px ${jU||jR?0:8}px ${jD||jR?0:8}px ${jD||jL?0:8}px`,
          borderTop:jU?"none":`${bw}px ${bs} ${bc}`,
          borderRight:jR?"none":`${bw}px ${bs} ${bc}`,
          borderBottom:jD?"none":`${bw}px ${bs} ${bc}`,
          borderLeft:jL?"none":`${bw}px ${bs} ${bc}`,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          boxShadow:(jU||jD||jL||jR)?"none":isH?"0 0 5px rgba(192,57,43,0.2)":"0 1px 3px rgba(0,0,0,0.08)",
        }}>
          {(isPaste||isH||isD||warn)&&<div style={{position:"absolute",top:2,right:2,background:isPaste?"#5a8a3c":isH?"#c0392b":isD?"#6d9e6a":"#e67e22",color:"white",borderRadius:4,fontSize:8,fontWeight:700,padding:"1px 3px"}}>{isPaste?"📋":isH?"!":isD?"✓":"⚠"}</div>}
          <div style={{fontSize:isEmpty?16:9,fontWeight:700,color:isEmpty?(isPaste?"#2d6a20":"#ccc"):"#2d3a2e",textAlign:"center",lineHeight:1.2,pointerEvents:"none"}}>
            {isEmpty?(isPaste?"貼付":"＋"):bed.veggie}
          </div>
          {!isEmpty&&<div style={{fontSize:7,color:"rgba(0,0,0,0.4)",marginTop:1,textAlign:"center",pointerEvents:"none"}}>{bed.ft==="sd"?"🌰":"🌿"}{bed.pd?bed.pd.slice(5):""}{hasHist?" 📜":""}</div>}
        </div>
      );

      // 右縦ギャップ（P幅固定）
      if(c<C-1){
        const gx=x+W,gw=P;
        const isVP=field.vPaths.has(`${r}-${c+1}`);
        const gapBg=isVP?SOIL_V:jR?bg:"transparent";
        newGapRects.push({x:gx,y,w:gw,h:W,type:"v",r,c:c+1});
        cells.push(
          <div key={"vg"+r+","+c} style={{position:"absolute",left:gx,top:y,width:gw,height:W,background:gapBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {!isVP&&!jR&&<div style={{width:1,height:"70%",background:"rgba(0,0,0,0.1)",borderRadius:1,pointerEvents:"none"}}/>}
          </div>
        );
      }

      // 下横ギャップ（P高さ固定）
      if(r<R-1){
        const gy=y+W,gh=P;
        const isHP=field.hPaths.has(`${r}-${c}`);
        const gapBg=isHP?SOIL_H:jD?bg:"transparent";
        newGapRects.push({x,y:gy,w:W,h:gh,type:"h",r,c});
        cells.push(
          <div key={"hg"+r+","+c} style={{position:"absolute",left:x,top:gy,width:W,height:gh,background:gapBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {!isHP&&!jD&&<div style={{width:"70%",height:1,background:"rgba(0,0,0,0.1)",borderRadius:1,pointerEvents:"none"}}/>}
          </div>
        );
      }

      // 右下交差（P×P固定）
      if(c<C-1&&r<R-1){
        const cx2=x+W,cy2=y+W;
        const cw=P,ch=P;
        const isVP=field.vPaths.has(`${r}-${c+1}`)||field.vPaths.has(`${r+1}-${c+1}`);
        const isHP=field.hPaths.has(`${r}-${c}`)||field.hPaths.has(`${r}-${c+1}`);
        const jRt=joined(r,c,r,c+1),jRb=joined(r+1,c,r+1,c+1);
        let crossBg="transparent";
        if(isVP&&isHP)crossBg=SOIL_V;
        else if(isVP)crossBg=SOIL_V;
        else if(isHP)crossBg=SOIL_H;
        else if(jD&&(jRt||jRb))crossBg=bg;
        cells.push(<div key={"cr"+r+","+c} style={{position:"absolute",left:cx2,top:cy2,width:cw,height:ch,background:crossBg}}/>);
      }
    }
    // 行ラベル
    cells.push(<div key={"lbl"+r} style={{position:"absolute",left:0,top:rowY[r],width:LABEL-2,height:W,display:"flex",alignItems:"center",justifyContent:"flex-end",fontSize:10,color:"#ccc",pointerEvents:"none"}}>{r+1}</div>);
  }

  bedRects.current=newBedRects;
  gapRects.current=newGapRects;

  return(
    <div onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
      style={{overflowX:"auto",WebkitUserSelect:"none",userSelect:"none",touchAction:copied?"none":"pan-y pinch-zoom",paddingBottom:4}}>
      <div style={{textAlign:"center",fontSize:11,color:"#aaa",marginBottom:4}}>↑ 北</div>
      <div ref={containerRef} style={{position:"relative",width:totalW,height:totalH,margin:"0 auto"}}>
        {cells}
      </div>
      <div style={{textAlign:"center",fontSize:11,color:"#aaa",marginTop:4}}>↓ 南</div>
    </div>
  );
}

function MiniMap({field}){
  const C=field.cols,R=field.rows,W=16,G=3,P=5;
  const colX=[];colX[0]=0;
  for(let c=0;c<C;c++){colX[c+1]=colX[c]+W+P;}
  const rowY=[];rowY[0]=0;
  for(let r=0;r<R;r++){rowY[r+1]=rowY[r]+W+P;}
  const cells=[];
  for(let r=0;r<R;r++){for(let c=0;c<C;c++){
    const bed=field.beds.find(b=>b.row===r&&b.col===c);
    const isHv=bed&&getStatus(bed).label==="収穫時期！";
    const x=colX[c],y=rowY[r];
    cells.push(<div key={"b"+r+c} style={{position:"absolute",left:x,top:y,width:W,height:W,background:bed?getColor(bed.veggie):"#e8e8e0",borderRadius:3,border:isHv?"2px solid #c0392b":"1px solid rgba(0,0,0,0.08)"}}/>);
    if(c<C-1){const vw=colX[c+1]-colX[c]-W,isVP=field.vPaths.has(`${r}-${c+1}`);cells.push(<div key={"v"+r+c} style={{position:"absolute",left:x+W,top:y,width:vw,height:W,background:isVP?"#b8935a":"transparent"}}/>);}
    if(r<R-1){const hh=rowY[r+1]-rowY[r]-W,isHP=field.hPaths.has(`${r}-${c}`);cells.push(<div key={"h"+r+c} style={{position:"absolute",left:x,top:y+W,width:W,height:hh,background:isHP?"#b8935a":"transparent"}}/>);}
    if(c<C-1&&r<R-1){const vw=colX[c+1]-colX[c]-W,hh=rowY[r+1]-rowY[r]-W;cells.push(<div key={"x"+r+c} style={{position:"absolute",left:x+W,top:y+W,width:vw,height:hh,background:"transparent"}}/>);}
  }}
  return(<div style={{position:"relative",width:colX[C],height:rowY[R]}}>{cells}</div>);
}

function MultiPhotoPicker({photos,onChange}){
  const ref=useRef(null);
  const MAX=5;
  function addPhoto(e){
    const file=e.target.files[0];if(!file)return;
    const rd=new FileReader();
    rd.onload=ev=>{
      const next=[...(photos||[]),ev.target.result].slice(0,MAX);
      onChange(next);
    };
    rd.readAsDataURL(file);
    e.target.value="";
  }
  function removePhoto(idx){
    onChange((photos||[]).filter((_,i)=>i!==idx));
  }
  return(
    <div>
      {(photos||[]).map((p,i)=>(
        <div key={i} style={{position:"relative",borderRadius:10,overflow:"hidden",marginBottom:6}}>
          <img src={p} alt={"写真"+(i+1)} style={{width:"100%",maxHeight:150,objectFit:"cover",display:"block"}}/>
          <button onClick={()=>removePhoto(i)} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.55)",color:"white",border:"none",borderRadius:"50%",width:26,height:26,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      ))}
      {(photos||[]).length<MAX&&(
        <div onClick={()=>ref.current?.click()} style={{border:"2px dashed #c8ddc0",borderRadius:12,padding:"16px",textAlign:"center",color:"#8aac7a",cursor:"pointer",background:"#f5fbf2"}}>
          <div style={{fontSize:26,marginBottom:3}}>📷</div>
          <div style={{fontSize:13,fontWeight:600}}>タップして写真を追加</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{(photos||[]).length}/{MAX}枚</div>
        </div>
      )}
      {(photos||[]).length>=MAX&&(
        <div style={{textAlign:"center",fontSize:12,color:"#aaa",padding:"8px 0"}}>📷 上限（{MAX}枚）に達しました</div>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={addPhoto}/>
    </div>
  );
}

function Shell({title,sub,back,right,children}){
  return(<div style={S.root}><style>{`.happ,.happ button,.happ div,.happ span{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;}.happ input,.happ textarea,.happ select{-webkit-user-select:text!important;user-select:text!important;}`}</style><div style={S.phone} className="happ"><div style={S.hdr}><div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:sub?6:0}}>{back&&<button style={S.bkBtn} onClick={back}>←</button>}<div style={{flex:1}}><div style={S.ttl}>{title}</div>{sub&&<div style={{fontSize:12,opacity:0.8,marginTop:2}}>{sub}</div>}</div>{right}</div></div><div style={S.body}>{children}</div></div></div>);
}
function Label({children}){return(<div style={{fontSize:12,fontWeight:600,color:"#666",marginTop:12,marginBottom:4}}>{children}</div>);}
function Chip({l,c,bg}){return(<span style={{fontSize:11,fontWeight:700,borderRadius:10,padding:"2px 9px",color:c,background:bg}}>{l}</span>);}
function Empty({text}){return(<div style={{textAlign:"center",paddingTop:60}}><div style={{fontSize:48}}>🌿</div><div style={{color:"#aaa",marginTop:8}}>{text}</div></div>);}
function Legend(){return(<div style={{marginTop:10}}><div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center"}}><Chip l="生育中" c="#4a7fa5" bg="#e8f2f8"/><Chip l="収穫時期！" c="#c0392b" bg="#fdecea"/><Chip l="収穫済" c="#6d9e6a" bg="#eaf4e8"/><Chip l="連作注意" c="#e67e22" bg="#fef0e0"/></div><div style={{textAlign:"center",fontSize:11,color:"#aaa",marginTop:6}}>🌰種　🌿苗　📜履歴</div></div>);}

const S={
  root:{minHeight:"100vh",background:"linear-gradient(135deg,#d4e8c2,#f0e6d3)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Hiragino Sans','Meiryo',sans-serif",padding:16},
  phone:{width:"100%",maxWidth:390,minHeight:720,background:"#fafaf7",borderRadius:32,boxShadow:"0 24px 60px rgba(0,0,0,0.18)",overflow:"hidden",display:"flex",flexDirection:"column"},
  hdr:{background:"linear-gradient(135deg,#5a8a3c,#7ab55a)",padding:"18px 16px 14px",color:"white"},
  ttl:{fontSize:20,fontWeight:700,letterSpacing:1},
  bkBtn:{background:"rgba(255,255,255,0.2)",border:"none",color:"white",fontSize:18,borderRadius:10,width:36,height:36,cursor:"pointer",flexShrink:0},
  hBtn:{background:"rgba(255,255,255,0.22)",border:"1.5px solid rgba(255,255,255,0.5)",color:"white",borderRadius:12,padding:"5px 12px",fontSize:14,fontWeight:700,cursor:"pointer"},
  body:{flex:1,overflowY:"auto",overflowX:"hidden",padding:"14px 14px 300px",WebkitOverflowScrolling:"touch"},
  card:{background:"white",borderRadius:16,padding:14,marginBottom:14,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:"1.5px solid #f0ede8",cursor:"pointer"},
  zoneCard:{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"white",borderRadius:14,border:"1.5px solid #e8e8e0",marginBottom:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  clipBar:{background:"#eaf4e8",borderBottom:"1px solid #c8e6c0",padding:"8px 16px",display:"flex",alignItems:"center",gap:8},
  hint:{fontSize:11,color:"#a0845c",background:"#fdf6ec",border:"1px solid #e8d5b0",borderRadius:8,padding:"6px 12px",marginBottom:10,textAlign:"center"},
  notesBox:{marginTop:14,background:"white",borderRadius:14,padding:"12px 14px",border:"1.5px solid #f0ede8",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"},
  editBtn:{background:"#f0f7eb",border:"1px solid #b5d5a0",borderRadius:8,padding:"3px 10px",fontSize:12,color:"#3a6e20",cursor:"pointer"},
  input:{border:"1.5px solid #e0ddd8",borderRadius:10,padding:"10px 12px",fontSize:15,background:"white",color:"#333",outline:"none",width:"100%",boxSizing:"border-box"},
  ftBtn:{flex:1,padding:"10px 8px",border:"1.5px solid #e0ddd8",borderRadius:12,background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#555",textAlign:"center"},
  ftBtnOn:{border:"2px solid #5a8a3c",background:"#eaf4e8",color:"#2d6a20"},
  estBox:{background:"#e8f5e0",border:"1.5px solid #b5dda0",borderRadius:10,padding:"9px 14px",fontSize:13,color:"#3a6e20",marginTop:4},
  sowBox:{background:"#e8f3fb",border:"1.5px solid #a8cfea",borderRadius:10,padding:"9px 14px",fontSize:13,color:"#2471a3"},
  avoidBox:{background:"#fff8f0",border:"1.5px solid #f0c080",borderRadius:10,padding:"12px 14px",marginBottom:8},
  warnBox:{background:"#fef9ec",border:"1.5px solid #f0c060",borderRadius:10,padding:"9px 14px",fontSize:13,color:"#8a5a00",marginBottom:8},
  cpBox:{background:"#f0faf5",border:"1.5px solid #a8e0c0",borderRadius:10,padding:"10px 14px"},
  btnP:{marginTop:14,marginBottom:40,width:"100%",background:"linear-gradient(135deg,#5a8a3c,#7ab55a)",color:"white",border:"none",borderRadius:14,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer"},
  btnD:{width:"100%",background:"white",color:"#c0392b",border:"1.5px solid #e0b0ae",borderRadius:14,padding:"12px",fontSize:14,cursor:"pointer"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100},
  popup:{background:"white",borderRadius:"20px 20px 0 0",padding:"20px 18px 32px",width:"100%",maxWidth:390,maxHeight:"85vh",overflowY:"auto"},
  chip:{fontSize:11,fontWeight:700,borderRadius:10,padding:"3px 10px"},
};
