
import { useState, useEffect } from "react";

const PALETTE=["#6366f1","#f59e0b","#10b981","#3b82f6","#ec4899","#8b5cf6","#14b8a6","#f97316","#84cc16","#0ea5e9"];
const MONATE=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WTAGE=["Mo","Di","Mi","Do","Fr","Sa","So"];
const C={ferien:"#6366f1",offen:"#f59e0b",krank:"#ef4444",feier:"#8b5cf6"};

const DEFAULT_EMPS=[
  {id:"u1",name:"Daut",role:"admin",vacationDays:25,regieTariff:"A"},
  {id:"u2",name:"Qail",role:"admin",vacationDays:25,regieTariff:"A"},
  {id:"u3",name:"Liridon",role:"employee",vacationDays:25,regieTariff:"A"},
  {id:"u4",name:"Islom",role:"employee",vacationDays:25,regieTariff:"A"},
];
const DEFAULT_PARTNERS=[
  {id:"p1",name:"Flüma Klima AG",contact:"Industriestrasse 8, 6030 Ebikon",phone:"041 445 68 28",web:"fluema.ch"},
  {id:"p2",name:"Air Five AG",contact:"Parkstrasse 1a, 6214 Schenkon",phone:"041 700 49 60",web:"air-five.ch"},
];
// eigene Datumshilfe, weil addD weiter unten definiert wird
const _d=n=>{const x=new Date();x.setDate(x.getDate()+n);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;};
const DEFAULT_SITES=[
  {id:"s1",name:"MFH Sonnenhof, Lüftungsisolation",street:"Bahnhofstrasse 12",zip:"6003",city:"Luzern",partnerId:"p1",sollH:420,status:"IN_ARBEIT",statusLog:[],
   plannedStart:_d(-14),plannedEnd:_d(9),deadline:_d(14),deadlineLog:[],assignees:["u3","u4"]},
  {id:"s2",name:"Umbau Praxis, Heizungsleitungen",street:"Luzernerstrasse 45",zip:"6010",city:"Kriens",partnerId:"p2",sollH:180,status:"GEPLANT",statusLog:[],
   plannedStart:_d(11),plannedEnd:_d(18),deadline:_d(25),deadlineLog:[],assignees:["u3"]},
  {id:"s3",name:"",street:"Industriestrasse 8",zip:"6030",city:"Ebikon",partnerId:"p1",sollH:96,status:"OFFERTE",statusLog:[],
   plannedStart:"",plannedEnd:"",deadline:"",deadlineLog:[],assignees:[]},
];
// Lebenszyklus einer Baustelle. Übergänge sind nicht frei wählbar.
const ST={
  OFFERTE:{l:"Offerte",bg:"#fef3c7",fg:"#92400e",ic:"📄"},
  AUFTRAG:{l:"Auftrag",bg:"#e0e7ff",fg:"#3730a3",ic:"🤝"},
  GEPLANT:{l:"Geplant",bg:"#dbeafe",fg:"#1e40af",ic:"📅"},
  IN_ARBEIT:{l:"In Arbeit",bg:"#dcfce7",fg:"#166534",ic:"🏗"},
  AUSGEFUEHRT:{l:"Ausgeführt",bg:"#ccfbf1",fg:"#115e59",ic:"✅"},
  VERRECHNET:{l:"Verrechnet",bg:"#ede9fe",fg:"#5b21b6",ic:"🧾"},
  ABGESCHLOSSEN:{l:"Abgeschlossen",bg:"#f1f5f9",fg:"#334155",ic:"🏁"},
  VERLOREN:{l:"Verloren",bg:"#fee2e2",fg:"#991b1b",ic:"✕"},
  PAUSIERT:{l:"Pausiert",bg:"#fef9c3",fg:"#854d0e",ic:"⏸"},
  STORNIERT:{l:"Storniert",bg:"#f1f5f9",fg:"#64748b",ic:"🚫"},
};
const NEXT={
  OFFERTE:["AUFTRAG","VERLOREN","STORNIERT"],
  AUFTRAG:["GEPLANT","PAUSIERT","STORNIERT"],
  GEPLANT:["IN_ARBEIT","AUFTRAG","PAUSIERT","STORNIERT"],
  IN_ARBEIT:["AUSGEFUEHRT","PAUSIERT"],
  AUSGEFUEHRT:["VERRECHNET","IN_ARBEIT"],
  VERRECHNET:["ABGESCHLOSSEN","AUSGEFUEHRT"],
  ABGESCHLOSSEN:[],
  VERLOREN:["OFFERTE"],
  PAUSIERT:["AUFTRAG","GEPLANT","IN_ARBEIT","STORNIERT"],
  STORNIERT:[],
};
// Rückschritte und Abbrüche verlangen eine Begründung
const NEEDS_REASON=["VERLOREN","STORNIERT","PAUSIERT","IN_ARBEIT","AUSGEFUEHRT","OFFERTE","AUFTRAG"];
const stOf=s=>s?.status||(s?.done?"ABGESCHLOSSEN":s?.active===false?"PAUSIERT":"IN_ARBEIT");
// Zeit buchen: nur wenn der Auftrag steht. Material auch schon in der Offertphase.
const canTime=s=>["AUFTRAG","GEPLANT","IN_ARBEIT"].includes(stOf(s));
const canMat=s=>["OFFERTE","AUFTRAG","GEPLANT","IN_ARBEIT","AUSGEFUEHRT"].includes(stOf(s));
const StBadge=({s,sz=11})=>{
  const c=ST[stOf(s)]||ST.IN_ARBEIT;
  return <span style={{...badge(c.bg,c.fg),fontSize:sz}}>{c.ic} {c.l}</span>;
};
// Rückschritt im Ablauf? Dann ist eine Begründung Pflicht.
const ST_LINE=["OFFERTE","AUFTRAG","GEPLANT","IN_ARBEIT","AUSGEFUEHRT","VERRECHNET","ABGESCHLOSSEN"];
const ST_BACK=(from,to)=>{
  if(["VERLOREN","STORNIERT","PAUSIERT"].includes(to))return true;
  const a=ST_LINE.indexOf(from),b=ST_LINE.indexOf(to);
  return a>=0&&b>=0&&b<a;
};

const DN=[10,15,20,25,32,40,50,65,80,100,125,150,200,250,300];
const ZOLL=["3/8","1/2","3/4","1","1¼","1½","2","2½","3","4","5","6","8","10","12"];
const ODIA=[17,21,27,33,42,48,60,76,89,114,140,168,219,273,324];
const VSI=[
 {id:"kautschuk",name:"Synthetischer Kautschuk",short:"Kautschuk",rabatt:50,
  desc:"Geschlitzte Schläuche aus synthetischem Kautschuk, Längs- und Querstösse dampfdicht mit Spezialklebstoff verklebt.",
  pos:[["Rohre","lfm"],["Bogen 90°","Stk"],["T-Stücke","Stk"],["Reduktionen","Stk"],["Aufhängungen","Stk"],
       ["Überbauungen","Stk"],["Abschlüsse","Stk"],["Flanschen","Stk"],["Ventile","Stk"]],
  th:[
   {d:6,off:0,v:[[23,23.3,23.8,24.6],[19.5,19.7,20,20.4],[9.5,9.6,9.6,9.8],[9.5,9.6,9.6,9.8],[7.6,7.6,7.8,7.8],
     [11,11.2,11.6,11.8],[5.7,5.8,5.8,5.8],[45.6,46.1,46.8,47.5],[86.7,87.5,88.7,90]]},
   {d:9,off:0,v:[
     [24.3,24.8,25.4,26.1,27.1,28.1,31.8,35.6,37.6,41.8,46,50.7,58.6,65.8,73.8],
     [20.2,20.4,20.7,21,21.6,22.1,23.8,31.6,33.6,38.2,43.4,50.1,65.6,80.2,96.9],
     [9.8,9.8,10,10,10.1,10.2,10.5,14.3,14.8,16,17.2,18.8,22.4,24.2,26.4],
     [9.8,9.8,10,10,10.1,10.2,10.5,14.3,14.8,16,17.2,18.8,22.4,24.2,26.4],
     [7.8,7.9,8,8,8.1,8.2,8.4,11.4,11.8,12.8,13.8,15,17.9,19.4,21.1],
     [11.8,12,12.2,12.6,13,13.3,14,18.4,19.4,21.6,23.7,26.3,31.8,35.7,39.7],
     [5.9,5.9,6,6,6,6.1,6.3,8.6,8.9,9.6,10.4,11.2,13.4,14.6,15.8],
     [47.2,47.6,48.2,48.9,49.8,50.5,52.5,68.5,71.4,77.6,83.9,91.6,109,119.8,131.2],
     [89.8,90.4,91.4,92.5,94,95.1,98.7,130.2,135.6,147,158.8,173.2,206.4,226,247]]},
   {d:13,off:0,v:[
     [27.4,28,28.8,30.5,31.8,34,38,42.6,47.4,53.2,59.6,66.3,76.4,87.6,99.7],
     [21,21.4,21.8,22.5,23.4,24.2,26.2,28.9,38.8,41.3,47.6,55.6,74.2,91.6,111.2],
     [10.2,10.2,10.4,10.5,10.8,10.9,11.2,11.6,15.6,16.8,18.2,20,24.4,26.6,29],
     [10.2,10.2,10.4,10.5,10.8,10.9,11.2,11.6,15.6,16.8,18.2,20,24.4,26.6,29],
     [8.2,8.2,8.3,8.4,8.6,8.7,9,9.3,12.6,13.4,14.6,16,19.6,21.3,23.2],
     [13.1,13.4,13.8,14.2,14.8,15.2,16,17.2,21.7,23.9,26.4,29.4,36,40.6,45.2],
     [6.1,6.2,6.2,6.3,6.4,6.6,6.7,7,9.4,10,10.9,12,14.7,16,17.4],
     [50.5,51.1,52,53,54.4,55.4,57.6,60.4,77.4,83.4,90.9,100,121.4,133.6,146.8],
     [95.1,96.2,97.8,99.4,102,103.8,107.4,112.6,145.9,157.1,170.9,188.1,228.6,251,275.3]]},
   {d:19,off:0,v:[
     [32.7,34.4,37,39.6,42.5,46.8,52.8,59.6,61.5,69,77.6,86.6,98.8,114.2,130.9],
     [22.2,22.8,24,25.1,26.9,28.6,31.3,35.2,46.4,49.1,57.7,68.8,94.4,119.4,147.4],
     [10.6,10.8,11,11.3,11.8,12.1,12.4,12.8,17.1,18.1,19.7,21.8,27,29.4,32.2],
     [10.6,10.8,11,11.3,11.8,12.1,12.4,12.8,17.1,18.1,19.7,21.8,27,29.4,32.2],
     [8.4,8.6,8.8,9,9.4,9.7,10,10.2,13.7,14.4,15.8,17.4,21.6,23.6,25.8],
     [16.4,16.8,17.5,18.2,19.2,20,21,22.4,27.6,30.1,33.4,37.2,45.6,51.4,57.4],
     [6.4,6.4,6.6,6.8,7,7.2,7.4,7.7,10.2,10.8,11.8,13,16.2,17.6,19.3],
     [58.2,59.3,61,62.8,65.6,67.6,70,73.2,91.8,98.1,107.2,118.4,144.4,159.6,175.8],
     [106.8,108.8,111.8,115,120.1,123.6,127.7,133.2,169.6,180.8,197.4,218,267,294.2,323.2]]},
   {d:25,off:0,v:[
     [39,40.4,43.6,46,52,56.9,64.2,71.6,77,82.2,92.8,103.8,119.6,137.2,155.8],
     [23.5,24.2,25.6,26.8,29.4,31.6,35,39.6,43.8,55.9,66.7,80.6,113.4,143,176.2],
     [10.9,11.1,11.4,11.8,12.3,12.7,13,13.5,14,19.2,21.2,23.8,30.6,32.8,35.3],
     [10.9,11.1,11.4,11.8,12.3,12.7,13,13.5,14,19.2,21.2,23.8,30.6,32.8,35.3],
     [8.7,8.9,9.2,9.4,9.8,10.2,10.4,10.8,11.2,15.4,17,19,24.4,26.2,28.2],
     [19.8,20.4,21.2,22,23.2,24,25.2,27,28.4,35.6,39.6,44.3,55,61.4,67.7],
     [6.6,6.6,6.8,7,7.4,7.6,7.8,8.1,8.4,11.6,12.7,14.2,18.4,19.7,21.2],
     [64.6,65.8,67.9,70,73.2,75.6,78.4,82.3,85.6,110,121,134.8,168.2,184,200.1],
     [116.6,118.8,122.4,126.2,132.1,136.2,141,147.6,153.2,200.2,220.2,245.8,309,336.4,364.8]]},
   {d:32,off:0,v:[
     [47.6,49.3,52.2,56.8,64.8,68.4,79.4,91,99.5,112.2,124,135.4,147.6,169.5,193],
     [26.2,27,28.4,30.2,33.2,35.2,40.6,48.3,55.2,76.4,88.7,104,137.6,175,216.6],
     [11.8,12,12.4,12.7,13.2,13.6,14.6,15.8,17.2,26.3,28,30,34.6,37.4,40.6],
     [11.8,12,12.4,12.7,13.2,13.6,14.6,15.8,17.2,26.3,28,30,34.6,37.4,40.6],
     [9.4,9.6,9.9,10.2,10.6,11,11.6,12.7,13.7,21,22.4,24,27.8,30,32.4],
     [25.6,26.2,27,28,29.4,30.4,32.4,35.2,37.7,49.2,53.4,58.1,67.6,75.5,83.4],
     [7.1,7.2,7.4,7.6,8,8.2,8.7,9.5,10.3,15.8,16.8,18,20.8,22.4,24.4],
     [75.6,77,79.2,81.6,85.2,87.8,93,100.8,107.9,148.6,159.2,171.8,198.1,217.6,237.8],
     [134.2,136.7,140.6,144.7,151.2,155.7,165.2,179.2,192.2,271.2,290.1,312.6,360.5,394.6,430.4]]},
  ]},
 {id:"pir",name:"PIR-Hartschaum, Hart-PVC-Umhüllung",short:"PIR",rabatt:50,
  desc:"Schalen aus PIR-Hartschaum, trocken am Rohr montiert, mit galvanisiertem Draht befestigt, Umhüllung aus Hart-PVC-Folie, verschweisst. Ab Aussen-Ø 300 mm wird eine PVC-Umhüllung nicht empfohlen.",
  pos:[["Rohre","lfm"],["Bogen 90°","Stk"],["T-Stücke","Stk"],["Reduktionen","Stk"],["Abflachungen","Stk"],
       ["Aufhängungen","Stk"],["Auskerbungen","Stk"],["Abschlüsse","Stk"]],
  th:[
   {d:20,off:0,v:[
     [21.8,22.4,23.4,24.4,25.6,26.2,28.2,30.4,32.5,40.3,48.2,56.8,73.2,88.5,104.9],
     [12,12,12.8,13,13.8,14.8,16.4,18.8,20.6,32,40.8,50,84.7,104.5,136.7],
     [14.5,14.6,14.6,14.8,14.8,15,15.6,16.4,17.2,19,20.5,22.4,27,29.8,33.2],
     [10.4,10.4,10.5,10.6,10.6,10.7,11.2,11.8,12.4,13.7,14.8,16.2,19.7,21.8,24.1],
     [10.7,10.8,10.8,10.9,11,11.1,11.6,12.2,12.8,14.2,15.4,16.9,20.6,22.7,25.1],
     [4.6,4.6,4.6,4.6,4.8,4.8,5,5.3,5.6,6.3,6.8,7.6,9.6,10.4,11.4],
     [2.1,2.1,2.1,2.2,2.2,2.2,2.4,2.5,2.7,3.1,3.4,4,5.2,5.6,6],
     [4.9,5,5,5,5.2,5.2,5.4,5.8,6.1,6.8,7.4,8.2,10.2,11.2,12.4]]},
   {d:30,off:0,v:[
     [25.2,25.9,27.1,28,29.8,31,33.5,35.9,38.5,46.3,55.2,65.8,87.1,105.8,124.2],
     [13.3,13.6,14,14.6,15.8,16,18.5,21,24.6,39.2,50.6,74.4,95.5,135.1,185.7],
     [14.8,14.9,15,15.2,15.4,15.5,16.2,17.2,18,20.1,21.8,23.9,29.4,32.6,36.2],
     [10.6,10.6,10.8,10.8,11,11.1,11.6,12.4,13,14.6,15.8,17.4,21.7,24,26.6],
     [11,11,11.1,11.2,11.4,11.5,12,12.8,13.5,15.1,16.4,18.2,22.8,25.1,27.8],
     [4.6,4.7,4.8,4.8,4.9,5,5.2,5.6,6,6.8,7.4,8.4,11,12,13.1],
     [2.2,2.2,2.2,2.2,2.3,2.4,2.5,2.7,2.9,3.4,3.8,4.5,6.4,6.8,7.3],
     [5.1,5.2,5.2,5.3,5.4,5.5,5.8,6.2,6.6,7.4,8.1,9,11.4,12.6,14]]},
   {d:40,off:0,v:[
     [29.8,30.4,31.8,34,35.6,36.8,39.8,43.4,46.1,55.2,64.9,78.5,99.1,120.2,140],
     [15.6,15.9,16.4,17.6,18.2,19.5,22.6,27,33.4,45.4,58.7,68.4,112.6,145.6,203.4],
     [15.4,15.4,15.6,15.7,15.9,16,16.8,18,19,21.6,23.4,25.8,32,35.6,39.8],
     [11,11,11.2,11.2,11.4,11.6,12.1,13,13.8,15.6,17,18.9,23.7,26.4,29.4],
     [11.4,11.4,11.6,11.6,11.8,12,12.6,13.4,14.3,16.3,17.8,19.8,24.9,27.6,31],
     [4.9,5,5,5,5.2,5.2,5.5,6,6.4,7.4,8.2,9.2,12.1,13.5,15.1],
     [2.2,2.3,2.4,2.4,2.4,2.5,2.6,3,3.2,3.8,4.4,5,7.2,8,8.9],
     [5.6,5.6,5.7,5.8,5.9,6,6.3,6.8,7.3,8.4,9.2,10.2,13,14.6,16.4]]},
   {d:50,off:0,v:[
     [35.2,36,37.2,38.9,40.7,43.2,47.8,51.6,56.7,65.5,76.8,87.1,110.7,134,157.4],
     [18.4,18.9,20,20.5,22.5,22.3,27.8,32.6,37.2,49,64.5,81,125,159.6,229.6],
     [16,16.2,16.4,16.6,16.9,17.2,18,19.4,20.6,23.4,25.4,28,34.6,38.3,42.6],
     [11.4,11.6,11.7,11.9,12.2,12.3,13,14,14.8,17,18.5,20.4,25.6,28.4,31.6],
     [11.8,12,12.2,12.3,12.6,12.8,13.4,14.4,15.4,17.6,19.2,21.4,26.8,29.8,33.2],
     [5.1,5.2,5.2,5.4,5.4,5.6,5.8,6.4,6.8,8,8.8,9.9,13,14.4,16.2],
     [2.4,2.4,2.4,2.5,2.6,2.6,2.8,3.1,3.4,4.1,4.6,5.4,7.6,8.5,9.6],
     [5.9,6,6.1,6.2,6.4,6.5,6.9,7.4,8,9.2,10,11.2,14.1,15.8,17.6]]},
   {d:60,off:0,v:[
     [41.8,47.2,48.4,51.1,52.4,53.5,55.8,59.4,62.3,71.2,84.3,100.2,126.6,151.3,176.9],
     [23.9,26.4,26.8,31,32.4,34.5,38,42.6,53.6,67.8,90.1,99.8,144.6,188.7,242.9],
     [17,17.2,17.4,17.6,18,18.3,19.3,20.8,22.1,25.3,27.5,30.3,37.7,41.8,46.6],
     [12.2,12.3,12.5,12.7,13,13.2,13.9,15,16,18.4,20,22.2,28,31,34.5],
     [12.6,12.8,13,13.2,13.4,13.6,14.4,15.6,16.6,19,20.8,23.2,29.4,32.6,36.2],
     [5.4,5.6,5.6,5.7,5.9,6,6.4,6.8,7.4,8.6,9.4,10.8,14.4,15.9,17.7],
     [2.6,2.6,2.7,2.8,2.8,2.9,3.1,3.4,3.6,4.4,5,5.8,8.6,9.4,10.5],
     [6.6,6.8,6.9,7,7.2,7.4,7.8,8.4,9,10.4,11.4,12.7,16.2,18,20.1]]},
   {d:80,off:6,v:[
     [72.8,77.8,84.2,99,107.2,125.7,156.2,185.2,213.6],
     [48.4,55.5,61,85.5,103,124.6,177.9,264.3,321.7],
     [22.4,24,25.6,29.4,32,35.5,44.8,49.4,54.6],
     [16.2,17.4,18.6,21.4,23.4,26.2,33.6,37,40.9],
     [16.8,18.1,19.4,22.3,24.4,27.4,35.4,39,43.2],
     [7.4,8.1,8.7,10.2,11.4,13,17.8,19.6,21.8],
     [3.7,4.1,4.5,5.5,6.2,7.4,11,12.2,13.5],
     [10.1,10.9,11.6,13.3,14.6,16.4,20.9,23.2,25.8]]},
  ]},
];
const vsiPrice=(list,ti,pi,di)=>{
  const t=list.th[ti];if(!t)return null;
  const i=di-(t.off||0);
  if(i<0||i>=t.v[pi].length)return null;
  return t.v[pi][i];
};

const DEFAULT_CATS=[
  {id:"c1",name:"Thermische Dämmung"},
  {id:"c2",name:"Synthetischer Kautschuk"},
  {id:"c3",name:"Brandschutzdämmung"},
  {id:"c4",name:"Alublech-Verkleidung"},
  {id:"c5",name:"Brandabschottung Weichschott"},
];
const EI=["","EI 30","EI 60","EI 90","VKF"];
// Preisliste Stand 01.01.2024, Flüma Klima AG. Netto, exkl. MwSt.
// sqt = Mindestmenge für den Kleinmengenzuschlag, sqs = Zuschlag pro Einheit
const DEFAULT_MATERIALS=[
  {id:"m1",sku:"TH-20",group:"Thermische Dämmung",name:"Thermisch 20mm (Paroc/Flumroc)",unit:"m2",price:25,stock:110,minStock:40,fire:"",sqt:30,sqs:2},
  {id:"m2",sku:"TH-30",group:"Thermische Dämmung",name:"Thermisch 30mm (Paroc/Flumroc)",unit:"m2",price:27,stock:95,minStock:40,fire:"",sqt:30,sqs:2},
  {id:"m3",sku:"TH-40",group:"Thermische Dämmung",name:"Thermisch 40mm (Paroc/Flumroc)",unit:"m2",price:30,stock:70,minStock:30,fire:"",sqt:30,sqs:2},
  {id:"m4",sku:"TH-50",group:"Thermische Dämmung",name:"Thermisch 50mm (Paroc/Flumroc)",unit:"m2",price:34,stock:60,minStock:30,fire:"",sqt:30,sqs:2},
  {id:"m5",sku:"TH-60",group:"Thermische Dämmung",name:"Thermisch 60mm (Paroc/Flumroc)",unit:"m2",price:36,stock:40,minStock:25,fire:"",sqt:30,sqs:2},
  {id:"m6",sku:"TH-100",group:"Thermische Dämmung",name:"Thermisch 100mm (Paroc/Flumroc)",unit:"m2",price:48,stock:22,minStock:25,fire:"",sqt:30,sqs:2},
  {id:"m7",sku:"AF-13",group:"Synthetischer Kautschuk",name:"Armaflex XG 13mm",unit:"m2",price:49,stock:64,minStock:20,fire:"",sqt:30,sqs:2},
  {id:"m8",sku:"AF-19",group:"Synthetischer Kautschuk",name:"Armaflex XG 19mm",unit:"m2",price:58,stock:48,minStock:20,fire:"",sqt:30,sqs:2},
  {id:"m9",sku:"AF-25",group:"Synthetischer Kautschuk",name:"Armaflex XG 25mm",unit:"m2",price:66,stock:31,minStock:20,fire:"",sqt:30,sqs:2},
  {id:"m10",sku:"AF-32",group:"Synthetischer Kautschuk",name:"Armaflex XG 32mm",unit:"m2",price:78,stock:18,minStock:20,fire:"",sqt:30,sqs:2},
  {id:"m11",sku:"AF-40",group:"Synthetischer Kautschuk",name:"Armaflex XG 40mm",unit:"m2",price:86,stock:14,minStock:10,fire:"",sqt:30,sqs:2},
  {id:"m12",sku:"AF-50",group:"Synthetischer Kautschuk",name:"Armaflex XG 50mm",unit:"m2",price:91,stock:9,minStock:10,fire:"",sqt:30,sqs:2},
  {id:"m13",sku:"FMI30-50",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP 50mm",unit:"m2",price:56,stock:52,minStock:20,fire:"EI 30",sqt:30,sqs:2},
  {id:"m14",sku:"FMI60-80",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP 80mm",unit:"m2",price:70,stock:30,minStock:20,fire:"EI 60",sqt:30,sqs:2},
  {id:"m15",sku:"FMI60-100",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP 100mm",unit:"m2",price:88,stock:17,minStock:15,fire:"EI 60",sqt:30,sqs:2},
  {id:"m16",sku:"CD30-60",group:"Brandschutzdämmung",name:"Conlit Ductbord 30 LW 60mm",unit:"m2",price:54,stock:44,minStock:15,fire:"EI 30",sqt:30,sqs:2},
  {id:"m17",sku:"CD30-100",group:"Brandschutzdämmung",name:"Conlit Ductbord 30 LW 100mm",unit:"m2",price:73,stock:24,minStock:15,fire:"EI 30",sqt:30,sqs:2},
  {id:"m18",sku:"CD60-60",group:"Brandschutzdämmung",name:"Conlit Ductbord 60 LW 60mm",unit:"m2",price:64,stock:28,minStock:15,fire:"EI 60",sqt:30,sqs:2},
  {id:"m19",sku:"CD60-100",group:"Brandschutzdämmung",name:"Conlit Ductbord 60 LW 100mm",unit:"m2",price:88,stock:13,minStock:15,fire:"EI 60",sqt:30,sqs:2},
  {id:"m20",sku:"CD90-80",group:"Brandschutzdämmung",name:"Conlit Ductbord 90 80mm",unit:"m2",price:80,stock:11,minStock:10,fire:"EI 90",sqt:30,sqs:2},
  {id:"m21",sku:"ALU-GS",group:"Alublech-Verkleidung",name:"Aluminium halbhart, glatt oder stucco",unit:"m2",price:85,stock:36,minStock:20,fire:"",sqt:30,sqs:5},
  {id:"m22",sku:"WS-100",group:"Brandabschottung Weichschott",name:"Weichschott bis 100 cm2",unit:"Stk",price:75,stock:24,minStock:10,fire:"VKF",sqt:0,sqs:0},
  {id:"m23",sku:"WS-500",group:"Brandabschottung Weichschott",name:"Weichschott 101-500 cm2",unit:"Stk",price:144,stock:18,minStock:10,fire:"VKF",sqt:0,sqs:0},
  {id:"m24",sku:"WS-1000",group:"Brandabschottung Weichschott",name:"Weichschott 501-1000 cm2",unit:"Stk",price:185,stock:12,minStock:6,fire:"VKF",sqt:0,sqs:0},
  {id:"m25",sku:"WS-2000",group:"Brandabschottung Weichschott",name:"Weichschott 1001-2000 cm2",unit:"Stk",price:228,stock:8,minStock:6,fire:"VKF",sqt:0,sqs:0},
  {id:"m26",sku:"WS-4000",group:"Brandabschottung Weichschott",name:"Weichschott 2001-4000 cm2",unit:"Stk",price:304,stock:5,minStock:4,fire:"VKF",sqt:0,sqs:0},
  {id:"m27",sku:"WS-6000",group:"Brandabschottung Weichschott",name:"Weichschott 4001-6000 cm2",unit:"Stk",price:405,stock:3,minStock:2,fire:"VKF",sqt:0,sqs:0},
  {id:"m28",sku:"WS-8000",group:"Brandabschottung Weichschott",name:"Weichschott 6001-8000 cm2",unit:"Stk",price:495,stock:2,minStock:2,fire:"VKF",sqt:0,sqs:0},
  {id:"m29",sku:"WS-10000",group:"Brandabschottung Weichschott",name:"Weichschott 8001-10000 cm2",unit:"Stk",price:558,stock:1,minStock:1,fire:"VKF",sqt:0,sqs:0},
];
// Kleinmengenzuschlag: gilt kumuliert je Baustelle und Artikel, nicht pro Buchung.
// Wer dreimal 12 m2 bucht, hat 36 m2 und damit keinen Zuschlag mehr.
const surchargeOf=(m,totalQty)=>{
  const t=Number(m?.sqt)||0,s=Number(m?.sqs)||0;
  return t>0&&s>0&&totalQty>0&&totalQty<t?s:0;
};
const qtyOnSite=(sm,siteId,materialId)=>
  sm.filter(b=>b.siteId===siteId&&b.materialId===materialId).reduce((a,b)=>a+(Number(b.qty)||0),0);

// Beispielbuchungen, damit Baustellen und Lager nicht leer wirken
const sampleBookings=emps=>{
  const staff=emps.filter(e=>e.role==="employee");
  const u=i=>(staff[i%staff.length]||emps[0]).id;
  const d=n=>addD(todayISO(),-n);
  return [
    {id:genId(),siteId:"s1",materialId:"m7",qty:45,date:d(30),userId:u(0),phase:"OFFER"},
    {id:genId(),siteId:"s1",materialId:"m2",qty:40,date:d(30),userId:u(0),phase:"OFFER"},
    {id:genId(),siteId:"s1",materialId:"m21",qty:20,date:d(30),userId:u(0),phase:"OFFER"},
    {id:genId(),siteId:"s1",materialId:"m7",qty:48,date:d(12),userId:u(0),phase:"USE"},
    {id:genId(),siteId:"s1",materialId:"m2",qty:36,date:d(9),userId:u(1),phase:"USE"},
    {id:genId(),siteId:"s1",materialId:"m21",qty:22,date:d(4),userId:u(0),phase:"USE"},
    {id:genId(),siteId:"s2",materialId:"m16",qty:18,date:d(15),userId:u(1),phase:"USE"},
    {id:genId(),siteId:"s2",materialId:"m13",qty:26,date:d(7),userId:u(0),phase:"USE"},
    {id:genId(),siteId:"s2",materialId:"m22",qty:4,date:d(3),userId:u(1),phase:"USE"},
    {id:genId(),siteId:"s3",materialId:"m9",qty:14,date:d(6),userId:u(0),phase:"OFFER"},
  ];
};
// Preisliste Stand 01.01.2024, Flüma Klima AG. Netto, exkl. MwSt.
const OLD_MATERIALS_UNUSED=[
  {id:"m1",sku:"TH-20",group:"Thermische Dämmung",name:"Thermisch 20mm (Paroc/Flumroc)",unit:"m2",price:25,stock:110,minStock:40},
  {id:"m2",sku:"TH-30",group:"Thermische Dämmung",name:"Thermisch 30mm (Paroc/Flumroc)",unit:"m2",price:27,stock:95,minStock:40},
  {id:"m3",sku:"TH-40",group:"Thermische Dämmung",name:"Thermisch 40mm (Paroc/Flumroc)",unit:"m2",price:30,stock:70,minStock:30},
  {id:"m4",sku:"TH-50",group:"Thermische Dämmung",name:"Thermisch 50mm (Paroc/Flumroc)",unit:"m2",price:34,stock:60,minStock:30},
  {id:"m5",sku:"TH-60",group:"Thermische Dämmung",name:"Thermisch 60mm (Paroc/Flumroc)",unit:"m2",price:36,stock:40,minStock:25},
  {id:"m6",sku:"TH-100",group:"Thermische Dämmung",name:"Thermisch 100mm (Paroc/Flumroc)",unit:"m2",price:48,stock:22,minStock:25},
  {id:"m7",sku:"AF-13",group:"Synthetischer Kautschuk",name:"Armaflex XG 13mm",unit:"m2",price:49,stock:64,minStock:20},
  {id:"m8",sku:"AF-19",group:"Synthetischer Kautschuk",name:"Armaflex XG 19mm",unit:"m2",price:58,stock:48,minStock:20},
  {id:"m9",sku:"AF-25",group:"Synthetischer Kautschuk",name:"Armaflex XG 25mm",unit:"m2",price:66,stock:31,minStock:20},
  {id:"m10",sku:"AF-32",group:"Synthetischer Kautschuk",name:"Armaflex XG 32mm",unit:"m2",price:78,stock:18,minStock:20},
  {id:"m11",sku:"AF-40",group:"Synthetischer Kautschuk",name:"Armaflex XG 40mm",unit:"m2",price:86,stock:14,minStock:10},
  {id:"m12",sku:"AF-50",group:"Synthetischer Kautschuk",name:"Armaflex XG 50mm",unit:"m2",price:91,stock:9,minStock:10},
  {id:"m13",sku:"FMI30-50",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP (EI 30) 50mm",unit:"m2",price:56,stock:52,minStock:20},
  {id:"m14",sku:"FMI60-80",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP (EI 60) 80mm",unit:"m2",price:70,stock:30,minStock:20},
  {id:"m15",sku:"FMI60-100",group:"Brandschutzdämmung",name:"Flumroc FMI 500 FP (EI 60) 100mm",unit:"m2",price:88,stock:17,minStock:15},
  {id:"m16",sku:"CD30-60",group:"Brandschutzdämmung",name:"Conlit Ductbord 30 LW (EI 30) 60mm",unit:"m2",price:54,stock:44,minStock:15},
  {id:"m17",sku:"CD30-100",group:"Brandschutzdämmung",name:"Conlit Ductbord 30 LW (EI 30) 100mm",unit:"m2",price:73,stock:24,minStock:15},
  {id:"m18",sku:"CD60-60",group:"Brandschutzdämmung",name:"Conlit Ductbord 60 LW (EI 60) 60mm",unit:"m2",price:64,stock:28,minStock:15},
  {id:"m19",sku:"CD60-100",group:"Brandschutzdämmung",name:"Conlit Ductbord 60 LW (EI 60) 100mm",unit:"m2",price:88,stock:13,minStock:15},
  {id:"m20",sku:"CD90-80",group:"Brandschutzdämmung",name:"Conlit Ductbord 90 (EI 90) 80mm",unit:"m2",price:80,stock:11,minStock:10},
  {id:"m21",sku:"ALU-GS",group:"Alublech-Verkleidung",name:"Aluminium halbhart, glatt oder stucco",unit:"m2",price:85,stock:36,minStock:20},
  {id:"m22",sku:"WS-100",group:"Brandabschottung Weichschott",name:"Weichschott VKF bis 100 cm2",unit:"Stk",price:75,stock:24,minStock:10},
  {id:"m23",sku:"WS-500",group:"Brandabschottung Weichschott",name:"Weichschott VKF 101-500 cm2",unit:"Stk",price:144,stock:18,minStock:10},
  {id:"m24",sku:"WS-1000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 501-1000 cm2",unit:"Stk",price:185,stock:12,minStock:6},
  {id:"m25",sku:"WS-2000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 1001-2000 cm2",unit:"Stk",price:228,stock:8,minStock:6},
  {id:"m26",sku:"WS-4000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 2001-4000 cm2",unit:"Stk",price:304,stock:5,minStock:4},
  {id:"m27",sku:"WS-6000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 4001-6000 cm2",unit:"Stk",price:405,stock:3,minStock:2},
  {id:"m28",sku:"WS-8000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 6001-8000 cm2",unit:"Stk",price:495,stock:2,minStock:2},
  {id:"m29",sku:"WS-10000",group:"Brandabschottung Weichschott",name:"Weichschott VKF 8001-10000 cm2",unit:"Stk",price:558,stock:1,minStock:1},
  {id:"m30",sku:"ZU-30",group:"Zuschläge",name:"Kleinmengenzuschlag unter 30 m2",unit:"m2",price:2,stock:0,minStock:0},
  {id:"m31",sku:"ZU-30-ALU",group:"Zuschläge",name:"Kleinmengenzuschlag Alublech unter 30 m2",unit:"m2",price:5,stock:0,minStock:0},
  {id:"m32",sku:"REG-A",group:"Regietarife",name:"Isoleur A, Regiestunde",unit:"h",price:84,stock:0,minStock:0},
  {id:"m33",sku:"REG-B",group:"Regietarife",name:"Isoleur B, Regiestunde",unit:"h",price:76,stock:0,minStock:0},
];
// (alte Beispielbuchungen entfernt, ersetzt durch die Fassung weiter oben)
const chf=n=>`Fr. ${(Number(n)||0).toFixed(2).replace(".",",")}`;
const numOf=v=>{
  if(typeof v==="number")return v;
  const n=parseFloat(String(v==null?"":v).replace(/[^0-9,.\-]/g,"").replace(",","."));
  return isNaN(n)?null:n;
};
const HEADMAP={sku:["artikelnummer","artikel-nr","artnr","nummer","sku","code"],
  group:["kategorie","gruppe","bereich","category","group"],
  name:["artikel","bezeichnung","material","produkt","beschrieb","name"],
  unit:["einheit","eh","unit"],price:["preis","preis pro m2","preis/einheit","betrag","price","chf","fr"],
  stock:["lager","lagerbestand","bestand","stock"],minStock:["mindestbestand","minimum","min","minbestand"]};
function mapHeader(cells){
  const idx={};
  cells.forEach((c,i)=>{
    const t=String(c||"").trim().toLowerCase();
    if(!t)return;
    for(const k of Object.keys(HEADMAP)) if(idx[k]===undefined&&HEADMAP[k].some(a=>t===a||t.startsWith(a)))idx[k]=i;
  });
  return idx;
}
function rowsToItems(matrix){
  if(!matrix||!matrix.length)return [];
  let hi=matrix.findIndex(r=>mapHeader(r).price!==undefined&&mapHeader(r).name!==undefined);
  let idx;
  if(hi>=0)idx=mapHeader(matrix[hi]);
  else{hi=-1;idx={group:0,name:1,unit:2,price:3,stock:4,minStock:5};}
  const out=[];
  matrix.slice(hi+1).forEach(r=>{
    if(!r||!r.length)return;
    const g=v=>v===undefined?"":String(r[v]==null?"":r[v]).trim();
    const name=g(idx.name),price=numOf(r[idx.price]);
    if(!name||price===null)return;
    if(/^(artikel|bezeichnung|material)$/i.test(name))return;
    out.push({sku:g(idx.sku),group:g(idx.group)||"Ohne Kategorie",name,unit:g(idx.unit)||"m2",price,
      stock:idx.stock!==undefined?numOf(r[idx.stock]):null,minStock:idx.minStock!==undefined?numOf(r[idx.minStock]):null});
  });
  return out;
}
const textToMatrix=t=>(t||"").split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(/\t|;/).map(x=>x.trim()));
const ini=n=>(n||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
const colorOf=(emps,id)=>PALETTE[Math.max(0,emps.findIndex(e=>e.id===id))%PALETTE.length];
const find=(emps,id)=>emps.find(e=>e.id===id)??{name:"?",id};
const tFmt=i=>i?new Date(i).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"}):"–";
const dFmt=s=>s?new Date(s+"T12:00:00").toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"}):"–";
const dFmtS=s=>s?new Date(s+"T12:00:00").toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"}):"–";
const hrs=(a,b)=>(!a||!b)?0:Math.max(0,(new Date(b)-new Date(a))/3600000);
const netH=e=>(!e||!e.clockOut)?0:Math.max(0,hrs(e.clockIn,e.clockOut)-(Number(e.pause)||0)/60);
const hStr=h=>{const m=Math.round(h*60);return `${Math.floor(m/60)}h ${m%60}min`;};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayISO=()=>iso(new Date());
const genId=()=>Math.random().toString(36).slice(2,9);
const addD=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return iso(d);};
const num=n=>Number(n.toFixed(2));
const deNum=v=>typeof v==="number"?String(v).replace(".",","):v;

const mKey=d=>(d||"").slice(0,7);
const mName=k=>k?`${MONATE[Number(k.slice(5,7))-1]} ${k.slice(0,4)}`:"";
const mStart=k=>`${k}-01`;
const mEnd=k=>iso(new Date(Number(k.slice(0,4)),Number(k.slice(5,7)),0));
const lockOf=(data,d)=>(data.locks||{})[mKey(d)];
const lockTxt=l=>l?`Gesperrt am ${dFmt(l.at.slice(0,10))} durch ${l.by}`:"";
const siteOf=(data,id)=>(data.sites||[]).find(s=>s.id===id);
const siteLbl=s=>!s?"":(s.name||`${s.street}, ${s.zip} ${s.city}`);
const siteAddr=s=>!s?"":`${s.street}, ${s.zip} ${s.city}`;
const VAT=8.1;
// Offertpositionen entstehen aus dem Material, das in der Offertphase erfasst wurde
function offerLines(data,siteId){
  const mats=data.materials||[];
  const sm=(data.siteMat||[]).filter(b=>b.siteId===siteId&&b.phase==="OFFER");
  const per={},lines=[];
  sm.forEach(b=>{if(b.materialId)per[b.materialId]=(per[b.materialId]||0)+(Number(b.qty)||0);});
  Object.entries(per).forEach(([id,q])=>{
    const m=mats.find(x=>x.id===id);if(!m)return;
    lines.push({desc:m.name+(m.fire?` (${m.fire})`:""),qty:q,unit:m.unit,price:m.price,amount:q*m.price});
    const s=surchargeOf(m,q);
    if(s)lines.push({desc:`Kleinmengenzuschlag, unter ${m.sqt} ${m.unit}`,qty:q,unit:m.unit,price:s,amount:q*s});
  });
  sm.filter(b=>!b.materialId).forEach(b=>
    lines.push({desc:b.label||"Position",qty:b.qty,unit:b.unit||"Stk",price:Number(b.price)||0,amount:b.qty*(Number(b.price)||0)}));
  return lines;
}
const printDoc=html=>{
  const el=document.getElementById("printArea");
  if(!el)return false;
  el.innerHTML=html;
  try{window.print();}catch{}
  setTimeout(()=>{el.innerHTML="";},700);
  return true;
};
// Prüfziffer nach Modulo 10 rekursiv, wie bei der Schweizer QR-Referenz
const MOD10=[[0,9,4,6,8,2,7,1,3,5],[9,4,6,8,2,7,1,3,5,0],[4,6,8,2,7,1,3,5,0,9],[6,8,2,7,1,3,5,0,9,4],
  [8,2,7,1,3,5,0,9,4,6],[2,7,1,3,5,0,9,4,6,8],[7,1,3,5,0,9,4,6,8,2],[1,3,5,0,9,4,6,8,2,7],
  [3,5,0,9,4,6,8,2,7,1],[5,0,9,4,6,8,2,7,1,3]];
const qrRef=seed=>{
  const base=String(seed).replace(/\D/g,"").padStart(26,"0").slice(-26);
  let c=0;for(const ch of base)c=MOD10[c][Number(ch)];
  const r=base+((10-c)%10);
  return r.replace(/(.{5})/g,"$1 ").trim();
};
// Rechnungsbestandteile: Offerte, Nachtrag, Regie, Gutschriften
function invoiceParts(data,siteId){
  const mats=data.materials||[],emps=data.employees||[];
  const sm=(data.siteMat||[]).filter(b=>b.siteId===siteId);
  const per=ph=>{const o={};sm.filter(b=>b.phase===ph&&b.materialId).forEach(b=>{o[b.materialId]=(o[b.materialId]||0)+(Number(b.qty)||0);});return o;};
  const off=per("OFFER"),use=per("USE"),ret=per("RETURN");
  const L=(desc,qty,unit,price)=>({desc,qty,unit,price,amount:qty*price});
  const offer=[],nach=[],gut=[];

  Object.entries(off).forEach(([id,q])=>{
    const m=mats.find(x=>x.id===id);if(!m)return;
    offer.push(L(m.name+(m.fire?` (${m.fire})`:""),q,m.unit,m.price));
    const s=surchargeOf(m,q);
    if(s)offer.push(L(`Kleinmengenzuschlag ${m.name}`,q,m.unit,s));
  });
  sm.filter(b=>b.phase==="OFFER"&&!b.materialId).forEach(b=>
    offer.push(L(b.label||"Position",b.qty,b.unit||"Stk",Number(b.price)||0)));

  Object.entries(use).forEach(([id,q0])=>{
    const m=mats.find(x=>x.id===id);if(!m)return;
    const q=q0-(ret[id]||0),diff=q-(off[id]||0);
    if(diff>0.0001)nach.push(L(`Nachtrag ${m.name}`,num(diff),m.unit,m.price));
  });
  sm.filter(b=>b.phase==="USE"&&!b.materialId).forEach(b=>
    nach.push(L(b.label||"Position",b.qty,b.unit||"Stk",Number(b.price)||0)));

  sm.filter(b=>b.phase==="RETURN"&&b.credit&&b.materialId).forEach(b=>{
    const m=mats.find(x=>x.id===b.materialId);
    if(m)gut.push(L(`Gutschrift Rückzug ${m.name}`,b.qty,m.unit,-m.price));
  });

  const co=data.company||{},rate={A:co.regieA??84,B:co.regieB??76},acc={};
  (data.entries||[]).filter(e=>e.siteId===siteId&&e.regie&&e.clockOut).forEach(e=>{
    const t=(emps.find(u=>u.id===e.userId)||{}).regieTariff||"A";
    acc[t]=(acc[t]||0)+netH(e);
  });
  const regie=Object.entries(acc).map(([t,h])=>L(`Regiearbeit Isoleur ${t}`,num(h),"h",rate[t]));
  return {offer,nach,regie,gut};
}
function invoiceHtml(co,site,partner,inv,groups,sums){
  const head=LOGO_SRC?`<img class="logoimg" src="${LOGO_SRC}"/>`:`<div class="logo">${LOGO_SVG}</div>`;
  const blk=(t,arr)=>!arr.length?"":`<tr class="grp"><td colspan="5">${t}</td></tr>`+
    arr.map(l=>`<tr><td>${l.desc}</td><td class="n">${deNum(num(l.qty))}</td><td>${l.unit}</td>
      <td class="n">${chf(l.price)}</td><td class="n">${chf(l.amount)}</td></tr>`).join("");
  return `<div class="doc">${head}
  <div class="hd"><div><h1>Rechnung ${inv.number}</h1>
    <div class="sub">${co.name||"IsoTeam Suljejmani GmbH"} · ${co.street||"Gerliswilstrasse 68"} · ${co.zip||"6020"} ${co.city||"Emmenbrücke"}${co.vat?` · MwSt. ${co.vat}`:""}</div></div>
    <div class="meta">${dFmt(inv.issuedAt.slice(0,10))}<br/>zahlbar bis ${dFmt(inv.dueDate)}</div></div>
  <table class="meta2"><tr><td><b>Auftraggeber</b><br/>${partner?.name||"–"}<br/>${partner?.contact||""}</td>
    <td><b>Objekt</b><br/>${siteLbl(site)}<br/>${siteAddr(site)}</td></tr></table>
  <h2>Leistungen</h2>
  <table><thead><tr><th>Bezeichnung</th><th>Menge</th><th>Einheit</th><th>Ansatz</th><th>Betrag</th></tr></thead>
  <tbody>${blk("Gemäss Offerte",groups.offer)}${blk("Nachtrag",groups.nach)}${blk("Regiearbeit",groups.regie)}${blk("Gutschriften",groups.gut)}</tbody></table>
  <table class="sum">
    <tr><td>Zwischensumme</td><td class="n">${chf(sums.sub)}</td></tr>
    ${sums.rab?`<tr><td>Objektrabatt ${inv.discountPct} %</td><td class="n">− ${chf(sums.rab)}</td></tr>`:""}
    <tr><td>Netto</td><td class="n">${chf(sums.netto)}</td></tr>
    <tr><td>MwSt. ${VAT} %</td><td class="n">${chf(sums.mwst)}</td></tr>
    <tr class="tot"><td>Total</td><td class="n">${chf(sums.total)}</td></tr></table>
  <div class="pay">
    <div class="qr">QR<br/><span>Zahlteil</span></div>
    <div class="payinfo"><b>Zahlbar an</b><br/>${co.name||"IsoTeam Suljejmani GmbH"}<br/>
      ${co.street||"Gerliswilstrasse 68"}, ${co.zip||"6020"} ${co.city||"Emmenbrücke"}<br/>
      IBAN ${co.iban||"CH.. .... .... .... .... ."}<br/><br/>
      <b>Referenz</b><br/>${inv.qrReference}<br/><br/>
      <b>Betrag</b> CHF ${num(sums.total).toFixed(2)}</div></div>
  <div class="ft">Konditionen: bei Zahlung bis ${dFmt(inv.discountDeadline)} 2 % Skonto, sonst
  netto bis ${dFmt(inv.dueDate)}. Bitte die Referenz bei der Zahlung angeben.</div></div>`;
}
function offerHtml(co,site,partner,off,lines,sums){
  const head=LOGO_SRC?`<img class="logoimg" src="${LOGO_SRC}"/>`:`<div class="logo">${LOGO_SVG}</div>`;
  const rows=lines.map(l=>`<tr><td>${l.desc}</td><td class="n">${deNum(num(l.qty))}</td><td>${l.unit}</td>
    <td class="n">${chf(l.price)}</td><td class="n">${chf(l.amount)}</td></tr>`).join("");
  return `<div class="doc">${head}
  <div class="hd"><div><h1>Offerte ${off.number}${off.version>1?` · Version ${off.version}`:""}</h1>
    <div class="sub">${co.name||"IsoTeam Suljejmani GmbH"} · ${co.street||"Gerliswilstrasse 68"} · ${co.zip||"6020"} ${co.city||"Emmenbrücke"}${co.vat?` · MwSt. ${co.vat}`:""}</div></div>
    <div class="meta">${dFmt(off.createdAt.slice(0,10))}<br/>gültig bis ${dFmt(off.validUntil)}</div></div>
  <table class="meta2"><tr><td><b>Auftraggeber</b><br/>${partner?.name||"–"}<br/>${partner?.contact||""}</td>
    <td><b>Objekt</b><br/>${siteLbl(site)}<br/>${siteAddr(site)}</td></tr></table>
  <h2>Positionen</h2>
  <table><thead><tr><th>Bezeichnung</th><th>Menge</th><th>Einheit</th><th>Einzelpreis</th><th>Betrag</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <table class="sum">
    <tr><td>Zwischensumme</td><td class="n">${chf(sums.sub)}</td></tr>
    ${sums.rab?`<tr><td>Objektrabatt ${off.discountPct} %</td><td class="n">− ${chf(sums.rab)}</td></tr>`:""}
    <tr><td>Netto</td><td class="n">${chf(sums.netto)}</td></tr>
    <tr><td>MwSt. ${VAT} %</td><td class="n">${chf(sums.mwst)}</td></tr>
    <tr class="tot"><td>Total</td><td class="n">${chf(sums.total)}</td></tr></table>
  <div class="ft">Konditionen: 10 Tage 2 % Skonto, 30 Tage netto. Alle Preise in CHF.
  Die Offerte beruht auf dem angegebenen Ausmass, Mehrmengen werden nach Aufwand verrechnet.</div></div>`;
}

const randSalt=()=>{
  try{const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("");}
  catch{return Math.random().toString(36).slice(2)+Date.now().toString(36);}
};
async function hashPw(pw,salt){
  try{
    const b=new TextEncoder().encode(salt+"|"+pw);
    const h=await crypto.subtle.digest("SHA-256",b);
    return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch{
    let h=5381;const s=salt+"|"+pw;
    for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;
    return "fb"+h.toString(16);
  }
}
const pwCheck=p=>({len:p.length>=10,mix:/[A-Za-zÄÖÜäöü]/.test(p)&&/[0-9]/.test(p),spc:/[^A-Za-z0-9]/.test(p)});
const pwScore=p=>Object.values(pwCheck(p)).filter(Boolean).length;

const B32="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32enc=b=>{let s="",bits=0,val=0;for(const x of b){val=(val<<8)|x;bits+=8;while(bits>=5){s+=B32[(val>>>(bits-5))&31];bits-=5;}}if(bits)s+=B32[(val<<(5-bits))&31];return s;};
const b32dec=s=>{s=(s||"").replace(/[^A-Z2-7]/gi,"").toUpperCase();let bits=0,val=0;const o=[];
  for(const c of s){const i=B32.indexOf(c);if(i<0)continue;val=(val<<5)|i;bits+=5;if(bits>=8){o.push((val>>>(bits-8))&255);bits-=8;}}
  return new Uint8Array(o);};
const newSecret=()=>{const a=new Uint8Array(20);crypto.getRandomValues(a);return b32enc(a);};
const fmtSecret=s=>(s.match(/.{1,4}/g)||[]).join(" ");
const otpUri=(name,secret)=>`otpauth://totp/IsoTeam:${encodeURIComponent(name)}?secret=${secret}&issuer=IsoTeam&algorithm=SHA1&digits=6&period=30`;

async function totpAt(secret,counter){
  const key=b32dec(secret);
  const buf=new ArrayBuffer(8),dv=new DataView(buf);
  dv.setUint32(0,Math.floor(counter/4294967296));dv.setUint32(4,counter>>>0);
  const k=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",k,buf));
  const off=sig[sig.length-1]&0xf;
  const n=((sig[off]&0x7f)<<24|sig[off+1]<<16|sig[off+2]<<8|sig[off+3])%1000000;
  return String(n).padStart(6,"0");
}
const totpNow=s=>totpAt(s,Math.floor(Date.now()/30000));
async function totpVerify(secret,code){
  const c=(code||"").replace(/\D/g,"");
  if(c.length!==6)return false;
  const t=Math.floor(Date.now()/30000);
  for(const d of [-1,0,1]) if(await totpAt(secret,t+d)===c)return true;
  return false;
}
const newRecovery=()=>{
  const a=new Uint8Array(48);crypto.getRandomValues(a);
  const al="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:8},(_,i)=>{
    const s=[...a.slice(i*6,i*6+6)].map(x=>al[x%32]).join("");
    return s.slice(0,3)+"-"+s.slice(3,6);
  });
};
const normCode=c=>(c||"").toUpperCase().replace(/[^A-Z0-9]/g,"");

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
    g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
    l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return `${y}-${String(mo).padStart(2,"0")}-${String(da).padStart(2,"0")}`;
}
function feiertageLU(y){
  const o=easter(y);
  return [[`${y}-01-01`,"Neujahr"],[`${y}-01-02`,"Berchtoldstag"],[addD(o,-2),"Karfreitag"],[addD(o,1),"Ostermontag"],
    [addD(o,39),"Auffahrt"],[addD(o,50),"Pfingstmontag"],[addD(o,60),"Fronleichnam"],[`${y}-08-01`,"Bundesfeier"],
    [`${y}-08-15`,"Mariä Himmelfahrt"],[`${y}-11-01`,"Allerheiligen"],[`${y}-12-08`,"Mariä Empfängnis"],
    [`${y}-12-25`,"Weihnachten"],[`${y}-12-26`,"Stephanstag"]];
}
let HOL={};
for(let y=2020;y<=2035;y++)feiertageLU(y).forEach(([d,n])=>HOL[d]=n);
const mergeHol=o=>{HOL={...HOL,...o};};

function workDays(s,e){
  if(!s||!e||e<s)return 0;
  let n=0;const d=new Date(s+"T12:00:00"),end=new Date(e+"T12:00:00");
  while(d<=end){if(![0,6].includes(d.getDay())&&!HOL[iso(d)])n++;d.setDate(d.getDate()+1);}
  return n;
}
const inRange=(v,s,e)=>v.startDate<=e&&v.endDate>=s;
const overlapDays=(v,s,e)=>workDays(v.startDate>s?v.startDate:s,v.endDate<e?v.endDate:e);

function genSample(emps){
  const entries=[],vacations=[],sick=[],now=new Date();
  const sids=DEFAULT_SITES.map(s=>s.id);
  emps.filter(e=>e.role==="employee").forEach((u,ui)=>{
    for(let d=55;d>=1;d--){
      const dt=new Date(now);dt.setDate(dt.getDate()-d);
      if([0,6].includes(dt.getDay())||HOL[iso(dt)])continue;
      const ci=new Date(dt);ci.setHours(7,Math.floor(Math.random()*30),0,0);
      const co=new Date(ci);co.setHours(co.getHours()+8,30+Math.floor(Math.random()*30),0,0);
      entries.push({id:genId(),userId:u.id,clockIn:ci.toISOString(),clockOut:co.toISOString(),date:iso(dt),
        pause:30,siteId:sids[(d+ui)%sids.length],note:"",manual:true});
    }
    const vs=new Date(now);vs.setDate(vs.getDate()+6+Math.floor(Math.random()*16));
    const s1=iso(vs);
    vacations.push({id:genId(),userId:u.id,startDate:s1,endDate:addD(s1,4),note:"Sommerferien",status:"pending",requestedAt:new Date().toISOString()});
    const p=new Date(now);p.setDate(p.getDate()-20);
    vacations.push({id:genId(),userId:u.id,startDate:iso(p),endDate:addD(iso(p),3),note:"Kurzferien",status:"approved",requestedAt:new Date().toISOString()});
    const sd=new Date(now);sd.setDate(sd.getDate()-5);
    if(![0,6].includes(sd.getDay()))sick.push({id:genId(),userId:u.id,date:iso(sd),note:"Erkältung"});
  });
  return {employees:emps,entries,vacations,sick,auth:{},locks:{},lockLog:[],
    partners:DEFAULT_PARTNERS,sites:DEFAULT_SITES,
    materials:DEFAULT_MATERIALS,categories:DEFAULT_CATS,siteMat:sampleBookings(emps)};
}

const card={background:"#fff",borderRadius:14,padding:14,marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,.07)"};
const row={display:"flex",alignItems:"center",justifyContent:"space-between"};
const inp={width:"100%",border:"1.5px solid #e5e7eb",borderRadius:10,padding:"11px 12px",fontSize:16,outline:"none",boxSizing:"border-box",marginBottom:11,background:"#fff",color:"#111",minHeight:46};
const lbl={fontSize:12,color:"#6b7280",marginBottom:4,display:"block",fontWeight:600};
const btn=(bg,color="#fff",x={})=>({display:"flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:11,border:"none",cursor:"pointer",fontWeight:600,fontSize:14,background:bg,color,padding:"12px 16px",minHeight:44,...x});
const sbtn=(bg,color)=>btn(bg,color,{padding:"9px 13px",fontSize:12.5,minHeight:40,borderRadius:10});
const badge=(bg,color)=>({display:"inline-block",padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:bg,color,whiteSpace:"nowrap"});
const h2={fontSize:19,fontWeight:800,color:"#111"};
const sect={fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:.6,margin:"18px 3px 8px"};
const errBox={background:"#fef2f2",border:"1px solid #fecaca",color:"#991b1b",borderRadius:10,padding:"9px 12px",fontSize:12.5,fontWeight:600,marginBottom:11};
const okBox={background:"#ecfdf5",border:"1px solid #a7f3d0",color:"#065f46",borderRadius:10,padding:"9px 12px",fontSize:12.5,fontWeight:600,marginBottom:11};
const lockBox={background:"#f1f5f9",border:"1px solid #cbd5e1",color:"#334155",borderRadius:10,padding:"9px 12px",fontSize:12.5,fontWeight:600,marginBottom:11};

const Bdg=({s})=>{
  const m={approved:[badge("#d1fae5","#065f46"),"Genehmigt"],denied:[badge("#fee2e2","#991b1b"),"Abgelehnt"],pending:[badge("#fef3c7","#92400e"),"Offen"]};
  const [st,tx]=m[s]??m.pending;return <span style={st}>{tx}</span>;
};
const Ava=({emps,id,sz=36})=>(
  <div style={{width:sz,height:sz,borderRadius:sz/2,background:colorOf(emps,id),display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:sz*.4,flexShrink:0}}>{ini(find(emps,id).name)}</div>
);
const Modal=({title,onClose,children})=>(
  <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
    <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",padding:"14px 16px 26px",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{width:38,height:4,background:"#e5e7eb",borderRadius:3,margin:"0 auto 12px"}}/>
      <div style={{...row,marginBottom:14}}>
        <span style={{fontSize:17,fontWeight:800,color:"#111"}}>{title}</span>
        <button onClick={onClose} style={{background:"#f3f4f6",border:"none",cursor:"pointer",fontSize:20,color:"#6b7280",lineHeight:1,width:34,height:34,borderRadius:17}}>×</button>
      </div>
      {children}
    </div>
  </div>
);
const Seg=({opts,val,set})=>(
  <div style={{display:"flex",background:"#eef0f3",borderRadius:11,padding:3,marginBottom:12}}>
    {opts.map(([v,l])=>(
      <button key={v} onClick={()=>set(v)} style={{flex:1,border:"none",cursor:"pointer",borderRadius:9,padding:"10px 4px",fontSize:12.5,fontWeight:700,minHeight:40,
        background:val===v?"#fff":"transparent",color:val===v?"#6366f1":"#6b7280",boxShadow:val===v?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{l}</button>))}
  </div>
);
const Chip=({on,color,onClick,children})=>(
  <button onClick={onClick} style={{border:on?`1.5px solid ${color}`:"1.5px solid #e5e7eb",background:on?color+"14":"#fff",color:on?color:"#9ca3af",
    borderRadius:20,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,minHeight:36}}>
    <span style={{width:9,height:9,borderRadius:3,background:on?color:"#d1d5db"}}/>{children}
  </button>
);
const Check=({on,onClick,title,sub})=>(
  <div onClick={onClick} style={{display:"flex",gap:10,alignItems:"flex-start",border:on?"1.5px solid #6366f1":"1.5px solid #e5e7eb",
    background:on?"#eef2ff":"#fff",borderRadius:11,padding:"11px 12px",cursor:"pointer",marginBottom:9}}>
    <div style={{width:20,height:20,borderRadius:6,flexShrink:0,marginTop:1,background:on?"#6366f1":"#fff",
      border:on?"none":"1.5px solid #cbd5e1",color:"#fff",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>{on?"✓":""}</div>
    <div><div style={{fontSize:13.5,fontWeight:700,color:"#111"}}>{title}</div>
      <div style={{fontSize:11.5,color:"#6b7280",marginTop:1}}>{sub}</div></div>
  </div>
);
const PwMeter=({pw})=>{
  const c=pwCheck(pw),s=pwScore(pw);
  const col=s>=3?"#10b981":s===2?"#f59e0b":"#ef4444";
  return(
    <div style={{marginBottom:11}}>
      <div style={{display:"flex",gap:4,marginBottom:6}}>{[0,1,2].map(i=><div key={i} style={{flex:1,height:5,borderRadius:3,background:pw&&s>i?col:"#e5e7eb"}}/>)}</div>
      <div style={{fontSize:11,color:"#6b7280",lineHeight:1.6}}>
        <span style={{color:c.len?"#059669":"#9ca3af"}}>{c.len?"✓":"○"} mindestens 10 Zeichen</span><br/>
        <span style={{color:c.mix?"#059669":"#9ca3af"}}>{c.mix?"✓":"○"} Buchstaben und Zahlen</span><br/>
        <span style={{color:c.spc?"#059669":"#9ca3af"}}>{c.spc?"✓":"○"} Sonderzeichen (empfohlen)</span></div>
    </div>);
};

const LOGO_SVG=`<svg viewBox="0 0 600 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
<text x="300" y="80" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="72" font-weight="700" fill="#0B57A4">IsoTeam</text>
<line x1="60" y1="102" x2="540" y2="102" stroke="#0B57A4" stroke-width="3"/>
<text x="300" y="128" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#64748b" letter-spacing="1.5">WÄRME · KÄLTE · LÜFTUNGSISOLATIONEN · BRANDSCHUTZ</text>
</svg>`;
const MARK_SVG=`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
<text x="50" y="68" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="52" font-weight="700" fill="#0B57A4">IT</text></svg>`;
let LOGO_SRC="";let MARK_SRC="";let COMPANY={};
const Logo=({w=260})=>LOGO_SRC
  ?<img src={LOGO_SRC} alt="Logo" style={{width:w,maxWidth:"100%",display:"block"}}/>
  :<div style={{width:w,maxWidth:"100%"}} dangerouslySetInnerHTML={{__html:LOGO_SVG}}/>;
const Mark=({s=30})=>MARK_SRC||LOGO_SRC
  ?<div style={{width:s,height:s,background:"#fff",borderRadius:7,padding:2,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center"}}>
     <img src={MARK_SRC||LOGO_SRC} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/></div>
  :<div style={{width:s,height:s*.92,background:"#fff",borderRadius:7,padding:2,boxSizing:"border-box",display:"flex"}}
     dangerouslySetInnerHTML={{__html:MARK_SVG}}/>;

function Login({emps,auth,onLogin,onSaveAuth}){
  const [pend,setPend]=useState(null);
  const [step,setStep]=useState("pw");
  const [pw,setPw]=useState("");const [pw2,setPw2]=useState("");const [code,setCode]=useState("");
  const [secret,setSecret]=useState("");const [codes,setCodes]=useState([]);
  const [demoCode,setDemoCode]=useState("");
  const [err,setErr]=useState("");const [busy,setBusy]=useState(false);const [show,setShow]=useState(false);
  const [tries,setTries]=useState(0);const [lock,setLock]=useState(0);
  const [mode,setMode]=useState("idp");
  const [idpOpen,setIdpOpen]=useState(false);
  const mail=u=>`${u.name.toLowerCase().replace(/[^a-z]/g,"")}@isoteam.ch`;

  useEffect(()=>{
    if(!lock)return;
    const t=setInterval(()=>setLock(l=>{const n=Math.max(0,l-1);if(n===0)setTries(0);return n;}),1000);
    return()=>clearInterval(t);
  },[lock]);
  useEffect(()=>{
    if(!secret||step!=="setupTotp")return;
    const upd=async()=>{try{setDemoCode(await totpNow(secret));}catch{}};
    upd();const t=setInterval(upd,2000);return()=>clearInterval(t);
  },[secret,step]);

  const a=pend?auth[pend.id]:null;
  const reset=()=>{setPw("");setPw2("");setCode("");setErr("");setShow(false);setSecret("");setCodes([]);};
  const pick=u=>{
    reset();setPend(u);
    const x=auth[u.id];
    if(!x||(!x.hash&&!x.totp))setStep("setupPw");
    else if(!x.hash)setStep("newPw");
    else setStep("pw");
  };

  const doSetupPw=()=>{
    setErr("");
    if(pwScore(pw)<2){setErr("Passwort zu schwach. Mindestens 10 Zeichen mit Buchstaben und Zahlen.");return;}
    if(pw!==pw2){setErr("Die beiden Passwörter stimmen nicht überein.");return;}
    try{setSecret(newSecret());setStep("setupTotp");}
    catch{setErr("Dieser Browser unterstützt die nötige Kryptografie nicht.");}
  };
  const doNewPw=async()=>{
    setErr("");
    if(pwScore(pw)<2){setErr("Passwort zu schwach.");return;}
    if(pw!==pw2){setErr("Die beiden Passwörter stimmen nicht überein.");return;}
    setCode("");setStep("totp");
  };
  const doSetupTotp=async()=>{
    setErr("");setBusy(true);
    try{
      if(!await totpVerify(secret,code)){setErr("Code stimmt nicht. Prüfe die Uhrzeit deines Geräts.");return;}
      const salt=a?.salt||randSalt();
      const rec=newRecovery(),recHash=[];
      for(const r of rec)recHash.push(await hashPw(normCode(r),salt));
      const hash=a?.hash||await hashPw(pw,salt);
      await onSaveAuth(pend.id,{hash,salt,totp:secret,recovery:recHash,createdAt:a?.createdAt||new Date().toISOString()});
      setCodes(rec);setStep("codes");
    }catch(e){setErr("Einrichtung fehlgeschlagen: "+e.message);}
    finally{setBusy(false);}
  };
  const doPw=async()=>{
    if(lock||busy)return;setBusy(true);setErr("");
    try{
      if(await hashPw(pw,a.salt)===a.hash){
        if(!a.totp){setSecret(newSecret());setCode("");setStep("setupTotp");}
        else{setStep("totp");setCode("");}
      }else{
        const t=tries+1;setTries(t);setPw("");
        if(t>=5){setLock(60);setErr("Zu viele Fehlversuche. Gesperrt für 60 Sekunden.");}
        else setErr(`Falsches Passwort. Noch ${5-t} Versuch${5-t===1?"":"e"}.`);
      }
    }finally{setBusy(false);}
  };
  const doTotp=async()=>{
    if(lock||busy)return;setBusy(true);setErr("");
    try{
      const newPwMode=!a.hash;
      let ok=await totpVerify(a.totp,code);
      let usedRec=null;
      if(!ok){
        const h=await hashPw(normCode(code),a.salt);
        if(normCode(code).length>=6&&(a.recovery||[]).includes(h)){ok=true;usedRec=h;}
      }
      if(ok){
        let next={...a};
        if(usedRec)next.recovery=a.recovery.filter(x=>x!==usedRec);
        if(newPwMode)next.hash=await hashPw(pw,a.salt);
        if(usedRec||newPwMode)await onSaveAuth(pend.id,next);
        onLogin(pend);return;
      }
      const t=tries+1;setTries(t);setCode("");
      if(t>=5){setLock(60);setErr("Zu viele Fehlversuche. Gesperrt für 60 Sekunden.");}
      else setErr(`Code stimmt nicht. Noch ${5-t} Versuch${5-t===1?"":"e"}.`);
    }finally{setBusy(false);}
  };

  const codeInput=onEnter=>(
    <input value={code} onChange={e=>{setCode(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&onEnter()}
      autoComplete="one-time-code" placeholder="000000" disabled={!!lock}
      style={{...inp,fontSize:20,letterSpacing:3,textAlign:"center",fontWeight:700}}/>);
  const pwField=(auto,onEnter)=>(
    <div style={{position:"relative"}}>
      <input type={show?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setErr("");}}
        onKeyDown={e=>e.key==="Enter"&&onEnter()} autoComplete={auto} disabled={!!lock}
        style={{...inp,paddingRight:74}} placeholder="••••••••••"/>
      <button onClick={()=>setShow(!show)} style={{position:"absolute",right:8,top:8,background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#6366f1",fontWeight:700,padding:"6px"}}>
        {show?"verbergen":"zeigen"}</button></div>);

  const titles={setupPw:"Zugang einrichten",newPw:"Neues Passwort setzen",setupTotp:"Zwei-Faktor einrichten",
    codes:"Wiederherstellungscodes",pw:"Anmelden",totp:"Bestätigungscode"};
  const status=u=>{const x=auth[u.id];
    if(!x||(!x.hash&&!x.totp))return["⚠️ neu","#f59e0b"];
    if(!x.hash)return["🔑 Passwort neu","#f59e0b"];
    if(!x.totp)return["📱 MFA neu","#f59e0b"];
    return["🔒","#10b981"];};

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%"}}>
      <div style={{marginBottom:14,width:"100%",display:"flex",justifyContent:"center"}}><Logo w={260}/></div>
      <div style={{fontSize:27,fontWeight:800,color:"#111",letterSpacing:-.5}}>IsoPilot</div>
      <div style={{fontSize:12.5,fontWeight:600,color:"#6366f1",marginBottom:8,textAlign:"center",lineHeight:1.5}}>
        Stunden, Material, Ausmass.<br/>Alles auf einer Baustelle.</div>
      <div style={{fontSize:13,color:"#6b7280",marginBottom:22,textAlign:"center"}}>
        {mode==="idp"?"Anmeldung über das IsoTeam-Konto":"Notfallzugang mit Passwort und Authenticator"}</div>

      {mode==="idp"&&<>
        <button onClick={()=>setIdpOpen(true)} style={{...btn("#0B57A4"),width:"100%",padding:"15px 16px",fontSize:15.5,gap:10}}>
          <span style={{width:20,height:20,borderRadius:5,background:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",
            color:"#0B57A4",fontWeight:800,fontSize:12,flexShrink:0}}>ik</span>
          Mit Infomaniak anmelden
        </button>
        <div style={{fontSize:11.5,color:"#9ca3af",marginTop:12,textAlign:"center",lineHeight:1.6,maxWidth:300}}>
          Du wirst zu Infomaniak weitergeleitet. Passwort und zweiter Faktor werden dort geprüft,
          IsoPilot sieht dein Passwort nie.</div>
        <button onClick={()=>{reset();setMode("break");}}
          style={{background:"none",border:"none",color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer",marginTop:22,textDecoration:"underline"}}>
          Infomaniak nicht erreichbar? Notfallzugang</button>
      </>}

      {mode==="break"&&<>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:11,padding:"11px 13px",fontSize:12,color:"#92400e",marginBottom:14,lineHeight:1.55}}>
          Der Notfallzugang ist nur für Vorgesetzte und nur vorgesehen, wenn Infomaniak nicht
          erreichbar ist. Jede Anmeldung darüber wird protokolliert.</div>
        {emps.filter(u=>u.role==="admin").map(u=>{const [tx,cl]=status(u);return(
          <div key={u.id} onClick={()=>pick(u)} style={{...card,display:"flex",alignItems:"center",gap:12,cursor:"pointer",border:"1.5px solid #e5e7eb",width:"100%",boxSizing:"border-box",padding:"14px"}}>
            <Ava emps={emps} id={u.id} sz={44}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{u.name}</div>
              <div style={{fontSize:12,color:"#6b7280"}}>{mail(u)}</div></div>
            <span style={{fontSize:11.5,color:cl,fontWeight:700}}>{tx}</span>
            <span style={{color:"#9ca3af",fontSize:22}}>›</span>
          </div>);})}
        <button onClick={()=>{reset();setMode("idp");}}
          style={{background:"none",border:"none",color:"#6366f1",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:10}}>
          ← Zurück zur normalen Anmeldung</button>
      </>}

      {idpOpen&&<Modal title="Infomaniak" onClose={()=>setIdpOpen(false)}>
        <div style={{background:"#f1f5f9",borderRadius:11,padding:"11px 13px",fontSize:11.5,color:"#475569",marginBottom:14,lineHeight:1.55}}>
          <b>Demo:</b> Hier würde die Anmeldeseite von Infomaniak erscheinen, mit Passwort und
          zweitem Faktor. Zur Veranschaulichung kannst du direkt ein Konto wählen.</div>
        <div style={{fontSize:12.5,color:"#6b7280",marginBottom:11}}>
          IsoPilot möchte auf dein Konto zugreifen: Name und E-Mail-Adresse.</div>
        {emps.map(u=>(
          <div key={u.id} onClick={()=>{setIdpOpen(false);onLogin(u);}}
            style={{display:"flex",alignItems:"center",gap:12,padding:"11px 12px",borderRadius:11,cursor:"pointer",
              border:"1.5px solid #e5e7eb",marginBottom:8}}>
            <Ava emps={emps} id={u.id} sz={38}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
              <div style={{fontSize:11.5,color:"#6b7280"}}>{mail(u)}</div></div>
            <span style={{color:"#9ca3af",fontSize:20}}>›</span>
          </div>))}
        <div style={{fontSize:11,color:"#9ca3af",marginTop:8,lineHeight:1.55}}>
          Nur hinterlegte Personen erhalten Zugang. Ein gültiges Infomaniak-Konto allein genügt nicht.</div>
      </Modal>}

      {pend&&<Modal title={titles[step]} onClose={()=>setPend(null)}>
        <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:14}}>
          <Ava emps={emps} id={pend.id} sz={40}/>
          <div><div style={{fontWeight:700,fontSize:15}}>{pend.name}</div>
            <div style={{fontSize:12,color:"#6b7280"}}>{pend.role==="admin"?"Admin / Vorgesetzte":"Mitarbeitende"}</div></div></div>
        {err&&<div style={errBox}>{err}</div>}

        {(step==="setupPw"||step==="newPw")&&<>
          <div style={{background:"#eef2ff",borderRadius:10,padding:"10px 12px",fontSize:12.5,color:"#4338ca",marginBottom:12}}>
            {step==="newPw"?"Das Passwort wurde zurückgesetzt. Neues Passwort setzen, der Authenticator bleibt bestehen."
              :"Erstanmeldung: Passwort setzen, danach den Authenticator verbinden."}</div>
          <label style={lbl}>Passwort</label>
          {pwField("new-password",()=>{})}
          <PwMeter pw={pw}/>
          <label style={lbl}>Passwort wiederholen</label>
          <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&(step==="newPw"?doNewPw():doSetupPw())} autoComplete="new-password" style={{...inp,marginBottom:14}}/>
          <button onClick={step==="newPw"?doNewPw:doSetupPw} style={{...btn("#6366f1"),width:"100%"}}>
            {step==="newPw"?"Weiter zum Code":"Weiter zu Zwei-Faktor"}</button></>}

        {step==="setupTotp"&&<>
          <div style={{fontSize:12.5,color:"#6b7280",marginBottom:10,lineHeight:1.55}}>
            Authenticator-App öffnen und ein neues Konto manuell mit diesem Schlüssel hinzufügen.</div>
          <div style={{background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:10,padding:"11px 12px",marginBottom:11}}>
            <div style={{fontSize:10.5,color:"#9ca3af",fontWeight:700,marginBottom:4}}>SCHLÜSSEL</div>
            <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,letterSpacing:1,wordBreak:"break-all",color:"#111"}}>{fmtSecret(secret)}</div>
            <div style={{fontSize:10.5,color:"#9ca3af",marginTop:8,wordBreak:"break-all"}}>{otpUri(pend.name,secret)}</div></div>
          <label style={lbl}>Sechsstelliger Code aus der App</label>
          {codeInput(doSetupTotp)}
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 11px",fontSize:11.5,color:"#92400e",marginBottom:12}}>
            <b>Nur in dieser Demo:</b> aktueller Code <b style={{fontFamily:"monospace",fontSize:14}}>{demoCode||"…"}</b></div>
          <button onClick={doSetupTotp} disabled={busy} style={{...btn("#6366f1"),width:"100%"}}>{busy?"…":"Verbinden und anmelden"}</button></>}

        {step==="codes"&&<>
          <div style={{fontSize:12.5,color:"#6b7280",marginBottom:11,lineHeight:1.55}}>
            Diese acht Codes ersetzen den Authenticator, falls das Handy verloren geht. Jeder funktioniert einmal.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {codes.map(c=><div key={c} style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"9px 4px",textAlign:"center",fontFamily:"monospace",fontSize:13,fontWeight:700}}>{c}</div>)}</div>
          <button onClick={()=>{navigator.clipboard?.writeText(codes.join("\n")).catch(()=>{});}} style={{...sbtn("#f3f4f6","#374151"),width:"100%",marginBottom:9}}>📋 Codes kopieren</button>
          <button onClick={()=>onLogin(pend)} style={{...btn("#6366f1"),width:"100%"}}>Notiert, weiter</button></>}

        {step==="pw"&&<>
          <label style={lbl}>Passwort</label>
          {pwField("current-password",doPw)}
          <button onClick={doPw} disabled={!!lock||busy||!pw} style={{...btn(lock||!pw?"#c7cbd3":"#6366f1"),width:"100%"}}>
            {lock?`Gesperrt (${lock}s)`:busy?"…":"Weiter"}</button></>}

        {step==="totp"&&<>
          <div style={{fontSize:12.5,color:"#6b7280",marginBottom:10}}>Code aus deiner Authenticator-App, oder ein Wiederherstellungscode.</div>
          {codeInput(doTotp)}
          <button onClick={doTotp} disabled={!!lock||busy||!code} style={{...btn(lock||!code?"#c7cbd3":"#6366f1"),width:"100%"}}>
            {lock?`Gesperrt (${lock}s)`:busy?"…":"Anmelden"}</button>
          <div style={{fontSize:11,color:"#9ca3af",marginTop:10,lineHeight:1.5}}>
            Kein Zugriff mehr? Eine vorgesetzte Person kann Passwort oder Authenticator im Adminbereich zurücksetzen.</div></>}
      </Modal>}
    </div>
  );
}

function QuickEntry({user,data,save,extDate,setExtDate}){
  const sites=(data.sites||[]).filter(canTime);
  const [f,setF]=useState({date:todayISO(),ci:"07:00",co:"17:00",pause:0,siteId:"",note:""});
  const [msg,setMsg]=useState("");const [err,setErr]=useState("");
  useEffect(()=>{if(extDate&&extDate!==f.date)setF(v=>({...v,date:extDate}));},[extDate]);
  const brutto=(()=>{
    if(!f.ci||!f.co)return 0;
    const [a,b]=[f.ci,f.co].map(t=>{const [h,m]=t.split(":").map(Number);return h*60+m;});
    return Math.max(0,b-a)/60;
  })();
  const netto=Math.max(0,brutto-(Number(f.pause)||0)/60);
  const exist=data.entries.find(e=>e.userId===user.id&&e.date===f.date);
  const lk=lockOf(data,f.date);

  const submit=()=>{
    setErr("");setMsg("");
    if(lk){setErr(`${mName(mKey(f.date))} ist abgeschlossen.`);return;}
    if(!f.date||!f.ci||!f.co){setErr("Bitte Datum, Von und Bis ausfüllen.");return;}
    if(f.co<=f.ci){setErr("Die Endzeit muss nach der Startzeit liegen.");return;}
    if(netto<=0){setErr("Die Pause ist länger als die Arbeitszeit.");return;}
    const rec={clockIn:new Date(`${f.date}T${f.ci}:00`).toISOString(),clockOut:new Date(`${f.date}T${f.co}:00`).toISOString(),
      pause:Number(f.pause)||0,siteId:f.siteId,note:f.note,manual:true};
    if(exist)save({...data,entries:data.entries.map(e=>e.id===exist.id?{...e,...rec}:e)});
    else save({...data,entries:[...data.entries,{id:genId(),userId:user.id,date:f.date,...rec}]});
    setMsg(`${exist?"Aktualisiert":"Erfasst"}: ${dFmt(f.date)}, ${hStr(netto)} netto`);
    setF({...f,note:""});setTimeout(()=>setMsg(""),4000);
  };
  const setDate=d=>{setF({...f,date:d});setExtDate&&setExtDate(d);setMsg("");setErr("");};

  return (
    <div style={{...card,padding:15}}>
      <div style={{...row,marginBottom:11}}>
        <span style={{fontWeight:800,fontSize:15}}>🕐 Arbeitszeit erfassen</span>
        {netto>0&&!lk&&<span style={{...badge("#eef2ff","#4338ca"),fontSize:12}}>{hStr(netto)} netto</span>}
      </div>
      {msg&&<div style={okBox}>✓ {msg}</div>}
      {err&&<div style={errBox}>{err}</div>}
      {lk&&<div style={lockBox}>🔒 {mName(mKey(f.date))} ist abgeschlossen. {lockTxt(lk)}</div>}
      {exist&&!msg&&!lk&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",color:"#92400e",borderRadius:10,padding:"8px 11px",fontSize:12,fontWeight:600,marginBottom:11}}>
        Für {dFmt(f.date)} besteht bereits ein Eintrag. Speichern überschreibt ihn.</div>}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["Heute",0],["Gestern",1],["Vorgestern",2]].map(([l,n])=>{
          const d=addD(todayISO(),-n),on=f.date===d;
          return <button key={l} onClick={()=>setDate(d)} style={{flex:1,border:on?"1.5px solid #6366f1":"1.5px solid #e5e7eb",
            background:on?"#eef2ff":"#fff",color:on?"#4338ca":"#6b7280",borderRadius:9,padding:"8px 4px",fontSize:11.5,fontWeight:700,cursor:"pointer",minHeight:38}}>{l}</button>;})}
      </div>
      <label style={lbl}>Datum</label>
      <input type="date" value={f.date} onChange={e=>setDate(e.target.value)} style={inp}/>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><label style={lbl}>Von</label>
          <input type="time" value={f.ci} onChange={e=>{setF({...f,ci:e.target.value});setErr("");}} disabled={!!lk} style={inp}/></div>
        <div style={{flex:1}}><label style={lbl}>Bis</label>
          <input type="time" value={f.co} onChange={e=>{setF({...f,co:e.target.value});setErr("");}} disabled={!!lk} style={inp}/></div>
      </div>
      <label style={lbl}>Pause in Minuten</label>
      <div style={{display:"flex",gap:6,marginBottom:9}}>
        {[0,15,30,45,60].map(p=>(
          <button key={p} onClick={()=>{setF({...f,pause:p});setErr("");}} disabled={!!lk}
            style={{flex:1,border:Number(f.pause)===p?"1.5px solid #6366f1":"1.5px solid #e5e7eb",background:Number(f.pause)===p?"#eef2ff":"#fff",
              color:Number(f.pause)===p?"#4338ca":"#6b7280",borderRadius:9,padding:"9px 2px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:38}}>{p}</button>))}
      </div>
      <input type="number" min="0" max="480" step="5" value={f.pause} onChange={e=>{setF({...f,pause:e.target.value});setErr("");}} disabled={!!lk} style={inp}/>
      <label style={lbl}>Baustelle</label>
      <select value={f.siteId} onChange={e=>setF({...f,siteId:e.target.value})} disabled={!!lk} style={inp}>
        <option value="">Bitte wählen</option>
        {sites.map(s=><option key={s.id} value={s.id}>{siteLbl(s)}</option>)}
      </select>
      {f.siteId&&(()=>{
        const st=siteOf(data,f.siteId);if(!st)return null;
        const ist=data.entries.filter(x=>x.siteId===st.id&&x.clockOut).reduce((a,x)=>a+netH(x),0);
        const soll=Number(st.sollH)||0,pct=soll?Math.min(100,ist/soll*100):0,over=soll>0&&ist>soll;
        const pn=find(data.partners||[],st.partnerId).name;
        return(
          <div style={{background:"#f9fafb",border:"1px solid #eef0f3",borderRadius:11,padding:"11px 12px",marginBottom:11}}>
            <div style={{fontSize:11.5,color:"#6b7280",marginBottom:8}}>{siteAddr(st)}{pn?` · ${pn}`:""}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:8}}>
              {[["Soll",soll?`${soll} h`:"–","#374151"],["Ist",`${ist.toFixed(1).replace(".",",")} h`,"#4338ca"],
                ["Rest",soll?`${(soll-ist).toFixed(1).replace(".",",")} h`:"–",over?"#b91c1c":"#166534"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#fff",borderRadius:8,padding:"7px 3px",textAlign:"center"}}>
                  <div style={{fontSize:9.5,color:"#6b7280",fontWeight:600}}>{l}</div>
                  <div style={{fontWeight:800,fontSize:13.5,color:c}}>{v}</div></div>))}</div>
            <div style={{height:6,background:"#eef0f3",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:over?"#ef4444":pct>85?"#f59e0b":"#10b981"}}/></div>
            {over&&<div style={{fontSize:11,color:"#b91c1c",fontWeight:700,marginTop:6}}>⚠️ Soll überschritten um {(ist-soll).toFixed(1).replace(".",",")} h</div>}
          </div>);})()}
      <label style={lbl}>Notiz (optional)</label>
      <input value={f.note} onChange={e=>setF({...f,note:e.target.value})} disabled={!!lk} placeholder="z.B. Lüftungskanäle UG isoliert" style={inp}/>
      {brutto>0&&!lk&&<div style={{background:"#f9fafb",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#374151",marginBottom:11}}>
        Brutto {hStr(brutto)}, Pause {Number(f.pause)||0} min, <b>netto {hStr(netto)}</b></div>}
      <button onClick={submit} disabled={!!lk} style={{...btn(lk?"#c7cbd3":"#6366f1"),width:"100%",fontSize:15.5,padding:"14px 0"}}>
        {lk?"🔒 Monat abgeschlossen":exist?"Eintrag überschreiben":"Zeit speichern"}</button>
    </div>
  );
}

function MonthBooking({user,data,sel,setSel}){
  const now=new Date();
  const [m,setM]=useState(now.getMonth());
  const [y,setY]=useState(now.getFullYear());
  const td=todayISO();
  const lead=(new Date(y,m,1).getDay()+6)%7;
  const dim=new Date(y,m+1,0).getDate();
  const cells=[...Array(lead).fill(null),...Array.from({length:dim},(_,i)=>iso(new Date(y,m,i+1)))];
  while(cells.length%7)cells.push(null);
  const shift=n=>{const d=new Date(y,m+n,1);setM(d.getMonth());setY(d.getFullYear());};
  const key=`${y}-${String(m+1).padStart(2,"0")}`;
  const lk=(data.locks||{})[key];

  const info=d=>{
    const e=data.entries.find(x=>x.userId===user.id&&x.date===d);
    if(e&&e.clockOut)return{t:"ok",h:netH(e)};
    if(e)return{t:"open"};
    if(data.sick.find(s=>s.userId===user.id&&s.date===d))return{t:"krank"};
    if(data.vacations.find(v=>v.userId===user.id&&v.status!=="denied"&&v.startDate<=d&&v.endDate>=d))return{t:"ferien"};
    if(HOL[d])return{t:"feier"};
    if([0,6].includes(new Date(d+"T12:00:00").getDay()))return{t:"we"};
    if(d>td)return{t:"future"};
    return{t:"miss"};
  };
  const ST={ok:{bg:"#dcfce7",bd:"#86efac",fg:"#166534"},open:{bg:"#fef3c7",bd:"#fcd34d",fg:"#92400e"},
    miss:{bg:"#fef2f2",bd:"#fca5a5",fg:"#b91c1c"},ferien:{bg:"#e0e7ff",bd:"#c7d2fe",fg:"#3730a3"},
    krank:{bg:"#fee2e2",bd:"#fecaca",fg:"#991b1b"},feier:{bg:"#f3f0ff",bd:"#ddd6fe",fg:"#6d28d9"},
    we:{bg:"#fafafa",bd:"#f0f1f3",fg:"#c3c7cd"},future:{bg:"#fff",bd:"#f0f1f3",fg:"#b0b4bb"}};
  const stats=cells.filter(Boolean).reduce((a,d)=>{const i=info(d);
    if(i.t==="ok"){a.ok++;a.h+=i.h;}if(i.t==="miss")a.miss++;return a;},{ok:0,miss:0,h:0});

  return (
    <div style={card}>
      <div style={{...row,marginBottom:11}}>
        <button onClick={()=>shift(-1)} style={{...btn("#f3f4f6","#374151"),padding:"7px 14px",fontSize:17,borderRadius:10,minHeight:38}}>‹</button>
        <span style={{fontWeight:800,fontSize:15}}>{MONATE[m]} {y}{lk&&" 🔒"}</span>
        <button onClick={()=>shift(1)} style={{...btn("#f3f4f6","#374151"),padding:"7px 14px",fontSize:17,borderRadius:10,minHeight:38}}>›</button>
      </div>
      {lk&&<div style={lockBox}>🔒 Monat abgeschlossen. {lockTxt(lk)}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:11}}>
        {[["Erfasst",`${stats.ok}`,"#166534"],["Offen",`${stats.miss}`,stats.miss?"#b91c1c":"#9ca3af"],["Netto",hStr(stats.h),"#4338ca"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#f9fafb",borderRadius:9,padding:"7px 3px",textAlign:"center"}}>
            <div style={{fontSize:9.5,color:"#6b7280",fontWeight:600}}>{l}</div>
            <div style={{fontWeight:800,fontSize:14,color:c}}>{v}</div></div>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,opacity:lk?.75:1}}>
        {WTAGE.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:"#b0b4bb",paddingBottom:2}}>{d}</div>)}
        {cells.map((d,i)=>{
          if(!d)return <div key={i}/>;
          const it=info(d),s=ST[it.t],isSel=d===sel,isT=d===td;
          return(
            <div key={i} onClick={()=>setSel(d)} style={{minHeight:46,borderRadius:9,cursor:"pointer",boxSizing:"border-box",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
              background:isSel?"#6366f1":s.bg,
              border:isSel?"2px solid #4338ca":isT?"2px solid #6366f1":`1px solid ${s.bd}`,
              borderStyle:it.t==="miss"&&!isSel&&!lk?"dashed":undefined}}>
              <span style={{fontSize:12,fontWeight:700,lineHeight:1,color:isSel?"#fff":s.fg}}>{Number(d.slice(-2))}</span>
              <span style={{fontSize:9,lineHeight:1.1,fontWeight:700,color:isSel?"#fff":s.fg}}>
                {it.t==="ok"?`${it.h.toFixed(1).replace(".",",")}h`:it.t==="miss"?(lk?"–":"offen"):it.t==="open"?"aktiv":
                 it.t==="ferien"?"🌴":it.t==="krank"?"🤒":it.t==="feier"?"🎉":""}</span>
            </div>);})}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 11px",marginTop:11,paddingTop:10,borderTop:"1px solid #f3f4f6"}}>
        {[["Erfasst","ok"],["Nicht erfasst","miss"],["Ferien","ferien"],["Krank","krank"],["Feiertag","feier"]].map(([l,k])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:11,height:11,borderRadius:3,background:ST[k].bg,border:`1px ${k==="miss"?"dashed":"solid"} ${ST[k].bd}`,boxSizing:"border-box"}}/>
            <span style={{fontSize:10.5,color:"#6b7280",fontWeight:600}}>{l}</span></div>))}
      </div>
      <div style={{fontSize:11,color:"#9ca3af",marginTop:9}}>Tag antippen, um ihn oben im Formular zu erfassen.</div>
    </div>
  );
}

function Dash({user,data,save,isAdmin,go}){
  const emps=data.employees,td=todayISO(),yr=new Date().getFullYear();
  const staff=emps;
  const myE=data.entries.find(e=>e.userId===user.id&&e.date===td);
  const [selDate,setSelDate]=useState(todayISO());
  const todayH=myE?netH(myE):0;
  const wk=new Date();wk.setDate(wk.getDate()-((wk.getDay()+6)%7));wk.setHours(0,0,0,0);
  const wkH=data.entries.filter(e=>e.userId===user.id&&new Date(e.date+"T12:00:00")>=wk).reduce((s,e)=>s+netH(e),0);
  const used=data.vacations.filter(v=>v.userId===user.id&&v.status==="approved"&&v.startDate.slice(0,4)===String(yr)).reduce((s,v)=>s+workDays(v.startDate,v.endDate),0);
  const an=find(emps,user.id).vacationDays??0;
  const pend=data.vacations.filter(v=>v.status==="pending").length;

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,color:"#6b7280"}}>{new Date().toLocaleDateString("de-CH",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={{fontSize:22,fontWeight:800,color:"#111"}}>Hallo, {user.name}! 👋</div>
      </div>
      {HOL[td]&&<div style={{...card,background:"#f3f0ff",border:`1px solid ${C.feier}33`,padding:"11px 14px"}}>
        <span style={{fontSize:13.5,fontWeight:700,color:"#5b21b6"}}>🎉 Heute ist {HOL[td]}</span>
        <div style={{fontSize:11.5,color:"#7c3aed"}}>Feiertag Kanton Luzern</div></div>}
      {isAdmin&&pend>0&&<div onClick={()=>go("abs")} style={{...card,background:"#fffbeb",border:"1px solid #fde68a",cursor:"pointer"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#92400e"}}>⚠️ {pend} Ferienantr{pend>1?"äge":"ag"} offen</div>
        <div style={{fontSize:12,color:"#b45309",marginTop:2}}>Antippen zum Prüfen ›</div></div>}

      <QuickEntry user={user} data={data} save={save} extDate={selDate} setExtDate={setSelDate}/>
      <MonthBooking user={user} data={data} sel={selDate} setSel={setSelDate}/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:10}}>
        {[["Heute",hStr(todayH)],["Diese Woche",hStr(wkH)]].map(([l,v])=>(
          <div key={l} style={{...card,marginBottom:0,textAlign:"center",padding:"12px 8px"}}>
            <div style={{fontSize:11,color:"#6b7280"}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:"#6366f1"}}>{v}</div></div>))}
      </div>

      <div style={{...card,cursor:"pointer"}} onClick={()=>go("abs")}>
        <div style={{...row,marginBottom:8}}>
          <span style={{fontWeight:700,fontSize:14}}>🌴 Feriensaldo {yr}</span>
          <span style={{fontWeight:800,fontSize:17,color:"#6366f1"}}>{Math.max(0,an-used)} Tage</span></div>
        <div style={{height:9,background:"#eef0f3",borderRadius:5,overflow:"hidden",marginBottom:6}}>
          <div style={{height:"100%",width:`${an?Math.min(100,used/an*100):0}%`,background:"#6366f1"}}/></div>
        <div style={{fontSize:11.5,color:"#6b7280"}}>{used} von {an} Tagen bezogen</div>
      </div>

      {isAdmin&&<div style={card}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Team heute</div>
        {staff.map(u=>{
          const e=data.entries.find(x=>x.userId===u.id&&x.date===td);
          const sk=data.sick.find(s=>s.userId===u.id&&s.date===td);
          const vc=data.vacations.find(v=>v.userId===u.id&&v.status==="approved"&&v.startDate<=td&&v.endDate>=td);
          const st=e&&siteOf(data,e.siteId);
          return(<div key={u.id} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}><Ava emps={emps} id={u.id}/>
              <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{u.name}</div>
              {st&&<div style={{fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🏗 {siteLbl(st)}</div>}</div></div>
            {sk?<span style={badge("#fee2e2","#991b1b")}>Krank</span>:vc?<span style={badge("#e0e7ff","#3730a3")}>Ferien</span>:
              <span style={{fontWeight:700,fontSize:13,color:e?"#6366f1":"#9ca3af"}}>{e?hStr(netH(e)):"–"}</span>}
          </div>);})}
      </div>}
    </div>
  );
}

function Kalender({user,data}){
  const emps=data.employees,now=new Date();
  const [m,setM]=useState(now.getMonth());
  const [y,setY]=useState(now.getFullYear());
  const [sel,setSel]=useState(todayISO());
  const [mine,setMine]=useState(false);
  const [f,setF]=useState({fer:true,kr:true,fei:true});

  const lead=(new Date(y,m,1).getDay()+6)%7;
  const dim=new Date(y,m+1,0).getDate();
  const cells=[...Array(lead).fill(null),...Array.from({length:dim},(_,i)=>iso(new Date(y,m,i+1)))];
  while(cells.length%7)cells.push(null);
  const mS=iso(new Date(y,m,1)),mE=iso(new Date(y,m+1,0));

  const vacs=data.vacations.filter(v=>v.status!=="denied"&&(!mine||v.userId===user.id));
  const onDay=d=>f.fer?vacs.filter(v=>v.startDate<=d&&v.endDate>=d):[];
  const sickOn=d=>f.kr?data.sick.filter(s=>s.date===d&&(!mine||s.userId===user.id)):[];
  const shift=n=>{const d=new Date(y,m+n,1);setM(d.getMonth());setY(d.getFullYear());};

  const monthItems=[
    ...(f.fer?vacs.filter(v=>inRange(v,mS,mE)).map(v=>({k:v.id,d:v.startDate>mS?v.startDate:mS,type:v.status==="approved"?"ferien":"offen",uid:v.userId,
      txt:`${dFmtS(v.startDate)} bis ${dFmtS(v.endDate)}`,sub:`${workDays(v.startDate,v.endDate)} Arbeitstage`})):[]),
    ...(f.kr?data.sick.filter(s=>s.date>=mS&&s.date<=mE&&(!mine||s.userId===user.id)).map(s=>({k:s.id,d:s.date,type:"krank",uid:s.userId,txt:dFmt(s.date),sub:s.note||"Krankheitstag"})):[]),
    ...(f.fei?Object.entries(HOL).filter(([d])=>d>=mS&&d<=mE).map(([d,n])=>({k:d,d,type:"feier",uid:null,txt:n,sub:`Feiertag, ${dFmt(d)}`})):[]),
  ].sort((a,b)=>a.d.localeCompare(b.d));
  const TYP={ferien:["🌴","Ferien",C.ferien],offen:["🌴","Beantragt",C.offen],krank:["🤒","Krankheit",C.krank],feier:["🎉","Feiertag",C.feier]};

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{...row,marginBottom:10}}><span style={h2}>Kalender</span>
        <button onClick={()=>setMine(!mine)} style={sbtn(mine?"#6366f1":"#f3f4f6",mine?"#fff":"#374151")}>{mine?"👤 Nur ich":"👥 Team"}</button></div>
      <div style={{display:"flex",gap:7,marginBottom:11,flexWrap:"wrap"}}>
        <Chip on={f.fer} color={C.ferien} onClick={()=>setF({...f,fer:!f.fer})}>Ferien</Chip>
        <Chip on={f.kr} color={C.krank} onClick={()=>setF({...f,kr:!f.kr})}>Krankheit</Chip>
        <Chip on={f.fei} color={C.feier} onClick={()=>setF({...f,fei:!f.fei})}>Feiertage</Chip>
      </div>

      <div style={card}>
        <div style={{...row,marginBottom:12}}>
          <button onClick={()=>shift(-1)} style={{...btn("#f3f4f6","#374151"),padding:"8px 16px",fontSize:18,borderRadius:10}}>‹</button>
          <span style={{fontWeight:800,fontSize:15.5}}>{MONATE[m]} {y}</span>
          <button onClick={()=>shift(1)} style={{...btn("#f3f4f6","#374151"),padding:"8px 16px",fontSize:18,borderRadius:10}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {WTAGE.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:"#b0b4bb",paddingBottom:3}}>{d}</div>)}
          {cells.map((d,i)=>{
            if(!d)return <div key={i}/>;
            const we=[0,6].includes(new Date(d+"T12:00:00").getDay());
            const isH=f.fei&&!!HOL[d],isT=d===todayISO(),vs=onDay(d),sk=sickOn(d);
            const bars=[...vs.map(v=>({c:colorOf(emps,v.userId),ap:v.status==="approved"})),...sk.map(()=>({c:C.krank,ap:true}))];
            return(
              <div key={i} onClick={()=>setSel(d)} style={{minHeight:48,borderRadius:9,cursor:"pointer",padding:"4px 3px 3px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,boxSizing:"border-box",
                background:sel===d?"#6366f1":isH?"#f3f0ff":we?"#fafafa":"#fff",
                border:sel===d?"1.5px solid #6366f1":isT?"1.5px solid #6366f1":isH?`1px solid ${C.feier}44`:"1px solid #f0f1f3"}}>
                <span style={{fontSize:12.5,fontWeight:isT||isH?800:600,lineHeight:1.1,color:sel===d?"#fff":isH?"#6d28d9":we?"#c3c7cd":"#374151"}}>{Number(d.slice(-2))}</span>
                {isH&&<span style={{fontSize:9,lineHeight:1}}>🎉</span>}
                <div style={{width:"100%",display:"flex",flexDirection:"column",gap:1.5,marginTop:"auto"}}>
                  {bars.slice(0,3).map((b,j)=>(
                    <div key={j} style={{height:3.5,borderRadius:2,background:sel===d?"#ffffffcc":b.ap?b.c:"transparent",
                      border:b.ap?"none":`1.5px dashed ${sel===d?"#fff":b.c}`,boxSizing:"border-box"}}/>))}
                  {bars.length>3&&<span style={{fontSize:8,fontWeight:700,color:sel===d?"#fff":"#9ca3af",lineHeight:1}}>+{bars.length-3}</span>}
                </div></div>);})}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"7px 12px",marginTop:12,paddingTop:11,borderTop:"1px solid #f3f4f6"}}>
          {[["Ferien genehmigt",C.ferien,"solid"],["Ferien beantragt",C.ferien,"dash"],["Krankheit",C.krank,"solid"],["Feiertag",C.feier,"box"]].map(([l,c,st])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:16,height:st==="box"?11:4,borderRadius:st==="box"?3:2,
                background:st==="dash"?"transparent":st==="box"?"#f3f0ff":c,border:st==="dash"?`1.5px dashed ${c}`:st==="box"?`1px solid ${c}66`:"none",boxSizing:"border-box"}}/>
              <span style={{fontSize:10.5,color:"#6b7280",fontWeight:600}}>{l}</span></div>))}
        </div>
      </div>

      <div style={card}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:9}}>{dFmt(sel)}</div>
        {(data.sites||[]).filter(s=>s.plannedStart&&s.plannedStart<=sel&&(s.plannedEnd||s.plannedStart)>=sel
          &&(!mine||(s.assignees||[]).includes(user.id))).map(s=>(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:ST[stOf(s)].fg,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,fontWeight:600}}>🏗 {siteLbl(s)}</div>
              <div style={{fontSize:11.5,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {(s.assignees||[]).map(id=>find(emps,id).name).join(", ")||"niemand eingeteilt"}
                {s.deadline?` · Termin ${dFmtS(s.deadline)}`:""}</div></div>
            <StBadge s={s} sz={10}/></div>))}
        {f.fei&&HOL[sel]&&<div style={{background:"#f3f0ff",borderRadius:10,padding:"9px 12px",marginBottom:8,marginTop:8,borderLeft:`4px solid ${C.feier}`}}>
          <div style={{fontSize:13.5,fontWeight:700,color:"#5b21b6"}}>🎉 {HOL[sel]}</div>
          <div style={{fontSize:11,color:"#7c3aed"}}>Feiertag Kanton Luzern</div></div>}
        {onDay(sel).map(v=>(
          <div key={v.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
            <Ava emps={emps} id={v.userId} sz={30}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,fontWeight:600}}>{find(emps,v.userId).name}</div>
              <div style={{fontSize:11.5,color:"#9ca3af"}}>🌴 {dFmtS(v.startDate)} bis {dFmtS(v.endDate)}</div></div>
            <Bdg s={v.status}/></div>))}
        {sickOn(sel).map(s=>(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
            <Ava emps={emps} id={s.userId} sz={30}/>
            <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:600}}>{find(emps,s.userId).name}</div>
              <div style={{fontSize:11.5,color:"#9ca3af"}}>🤒 Krankheitstag</div></div>
            <span style={badge("#fee2e2","#991b1b")}>Krank</span></div>))}
        {!(f.fei&&HOL[sel])&&!onDay(sel).length&&!sickOn(sel).length&&<p style={{fontSize:12.5,color:"#9ca3af",margin:0}}>Keine Einträge an diesem Tag.</p>}
      </div>

      <div style={sect}>ÜBERSICHT {MONATE[m].toUpperCase()}</div>
      <div style={{...card,marginBottom:16}}>
        {monthItems.length===0&&<p style={{fontSize:12.5,color:"#9ca3af",margin:0}}>Nichts in diesem Monat.</p>}
        {monthItems.map(it=>{
          const [ic,nm,col]=TYP[it.type];
          return(
            <div key={it.k+it.type} onClick={()=>setSel(it.d)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #f3f4f6",cursor:"pointer"}}>
              <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:col,flexShrink:0}}/>
              <span style={{fontSize:15}}>{ic}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:600,color:"#111"}}>{it.uid?find(emps,it.uid).name:it.txt}</div>
                <div style={{fontSize:11.5,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.uid?it.txt:it.sub}</div></div>
              <span style={{...badge(col+"1a",col),fontSize:10}}>{nm}</span>
            </div>);})}
      </div>
    </div>
  );
}

function TimeLog({user,data,save,isAdmin}){
  const emps=data.employees,staff=emps;
  const sites=(data.sites||[]);
  const now=new Date();
  const [fu,setFu]=useState(isAdmin?(staff[0]?.id??user.id):user.id);
  const [key,setKey]=useState(mKey(todayISO()));
  const [modal,setModal]=useState(null);
  const [edit,setEdit]=useState(null);
  const [form,setForm]=useState({date:"",ci:"",co:"",pause:30,siteId:"",note:""});
  const [err,setErr]=useState("");
  const F=f=>setForm(v=>({...v,...f}));
  const who=isAdmin?fu:user.id;
  const entries=data.entries.filter(e=>e.userId===who&&mKey(e.date)===key).sort((a,b)=>b.date.localeCompare(a.date));
  const totalH=entries.reduce((s,e)=>s+netH(e),0);
  const pauseM=entries.reduce((s,e)=>s+(Number(e.pause)||0),0);
  const mLock=(data.locks||{})[key];
  const fLock=lockOf(data,form.date);
  const shift=n=>{const d=new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1+n,1);setKey(mKey(iso(d)));};

  const REGIE={A:(data.company||{}).regieA??84,B:(data.company||{}).regieB??76};
  const tarifOf=id=>(find(emps,id).regieTariff||"A");
  const openEdit=e=>{setErr("");setEdit(e);setForm({date:e.date,ci:e.clockIn?new Date(e.clockIn).toTimeString().slice(0,5):"",
    co:e.clockOut?new Date(e.clockOut).toTimeString().slice(0,5):"",pause:Number(e.pause)||0,siteId:e.siteId||"",
    regie:!!e.regie,note:e.note||""});setModal("edit");};
  const openAdd=()=>{setErr("");setEdit(null);setForm({date:`${key}-01`===mStart(key)&&key===mKey(todayISO())?todayISO():mStart(key),
    ci:"07:00",co:"17:00",pause:0,siteId:"",regie:false,note:""});setModal("add");};
  const saveEntry=()=>{
    setErr("");
    if(fLock){setErr(`${mName(mKey(form.date))} ist abgeschlossen.`);return;}
    if(edit&&lockOf(data,edit.date)){setErr("Der ursprüngliche Monat ist abgeschlossen.");return;}
    if(!form.date||!form.ci||!form.co){setErr("Bitte alle Felder ausfüllen.");return;}
    const rec={clockIn:new Date(`${form.date}T${form.ci}:00`).toISOString(),clockOut:new Date(`${form.date}T${form.co}:00`).toISOString(),
      date:form.date,pause:Number(form.pause)||0,siteId:form.siteId,regie:!!form.regie,note:form.note,manual:true};
    if(modal==="edit"&&edit)save({...data,entries:data.entries.map(e=>e.id===edit.id?{...e,...rec}:e)});
    else save({...data,entries:[...data.entries,{id:genId(),userId:who,...rec}]});
    setModal(null);
  };
  const del=id=>{
    const e=data.entries.find(x=>x.id===id);
    if(e&&lockOf(data,e.date)){setErr("Monat abgeschlossen, löschen nicht möglich.");return;}
    save({...data,entries:data.entries.filter(x=>x.id!==id)});setModal(null);
  };

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{...row,marginBottom:11}}><span style={h2}>Zeitprotokoll</span>
        <button onClick={openAdd} style={sbtn("#6366f1")}>+ Eintrag</button></div>
      {isAdmin&&<select value={fu} onChange={e=>setFu(e.target.value)} style={inp}>{staff.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <div style={card}>
        <div style={{...row,marginBottom:10}}>
          <button onClick={()=>shift(-1)} style={{...btn("#f3f4f6","#374151"),padding:"7px 14px",fontSize:17,borderRadius:10,minHeight:38}}>‹</button>
          <span style={{fontWeight:800,fontSize:15}}>{mName(key)}{mLock&&" 🔒"}</span>
          <button onClick={()=>shift(1)} style={{...btn("#f3f4f6","#374151"),padding:"7px 14px",fontSize:17,borderRadius:10,minHeight:38}}>›</button></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {[["Einträge",entries.length],["Pausen",`${Math.floor(pauseM/60)}h ${pauseM%60}min`],["Netto",hStr(totalH)]].map(([l,v])=>(
            <div key={l} style={{background:"#f9fafb",borderRadius:9,padding:"8px 3px",textAlign:"center"}}>
              <div style={{fontSize:9.5,color:"#6b7280",fontWeight:600}}>{l}</div>
              <div style={{fontWeight:800,fontSize:14,color:"#4338ca"}}>{v}</div></div>))}
        </div>
      </div>
      {entries.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Keine Einträge in {mName(key)}.</p>}
      {entries.map(e=>{
        const lk=lockOf(data,e.date),st=siteOf(data,e.siteId);
        return(
        <div key={e.id} style={{...card,cursor:lk?"default":"pointer",opacity:lk?.72:1,
          borderLeft:lk?"4px solid #94a3b8":e.manual?"4px solid #6366f1":"4px solid #10b981"}}
          onClick={()=>!lk&&openEdit(e)}>
          <div style={row}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:"#111"}}>{dFmt(e.date)}{lk&&" 🔒"}
                {e.regie&&<span style={{...badge("#eef2ff","#4338ca"),fontSize:9.5,padding:"2px 7px",marginLeft:6}}>Regie</span>}</div>
              <div style={{fontSize:12.5,color:"#6b7280",marginTop:2}}>
                {tFmt(e.clockIn)} → {e.clockOut?tFmt(e.clockOut):<span style={{color:"#f59e0b",fontWeight:700}}>Aktiv</span>}
                {Number(e.pause)>0&&<span style={{color:"#9ca3af"}}> · Pause {e.pause} min</span>}</div>
              {st&&<div style={{fontSize:11.5,color:"#4338ca",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🏗 {siteLbl(st)}</div>}
              {e.note&&<div style={{fontSize:11.5,color:"#9ca3af",marginTop:2}}>📝 {e.note}</div>}</div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontWeight:800,fontSize:14.5,color:"#6366f1"}}>{e.clockOut?hStr(netH(e)):"–"}</div>
              <div style={{fontSize:10,color:"#9ca3af"}}>{e.manual?"✏️ Manuell":"⏱ Gestempelt"}</div>
              <div style={{fontSize:10,color:lk?"#94a3b8":"#c4b5fd",marginTop:2}}>{lk?"abgeschlossen":"bearbeiten"}</div></div>
          </div></div>);})}
      {modal&&<Modal title={modal==="edit"?"Eintrag bearbeiten":"Eintrag hinzufügen"} onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        {fLock&&<div style={lockBox}>🔒 {mName(mKey(form.date))} ist abgeschlossen.</div>}
        <label style={lbl}>Datum</label><input type="date" value={form.date} onChange={e=>{F({date:e.target.value});setErr("");}} style={inp}/>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><label style={lbl}>Von</label><input type="time" value={form.ci} onChange={e=>F({ci:e.target.value})} disabled={!!fLock} style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Bis</label><input type="time" value={form.co} onChange={e=>F({co:e.target.value})} disabled={!!fLock} style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Pause</label><input type="number" min="0" step="5" value={form.pause} onChange={e=>F({pause:e.target.value})} disabled={!!fLock} style={inp}/></div></div>
        <label style={lbl}>Baustelle</label>
        <select value={form.siteId} onChange={e=>F({siteId:e.target.value})} disabled={!!fLock} style={inp}>
          <option value="">Ohne Baustelle</option>
          {sites.map(s=><option key={s.id} value={s.id}>{siteLbl(s)}</option>)}</select>
        {isAdmin&&<>
          <Check on={!!form.regie} onClick={()=>!fLock&&F({regie:!form.regie})}
            title={`🔧 Regiearbeit, Tarif ${tarifOf(who)} (${chf(REGIE[tarifOf(who)])} / h)`}
            sub="Wird dem Auftraggeber im Stundenlohn verrechnet, nicht pauschal"/>
          {form.regie&&form.ci&&form.co&&(()=>{
            const [a,b]=[form.ci,form.co].map(t=>{const [h,m]=t.split(":").map(Number);return h*60+m;});
            const net=Math.max(0,(b-a-(Number(form.pause)||0))/60);
            return <div style={{background:"#eef2ff",borderRadius:10,padding:"9px 12px",fontSize:12.5,fontWeight:700,color:"#4338ca",marginBottom:11}}>
              {hStr(net)} × {chf(REGIE[tarifOf(who)])} = {chf(net*REGIE[tarifOf(who)])}</div>;})()}
        </>}
        <label style={lbl}>Notiz / Grund für die Anpassung</label>
        <input placeholder="z.B. Einstempeln vergessen, Rohrleitungen 2. OG" value={form.note} onChange={e=>F({note:e.target.value})} disabled={!!fLock} style={{...inp,marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={saveEntry} disabled={!!fLock} style={{...btn(fLock?"#c7cbd3":"#6366f1"),flex:1}}>Speichern</button>
          {modal==="edit"&&<button onClick={()=>del(edit.id)} disabled={!!fLock} style={btn(fLock?"#c7cbd3":"#ef4444")}>🗑</button>}
        </div></Modal>}
    </div>
  );
}

function Absenzen({user,data,save,isAdmin}){
  const emps=data.employees,staff=emps;
  const [view,setView]=useState("ferien");
  const [modal,setModal]=useState(null);
  const [fu,setFu]=useState("all");
  const [vf,setVf]=useState({s:"",e:"",note:""});
  const [sf,setSf]=useState({date:todayISO(),note:""});
  const [err,setErr]=useState("");
  const yr=new Date().getFullYear();

  const vacs=[...data.vacations].filter(v=>isAdmin?(fu==="all"||v.userId===fu):v.userId===user.id)
    .sort((a,b)=>(a.status==="pending"?0:1)-(b.status==="pending"?0:1)||b.startDate.localeCompare(a.startDate));
  const sicks=[...data.sick].filter(s=>isAdmin?(fu==="all"||s.userId===fu):s.userId===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const used=data.vacations.filter(v=>v.userId===user.id&&v.status==="approved"&&v.startDate.slice(0,4)===String(yr)).reduce((s,v)=>s+workDays(v.startDate,v.endDate),0);
  const an=find(emps,user.id).vacationDays??0;
  const reqDays=workDays(vf.s,vf.e);
  const vLock=lockOf(data,vf.s)||lockOf(data,vf.e);
  const sLock=lockOf(data,sf.date);

  const submitV=()=>{
    setErr("");
    if(vLock){setErr("Der Zeitraum liegt in einem abgeschlossenen Monat.");return;}
    if(!vf.s||!vf.e||vf.e<vf.s){setErr("Bitte gültigen Zeitraum wählen.");return;}
    save({...data,vacations:[...data.vacations,{id:genId(),userId:user.id,startDate:vf.s,endDate:vf.e,note:vf.note,status:"pending",requestedAt:new Date().toISOString()}]});
    setModal(null);setVf({s:"",e:"",note:""});
  };
  const submitS=()=>{
    setErr("");
    if(sLock){setErr(`${mName(mKey(sf.date))} ist abgeschlossen.`);return;}
    if(!sf.date)return;
    save({...data,sick:[...data.sick,{id:genId(),userId:user.id,date:sf.date,note:sf.note}]});
    setModal(null);setSf({date:todayISO(),note:""});
  };
  const setStatus=(v,st)=>{if(lockOf(data,v.startDate))return;save({...data,vacations:data.vacations.map(x=>x.id===v.id?{...x,status:st}:x)});};
  const delV=v=>{if(lockOf(data,v.startDate))return;save({...data,vacations:data.vacations.filter(x=>x.id!==v.id)});};
  const delS=s=>{if(lockOf(data,s.date))return;save({...data,sick:data.sick.filter(x=>x.id!==s.id)});};

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{...row,marginBottom:11}}><span style={h2}>Absenzen</span>
        <button onClick={()=>{setErr("");setModal(view==="ferien"?"vac":"sick");}} style={sbtn("#6366f1")}>
          {view==="ferien"?"+ Ferienantrag":"+ Krankheit"}</button></div>
      <Seg opts={[["ferien","🌴 Ferien"],["krank","🤒 Krankheit"]]} val={view} set={setView}/>
      {isAdmin&&<select value={fu} onChange={e=>setFu(e.target.value)} style={inp}>
        <option value="all">Alle Mitarbeitenden</option>{staff.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}

      {view==="ferien"&&<div style={{...card,display:"flex",justifyContent:"space-around",textAlign:"center"}}>
        {[["Anspruch",an],["Bezogen",used],["Rest",Math.max(0,an-used)]].map(([l,v])=>(
          <div key={l}><div style={{fontSize:11,color:"#6b7280"}}>{l}</div><div style={{fontSize:19,fontWeight:800,color:"#6366f1"}}>{v}</div></div>))}
      </div>}

      {view==="ferien"&&<>
        {vacs.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Noch keine Ferienanträge.</p>}
        {vacs.map(v=>{
          const lk=lockOf(data,v.startDate);
          return(
          <div key={v.id} style={{...card,opacity:lk?.75:1,borderLeft:`4px solid ${lk?"#94a3b8":v.status==="approved"?C.ferien:v.status==="pending"?C.offen:"#d1d5db"}`}}>
            <div style={row}>
              <div style={{minWidth:0}}>
                {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}><Ava emps={emps} id={v.userId} sz={22}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{find(emps,v.userId).name}</span></div>}
                <div style={{fontWeight:700,fontSize:14,color:"#111"}}>🌴 {dFmtS(v.startDate)} bis {dFmtS(v.endDate)}{lk&&" 🔒"}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{workDays(v.startDate,v.endDate)} Arbeitstage{v.note?`, ${v.note}`:""}</div></div>
              <Bdg s={v.status}/></div>
            {!lk&&isAdmin&&v.status==="pending"&&<div style={{display:"flex",gap:8,marginTop:11}}>
              <button onClick={()=>setStatus(v,"approved")} style={{...btn("#10b981"),flex:1,padding:"10px 0",fontSize:13.5}}>✓ Genehmigen</button>
              <button onClick={()=>setStatus(v,"denied")} style={{...btn("#ef4444"),flex:1,padding:"10px 0",fontSize:13.5}}>✕ Ablehnen</button></div>}
            {!lk&&((!isAdmin&&v.status==="pending")||isAdmin)&&
              <button onClick={()=>delV(v)} style={{...sbtn("#f3f4f6","#374151"),marginTop:9}}>Entfernen</button>}
          </div>);})}
      </>}

      {view==="krank"&&<>
        {sicks.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Keine Krankheitstage erfasst.</p>}
        {sicks.map(s=>{
          const lk=lockOf(data,s.date);
          return(
          <div key={s.id} style={{...card,opacity:lk?.75:1,borderLeft:`4px solid ${lk?"#94a3b8":C.krank}`}}>
            <div style={row}>
              <div>
                {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}><Ava emps={emps} id={s.userId} sz={22}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{find(emps,s.userId).name}</span></div>}
                <div style={{fontWeight:700,fontSize:14,color:"#111"}}>🤒 {dFmt(s.date)}{lk&&" 🔒"}</div>
                {s.note&&<div style={{fontSize:12,color:"#6b7280",marginTop:2}}>{s.note}</div>}</div>
              {lk?<span style={badge("#f1f5f9","#475569")}>Gesperrt</span>:
                <button onClick={()=>delS(s)} style={sbtn("#fee2e2","#991b1b")}>Löschen</button>}</div>
          </div>);})}
      </>}

      {modal==="vac"&&<Modal title="Ferienantrag" onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <label style={lbl}>Startdatum</label><input type="date" value={vf.s} onChange={e=>{setVf({...vf,s:e.target.value});setErr("");}} style={inp}/>
        <label style={lbl}>Enddatum</label><input type="date" value={vf.e} onChange={e=>{setVf({...vf,e:e.target.value});setErr("");}} style={inp} min={vf.s}/>
        {vLock&&<div style={lockBox}>🔒 Dieser Zeitraum liegt in einem abgeschlossenen Monat.</div>}
        {vf.s&&vf.e&&!vLock&&<div style={{background:"#eef2ff",borderRadius:10,padding:"10px 12px",marginBottom:11}}>
          <div style={{fontSize:13.5,fontWeight:700,color:"#4338ca"}}>{reqDays} Arbeitstage</div>
          <div style={{fontSize:11.5,color:"#6366f1"}}>Rest danach: {an-used-reqDays} Tage</div></div>}
        <label style={lbl}>Notiz (optional)</label>
        <input placeholder="z.B. Familienreise" value={vf.note} onChange={e=>setVf({...vf,note:e.target.value})} style={{...inp,marginBottom:14}}/>
        <button onClick={submitV} disabled={!!vLock} style={{...btn(vLock?"#c7cbd3":"#6366f1"),width:"100%"}}>Antrag senden</button></Modal>}
      {modal==="sick"&&<Modal title="Krankheitstag erfassen" onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <label style={lbl}>Datum</label><input type="date" value={sf.date} onChange={e=>{setSf({...sf,date:e.target.value});setErr("");}} style={inp}/>
        {sLock&&<div style={lockBox}>🔒 {mName(mKey(sf.date))} ist abgeschlossen.</div>}
        <label style={lbl}>Notiz (optional)</label>
        <input placeholder="z.B. Grippe, Arztbesuch" value={sf.note} onChange={e=>setSf({...sf,note:e.target.value})} style={{...inp,marginBottom:14}}/>
        <button onClick={submitS} disabled={!!sLock} style={{...btn(sLock?"#c7cbd3":"#6366f1"),width:"100%"}}>Erfassen</button></Modal>}
    </div>
  );
}

function ExportView({title,sheets,onClose,holSrc}){
  const [msg,setMsg]=useState("");const [err,setErr]=useState("");const [raw,setRaw]=useState("");
  const tsv=sheets.map(s=>[s.name,...s.rows.map(r=>r.map(deNum).join("\t"))].join("\n")).join("\n\n");

  const copy=async()=>{
    setErr("");setRaw("");
    try{await navigator.clipboard.writeText(tsv);setMsg("In die Zwischenablage kopiert. In Excel einfügen.");}
    catch{
      try{
        const ta=document.createElement("textarea");
        ta.value=tsv;ta.style.position="fixed";ta.style.opacity="0";
        document.body.appendChild(ta);ta.select();
        const ok=document.execCommand("copy");document.body.removeChild(ta);
        if(ok)setMsg("In die Zwischenablage kopiert.");else throw new Error();
      }catch{setErr("Kopieren blockiert. Text unten markieren und manuell kopieren.");setRaw(tsv);}
    }
    setTimeout(()=>setMsg(""),5000);
  };
  const download=async()=>{
    setErr("");setMsg("");
    try{
      const XLSX=await import("xlsx");
      const wb=XLSX.utils.book_new();
      sheets.forEach(s=>{
        const ws=XLSX.utils.aoa_to_sheet([["IsoTeam Zeiterfassung"],[title],[`Erstellt am ${dFmt(todayISO())}`],[],...s.rows]);
        ws["!cols"]=s.rows[0].map(()=>({wch:18}));
        XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,28));
      });
      XLSX.writeFile(wb,`isoteam_${title.replace(/[^a-z0-9]+/gi,"_").toLowerCase()}.xlsx`);
      setMsg("Excel-Datei erstellt.");
    }catch{
      try{
        const csv="\uFEFF"+sheets.map(s=>[s.name,...s.rows.map(r=>r.map(c=>`"${String(deNum(c)).replace(/"/g,'""')}"`).join(";"))].join("\r\n")).join("\r\n\r\n");
        const a=document.createElement("a");
        a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
        a.download=`isoteam_${title.replace(/[^a-z0-9]+/gi,"_").toLowerCase()}.csv`;
        document.body.appendChild(a);a.click();a.remove();
        setMsg("CSV-Datei erstellt.");
      }catch{setErr("Download blockiert. Nutze «Für Excel kopieren».");}
    }
    setTimeout(()=>setMsg(""),6000);
  };
  const print=()=>{
    setErr("");setMsg("");
    const tbl=rows=>`<table><thead><tr>${rows[0].map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${
      rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c===""||c==null?"–":deNum(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const co=COMPANY||{};
    const addr=[co.name||"IsoTeam Suljejmani GmbH",[co.street||"Gerliswilstrasse 68",`${co.zip||"6020"} ${co.city||"Emmenbrücke"}`].join(" · "),
      co.vat?`MwSt. ${co.vat}`:""].filter(Boolean).join(" · ");
    const html=`<div class="doc">
      ${LOGO_SRC?`<img class="logoimg" src="${LOGO_SRC}"/>`:`<div class="logo">${LOGO_SVG}</div>`}
      <div class="hd"><div><h1>${title}</h1><div class="sub">${addr}</div></div>
      <div class="meta">Erstellt am ${dFmt(todayISO())}</div></div>
      ${sheets.map(s=>`<h2>${s.name}</h2>${tbl(s.rows)}`).join("")}
      <div class="ft">Feiertage Kanton Luzern, Quelle: ${holSrc}</div></div>`;
    const el=document.getElementById("printArea");
    if(!el){setErr("Druckbereich nicht gefunden.");return;}
    el.innerHTML=html;
    try{window.print();setMsg("Im Druckdialog «Als PDF speichern» wählen.");}
    catch{setErr("Druckdialog blockiert.");}
    setTimeout(()=>{el.innerHTML="";},600);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:900,background:"#f7f8fa",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#6366f1",color:"#fff",padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontWeight:800,fontSize:15}}>Export</div><div style={{fontSize:11,opacity:.85}}>{title}</div></div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.22)",border:"none",color:"#fff",borderRadius:9,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Schliessen</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:14}}>
        {msg&&<div style={okBox}>✓ {msg}</div>}
        {err&&<div style={errBox}>{err}</div>}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={copy} style={{...btn("#107c41"),flex:1,fontSize:13}}>📋 Für Excel</button>
          <button onClick={download} style={{...btn("#6366f1"),flex:1,fontSize:13}}>⬇️ Datei</button>
          <button onClick={print} style={{...btn("#b91c1c"),flex:1,fontSize:13}}>📄 PDF</button>
        </div>
        {raw&&<textarea readOnly value={raw} onFocus={e=>e.target.select()}
          style={{width:"100%",height:150,fontSize:11,fontFamily:"monospace",borderRadius:10,border:"1.5px solid #e5e7eb",padding:10,marginBottom:14,boxSizing:"border-box"}}/>}
        {sheets.map(s=>(
          <div key={s.name} style={{marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:8}}>{s.name}</div>
            <div style={{overflowX:"auto",background:"#fff",borderRadius:12,padding:2}}>
              <table style={{borderCollapse:"collapse",fontSize:11.5,width:"100%"}}>
                <thead><tr>{s.rows[0].map((c,i)=><th key={i} style={{background:"#eef2ff",color:"#3730a3",textAlign:"left",padding:"7px 8px",whiteSpace:"nowrap",fontWeight:700}}>{c}</th>)}</tr></thead>
                <tbody>{s.rows.slice(1).map((r,i)=>(
                  <tr key={i} style={{background:i%2?"#fafafa":"#fff"}}>
                    {r.map((c,j)=><td key={j} style={{padding:"6px 8px",whiteSpace:"nowrap",borderTop:"1px solid #f0f1f3",color:"#374151"}}>{c===""||c==null?"–":deNum(c)}</td>)}</tr>))}
                </tbody></table></div>
            {s.rows.length===1&&<div style={{fontSize:12,color:"#9ca3af",padding:"8px 2px"}}>Keine Daten in diesem Zeitraum.</div>}
          </div>))}
      </div>
    </div>
  );
}

function Material({user,data,save,isAdmin}){
  const mats=data.materials||[],sm=data.siteMat||[],cats=data.categories||[];
  const openSites=(data.sites||[]).filter(canMat);
  const [view,setView]=useState("erfassen");
  const [siteId,setSiteId]=useState("");
  const [q,setQ]=useState("");
  const [catF,setCatF]=useState("");
  const [modal,setModal]=useState(null);
  const [qty,setQty]=useState("1");
  const [mf,setMf]=useState({id:"",sku:"",group:"",name:"",unit:"m2",price:0,stock:0,minStock:0});
  const [cf,setCf]=useState("");
  const [selIds,setSelIds]=useState([]);
  const [selMode,setSelMode]=useState(false);
  const [moveTo,setMoveTo]=useState("");
  const toggleSel=id=>setSelIds(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const bulkMove=()=>{
    if(!selIds.length)return;
    save({...data,materials:mats.map(m=>selIds.includes(m.id)?{...m,group:moveTo||"Ohne Kategorie"}:m)});
    setMsg(`${selIds.length} Artikel verschoben`);setSelIds([]);setSelMode(false);
    setTimeout(()=>setMsg(""),4000);
  };
  const bulkDelete=()=>{
    if(!selIds.length)return;
    save({...data,materials:mats.filter(m=>!selIds.includes(m.id))});
    setMsg(`${selIds.length} Artikel gelöscht`);setSelIds([]);setSelMode(false);
    setTimeout(()=>setMsg(""),4000);
  };
  const [imp,setImp]=useState("");
  const [impRows,setImpRows]=useState([]);
  const [impName,setImpName]=useState("");
  const [msg,setMsg]=useState("");const [err,setErr]=useState("");

  const matOf=id=>mats.find(m=>m.id===id)||{name:"?",price:0,unit:""};
  const lineOf=b=>b.materialId?matOf(b.materialId):{name:b.label||"Position",price:Number(b.price)||0,unit:b.unit||"Stk"};
  const [vL,setVL]=useState(0);const [vT,setVT]=useState(2);const [vD,setVD]=useState(3);
  const [vQ,setVQ]=useState({});const [vRab,setVRab]=useState(50);
  const catNames=[...new Set([...cats.map(c=>c.name),...mats.map(m=>m.group)])].filter(Boolean);
  const filt=mats.filter(m=>(!catF||m.group===catF)&&
    (!q||`${m.sku||""} ${m.group} ${m.name}`.toLowerCase().includes(q.toLowerCase())));
  const groups=[...new Set(filt.map(m=>m.group))];
  const booked=sm.filter(x=>x.siteId===siteId).sort((a,b)=>b.date.localeCompare(a.date));
  const surchLines=(()=>{
    const per={};
    booked.filter(b=>b.materialId).forEach(b=>{per[b.materialId]=(per[b.materialId]||0)+(Number(b.qty)||0);});
    return Object.entries(per).map(([id,q])=>{
      const m=matOf(id),s=surchargeOf(m,q);
      return s?{id,name:m.name,unit:m.unit,q,s,amount:q*s,left:(Number(m.sqt)||0)-q}:null;
    }).filter(Boolean);
  })();
  // Offertphase gegen Verbrauch: alles über der Offertmenge ist Nachtrag
  const offerB=booked.filter(b=>b.phase==="OFFER");
  const useB=booked.filter(b=>b.phase!=="OFFER"&&b.phase!=="RETURN");
  const retB=booked.filter(b=>b.phase==="RETURN");
  const sumB=arr=>arr.reduce((a,x)=>a+x.qty*lineOf(x).price,0);
  // Rückzug wird nur abgezogen, wenn er ausdrücklich nicht verrechnet wird
  const retCredit=sumB(retB.filter(b=>b.credit));
  const retQty=(()=>{const o={};retB.forEach(b=>{if(b.materialId)o[b.materialId]=(o[b.materialId]||0)+(Number(b.qty)||0);});return o;})();
  const nachtrag=(()=>{
    const o={},u={};
    offerB.filter(b=>b.materialId).forEach(b=>{o[b.materialId]=(o[b.materialId]||0)+(Number(b.qty)||0);});
    useB.filter(b=>b.materialId).forEach(b=>{u[b.materialId]=(u[b.materialId]||0)+(Number(b.qty)||0);});
    return Object.entries(u).map(([id,q0])=>{
      const q=q0-(retQty[id]||0),off=o[id]||0,diff=q-off,m=matOf(id);
      return diff>0.0001?{id,name:m.name,unit:m.unit,off,used:q,diff,amount:diff*m.price,neu:off===0}:null;
    }).filter(Boolean);
  })();
  const nachtragSum=nachtrag.reduce((a,x)=>a+x.amount,0);
  const surchTotal=surchLines.reduce((a,x)=>a+x.amount,0);
  const bookedSum=sumB(useB.length?useB:offerB)+surchTotal-retCredit;
  const low=mats.filter(m=>Number(m.minStock)>0&&Number(m.stock)<=Number(m.minStock));

  const addMat=()=>{
    const m=modal.m,n=parseFloat(String(qty).replace(",","."));
    if(!n||n<=0){setErr("Menge fehlt.");return;}
    if(lockOf(data,todayISO())){setErr("Der laufende Monat ist abgeschlossen.");return;}
    save({...data,siteMat:[...sm,{id:genId(),siteId,materialId:m.id,qty:n,date:todayISO(),userId:user.id,
      phase:stOf(siteOf(data,siteId))==="OFFERTE"?"OFFER":"USE"}],
      materials:mats.map(x=>x.id===m.id?{...x,stock:Math.max(0,(Number(x.stock)||0)-n)}:x)});
    setModal(null);setMsg(`${n} ${m.unit} ${m.name} gebucht`);setTimeout(()=>setMsg(""),3500);
  };
  const delBooking=b=>save({...data,siteMat:sm.filter(x=>x.id!==b.id),
    materials:mats.map(x=>x.id===b.materialId?{...x,stock:(Number(x.stock)||0)+(b.phase==="RETURN"?-b.qty:b.qty)}:x)});
  // Rückzug: Material geht ins Lager zurück, verrechnet wird es trotzdem,
  // ausser jemand entscheidet ausdrücklich anders.
  const doReturn=(map,credit)=>{
    const rows=Object.entries(map).filter(([,q])=>Number(q)>0);
    if(!rows.length){setErr("Keine Mengen erfasst.");return;}
    const site=siteOf(data,siteId);
    save({...data,
      siteMat:[...sm,...rows.map(([id,q])=>({id:genId(),siteId,materialId:id,qty:Number(q),
        date:todayISO(),userId:user.id,phase:"RETURN",credit:!!credit,
        note:`Rückzug aus ${siteLbl(site)}`}))],
      materials:mats.map(m=>{const r=rows.find(([id])=>id===m.id);
        return r?{...m,stock:(Number(m.stock)||0)+Number(r[1])}:m;})});
    setModal(null);
    setMsg(`${rows.length} Positionen ins Lager zurückgebucht${credit?", nicht verrechnet":""}`);
    setTimeout(()=>setMsg(""),5000);
  };
  const saveMat=()=>{
    if(!mf.name.trim()){setErr("Bezeichnung fehlt.");return;}
    const rec={sku:(mf.sku||"").trim(),group:(mf.group||"").trim()||"Ohne Kategorie",name:mf.name.trim(),
      unit:mf.unit||"m2",price:numOf(mf.price)||0,stock:numOf(mf.stock)||0,minStock:numOf(mf.minStock)||0,
      fire:mf.fire||"",sqt:numOf(mf.sqt)||0,sqs:numOf(mf.sqs)||0};
    if(mf.id)save({...data,materials:mats.map(m=>m.id===mf.id?{...m,...rec}:m)});
    else save({...data,materials:[...mats,{id:genId(),...rec}]});
    setModal(null);
  };
  const delMat=id=>{save({...data,materials:mats.filter(m=>m.id!==id)});setModal(null);};
  const adjust=(m,d)=>save({...data,materials:mats.map(x=>x.id===m.id?{...x,stock:Math.max(0,(Number(x.stock)||0)+d)}:x)});

  const addCat=()=>{
    const n=cf.trim();
    if(!n)return;
    if(catNames.some(c=>c.toLowerCase()===n.toLowerCase())){setErr("Kategorie existiert bereits.");return;}
    save({...data,categories:[...cats,{id:genId(),name:n}]});setCf("");setErr("");
  };
  const renameCat=(old,neu)=>{
    const n=(neu||"").trim();if(!n||n===old)return;
    save({...data,categories:cats.map(c=>c.name===old?{...c,name:n}:c),
      materials:mats.map(m=>m.group===old?{...m,group:n}:m)});
  };
  const delCat=c=>{
    const used=mats.filter(m=>m.group===c.name).length;
    save({...data,categories:cats.filter(x=>x.id!==c.id),
      materials:used?mats.map(m=>m.group===c.name?{...m,group:"Ohne Kategorie"}:m):mats});
  };

  const matchIdx=r=>{
    const bySku=r.sku?mats.findIndex(m=>(m.sku||"").toLowerCase()===r.sku.toLowerCase()&&m.sku):-1;
    if(bySku>=0)return bySku;
    const byBoth=mats.findIndex(m=>m.name.trim().toLowerCase()===r.name.trim().toLowerCase()
      &&m.group.trim().toLowerCase()===r.group.trim().toLowerCase());
    if(byBoth>=0)return byBoth;
    return mats.findIndex(m=>m.name.trim().toLowerCase()===r.name.trim().toLowerCase());
  };
  const loadFile=async e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    setErr("");setImpName(f.name);
    try{
      if(/\.(csv|txt)$/i.test(f.name)){
        const t=await f.text();setImp(t);setImpRows(rowsToItems(textToMatrix(t)));
      }else{
        const XLSX=await import("xlsx");
        const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        setImpRows(rowsToItems(XLSX.utils.sheet_to_json(ws,{header:1,defval:""})));
      }
    }catch(ex){setErr("Datei konnte nicht gelesen werden: "+ex.message);setImpRows([]);}
  };
  const runImport=()=>{
    setErr("");
    if(!impRows.length){setErr("Keine gültigen Zeilen erkannt.");return;}
    const next=[...mats];let neu=0,upd=0;
    const newCats=new Set();
    impRows.forEach(r=>{
      const i=matchIdx(r);
      const base={sku:r.sku||undefined,group:r.group,name:r.name,unit:r.unit,price:r.price};
      if(!catNames.some(c=>c.toLowerCase()===r.group.toLowerCase()))newCats.add(r.group);
      if(i>=0){
        next[i]={...next[i],...base,sku:r.sku||next[i].sku,
          stock:r.stock!==null&&r.stock!==undefined?r.stock:next[i].stock,
          minStock:r.minStock!==null&&r.minStock!==undefined?r.minStock:next[i].minStock};upd++;
      }else{next.push({id:genId(),...base,sku:r.sku||"",stock:r.stock||0,minStock:r.minStock||0});neu++;}
    });
    save({...data,materials:next,
      categories:[...cats,...[...newCats].map(n=>({id:genId(),name:n}))]});
    setModal(null);setImp("");setImpRows([]);setImpName("");
    setMsg(`Import: ${neu} neu, ${upd} aktualisiert, keine Duplikate`);setTimeout(()=>setMsg(""),6000);
  };
  const tmpl="Artikelnummer;Kategorie;Artikel;Einheit;Preis;Lager;Mindestbestand\nAF-13;Synthetischer Kautschuk;Armaflex XG 13mm;m2;42.00;60;20";

  const catChips=()=>(
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:8}}>
      <button onClick={()=>setCatF("")} style={{flexShrink:0,border:"none",cursor:"pointer",borderRadius:20,padding:"8px 13px",fontSize:12,fontWeight:700,
        background:!catF?"#6366f1":"#fff",color:!catF?"#fff":"#6b7280",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>Alle ({mats.length})</button>
      {catNames.map(c=>(
        <button key={c} onClick={()=>setCatF(c)} style={{flexShrink:0,border:"none",cursor:"pointer",borderRadius:20,padding:"8px 13px",fontSize:12,fontWeight:700,
          background:catF===c?"#6366f1":"#fff",color:catF===c?"#fff":"#6b7280",boxShadow:"0 1px 3px rgba(0,0,0,.07)",whiteSpace:"nowrap"}}>
          {c} ({mats.filter(m=>m.group===c).length})</button>))}
    </div>);

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{...row,marginBottom:11}}><span style={h2}>Material</span>
        {low.length>0&&<span style={badge("#fef3c7","#92400e")}>⚠️ {low.length} tief</span>}</div>
      <Seg opts={[["erfassen","Material"],["vsi","VSI"],["lager","Lager"],...(isAdmin?[["katalog","Katalog"]]:[])]} val={view} set={setView}/>
      {msg&&<div style={okBox}>✓ {msg}</div>}
      {err&&!modal&&<div style={errBox}>{err}</div>}

      {view==="erfassen"&&<>
        <label style={lbl}>Baustelle</label>
        <select value={siteId} onChange={e=>{setSiteId(e.target.value);setErr("");}} style={inp}>
          <option value="">Bitte wählen</option>
          {openSites.map(s=><option key={s.id} value={s.id}>{siteLbl(s)}</option>)}</select>
        {!siteId&&<div style={{...card,fontSize:12.5,color:"#9ca3af"}}>Zuerst eine Baustelle wählen, dann Material buchen.</div>}
        {siteId&&<>
          <div style={card}>
            <div style={row}>
              <div><div style={{fontSize:11.5,color:"#6b7280"}}>Material auf dieser Baustelle</div>
                <div style={{fontSize:11,color:"#9ca3af"}}>{booked.length} Buchungen</div></div>
              <span style={{fontSize:17,fontWeight:800,color:"#4338ca"}}>{chf(bookedSum)}</span></div>
            {surchLines.length>0&&<div style={{marginTop:10,paddingTop:9,borderTop:"1px solid #f3f4f6"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#b45309",letterSpacing:.3,marginBottom:5}}>
                KLEINMENGENZUSCHLÄGE {chf(surchTotal)}</div>
              {surchLines.map(x=>(
                <div key={x.id} style={{...row,padding:"3px 0"}}>
                  <span style={{fontSize:11.5,color:"#92400e",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {x.name}, {x.q} {x.unit} statt {x.q+Math.max(0,x.left)}</span>
                  <span style={{fontSize:11.5,color:"#92400e",fontWeight:700,flexShrink:0,marginLeft:8}}>{chf(x.amount)}</span>
                </div>))}
              <div style={{fontSize:10.5,color:"#b45309",marginTop:5,lineHeight:1.5}}>
                Entfällt automatisch, sobald die Mindestmenge erreicht ist.</div>
            </div>}
          </div>
          {useB.length>0&&<button onClick={()=>{setErr("");setModal({t:"ret",qty:{},credit:false});}}
            style={{...sbtn("#f3f4f6","#374151"),width:"100%",marginBottom:11}}>
            ↩︎ Material Rückzug ins Lager</button>}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Material suchen" style={inp}/>
          {catChips()}
          {groups.map(g=>(
            <div key={g} style={card}>
              <div style={{fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:.4,marginBottom:7}}>{g.toUpperCase()}</div>
              {filt.filter(m=>m.group===g).map(m=>(
                <div key={m.id} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:600}}>{m.name}</div>
                    <div style={{fontSize:11.5,color:"#6b7280"}}>{chf(m.price)} / {m.unit} · Lager {m.stock} {m.unit}</div></div>
                  <button onClick={()=>{setQty("1");setErr("");setModal({t:"add",m});}} style={sbtn("#6366f1")}>+</button>
                </div>))}
            </div>))}
          {booked.length>0&&(()=>{
            const zeile=b=>{const m=lineOf(b);return(
              <div key={b.id} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:600}}>{b.qty} {m.unit} {m.name}</div>
                  <div style={{fontSize:11,color:"#9ca3af"}}>{dFmt(b.date)} · {find(data.employees,b.userId).name}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#4338ca"}}>{chf(b.qty*m.price)}</span>
                  {(isAdmin||b.userId===user.id)&&<button onClick={()=>delBooking(b)} style={sbtn("#fee2e2","#991b1b")}>✕</button>}</div>
              </div>);};
            return(<>
              {offerB.length>0&&<>
                <div style={{...sect,...row}}><span>📄 OFFERTPOSITIONEN</span>
                  <span style={{color:"#4338ca"}}>{chf(sumB(offerB))}</span></div>
                <div style={card}>{offerB.map(zeile)}</div></>}

              {useB.length>0&&<>
                <div style={{...sect,...row}}><span>🏗 VERBRAUCH</span>
                  <span style={{color:"#4338ca"}}>{chf(sumB(useB))}</span></div>
                <div style={card}>{useB.map(zeile)}</div></>}

              {nachtrag.length>0&&offerB.length>0&&<>
                <div style={{...sect,...row}}><span style={{color:"#b45309"}}>⚠️ NACHTRAG</span>
                  <span style={{color:"#b45309"}}>{chf(nachtragSum)}</span></div>
                <div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",marginBottom:16}}>
                  <div style={{fontSize:11.5,color:"#92400e",marginBottom:9,lineHeight:1.55}}>
                    Mehr verbraucht als offeriert. Diese Mengen sind im Offertpreis nicht enthalten
                    und müssen vor der Rechnung geklärt werden.</div>
                  {nachtrag.map(x=>(
                    <div key={x.id} style={{...row,padding:"7px 0",borderTop:"1px solid #fde68a"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#92400e"}}>{x.name}</div>
                        <div style={{fontSize:11,color:"#b45309"}}>
                          {x.neu?`nicht offeriert, ${x.used} ${x.unit} verbraucht`
                            :`offeriert ${x.off} ${x.unit}, verbraucht ${x.used} ${x.unit}, Differenz ${x.diff.toFixed(1).replace(".",",")} ${x.unit}`}</div></div>
                      <span style={{fontSize:13.5,fontWeight:800,color:"#b45309",flexShrink:0,marginLeft:8}}>+{chf(x.amount)}</span>
                    </div>))}
                </div></>}

              {retB.length>0&&<>
                <div style={{...sect,...row}}><span>↩︎ RÜCKZUG INS LAGER</span>
                  <span style={{color:"#64748b"}}>{retCredit?`− ${chf(retCredit)}`:"verrechnet"}</span></div>
                <div style={{...card,marginBottom:16}}>
                  {retB.map(b=>{const m=lineOf(b);return(
                    <div key={b.id} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:600}}>{b.qty} {m.unit} {m.name}</div>
                        <div style={{fontSize:11,color:"#9ca3af"}}>{dFmt(b.date)} · {find(data.employees,b.userId).name}</div></div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        <span style={{...badge(b.credit?"#fee2e2":"#f1f5f9",b.credit?"#991b1b":"#475569"),fontSize:10}}>
                          {b.credit?"Gutschrift":"verrechnet"}</span>
                        {isAdmin&&<button onClick={()=>delBooking(b)} style={sbtn("#fee2e2","#991b1b")}>✕</button>}</div>
                    </div>);})}
                  <div style={{fontSize:11,color:"#9ca3af",marginTop:8,lineHeight:1.55}}>
                    Zurückgezogenes Material liegt wieder im Lager. Gegenüber dem Auftraggeber
                    wird es wie offeriert verrechnet, ausser es ist als Gutschrift markiert.</div>
                </div></>}

              {offerB.length===0&&<div style={{fontSize:11,color:"#9ca3af",padding:"0 3px 16px",lineHeight:1.55}}>
                Für diese Baustelle gibt es keine Offertpositionen. Ein Nachtrag lässt sich deshalb
                nicht berechnen. Material, das in der Offertphase erfasst wird, gilt automatisch als Offertposition.</div>}
            </>);})()}
        </>}
      </>}

      {modal?.t==="ret"&&(()=>{
        const per={};
        useB.filter(b=>b.materialId).forEach(b=>{per[b.materialId]=(per[b.materialId]||0)+(Number(b.qty)||0);});
        const rows=Object.entries(per).map(([id,q])=>({m:matOf(id),id,offen:q-(retQty[id]||0)})).filter(r=>r.offen>0.0001);
        const wert=rows.reduce((a,r)=>a+(Number(modal.qty[r.id])||0)*r.m.price,0);
        return(
        <Modal title="Material Rückzug" onClose={()=>setModal(null)}>
          {err&&<div style={errBox}>{err}</div>}
          <div style={{fontSize:12.5,color:"#6b7280",marginBottom:12,lineHeight:1.55}}>
            Was von der Baustelle übrig bleibt, geht zurück ins Lager. Gegenüber dem Auftraggeber
            bleibt die Verrechnung wie offeriert, ausser du entscheidest unten anders.</div>
          {rows.length===0&&<div style={lockBox}>Es ist nichts mehr da, was zurückgezogen werden könnte.</div>}
          {rows.map(r=>(
            <div key={r.id} style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6",gap:10}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{r.m.name}</div>
                <div style={{fontSize:11,color:"#9ca3af"}}>auf der Baustelle: {deNum(num(r.offen))} {r.m.unit}</div></div>
              <input inputMode="decimal" value={modal.qty[r.id]??""} placeholder="0"
                onChange={e=>{const v=e.target.value.replace(",",".");
                  setModal({...modal,qty:{...modal.qty,[r.id]:Math.min(Number(v)||0,r.offen)||v}});}}
                style={{width:64,textAlign:"center",fontSize:15,fontWeight:700,border:"1.5px solid #e5e7eb",
                  borderRadius:9,padding:"8px 4px",minHeight:38,boxSizing:"border-box",flexShrink:0}}/>
            </div>))}
          {rows.length>0&&<>
            <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",margin:"12px 0",fontSize:13,fontWeight:700,color:"#374151"}}>
              Warenwert {chf(wert)}</div>
            <Check on={!!modal.credit} onClick={()=>setModal({...modal,credit:!modal.credit})}
              title="Dem Auftraggeber gutschreiben"
              sub="Standard ist ohne Gutschrift: das Material wurde offeriert und wird verrechnet"/>
            {modal.credit&&<div style={{...errBox,background:"#fffbeb",border:"1px solid #fde68a",color:"#92400e"}}>
              Die Rechnung wird um {chf(wert)} reduziert. Die Entscheidung wird mit deinem Namen festgehalten.</div>}
            <button onClick={()=>doReturn(modal.qty,modal.credit)} style={{...btn("#6366f1"),width:"100%"}}>
              Ins Lager zurückbuchen</button></>}
        </Modal>);})()}

      {view==="vsi"&&(()=>{
        const L=VSI[vL],th=L.th[vT];
        const rows=L.pos.map((p,pi)=>({pi,name:p[0],unit:p[1],price:vsiPrice(L,vT,pi,vD)}));
        const rab=Math.min(100,Math.max(0,Number(vRab)||0));
        const brutto=rows.reduce((a,r)=>a+(Number(vQ[r.pi])||0)*(r.price||0),0);
        const netto=brutto*(1-rab/100);
        const vBooked=sm.filter(x=>x.siteId===siteId&&!x.materialId).sort((a,b)=>b.date.localeCompare(a.date));
        const vSum=vBooked.reduce((a,x)=>a+x.qty*(Number(x.price)||0),0);
        const bookVsi=()=>{
          setErr("");
          if(!siteId){setErr("Zuerst eine Baustelle wählen.");return;}
          if(lockOf(data,todayISO())){setErr("Der laufende Monat ist abgeschlossen.");return;}
          const items=rows.filter(r=>Number(vQ[r.pi])>0&&r.price);
          if(!items.length){setErr("Keine Mengen erfasst.");return;}
          save({...data,siteMat:[...sm,...items.map(r=>({id:genId(),siteId,materialId:"",
            label:`${L.short} ${th.d}mm DN${DN[vD]} · ${r.name}${rab?` (−${rab}%)`:""}`,
            unit:r.unit,price:Number((r.price*(1-rab/100)).toFixed(2)),
            qty:Number(vQ[r.pi]),date:todayISO(),userId:user.id}))]});
          setVQ({});setMsg(`${items.length} VSI-Positionen gebucht, ${chf(netto)}`);setTimeout(()=>setMsg(""),4500);
        };
        return(<>
          <label style={lbl}>Baustelle</label>
          <select value={siteId} onChange={e=>{setSiteId(e.target.value);setErr("");}} style={inp}>
            <option value="">Bitte wählen</option>
            {openSites.map(s=><option key={s.id} value={s.id}>{siteLbl(s)}</option>)}</select>

          <label style={lbl}>Tarifliste</label>
          <div style={{display:"flex",gap:7,marginBottom:11}}>
            {VSI.map((l,i)=>(
              <button key={l.id} onClick={()=>{setVL(i);setVT(0);setVQ({});setVRab(l.rabatt);}}
                style={{flex:1,border:vL===i?"1.5px solid #6366f1":"1.5px solid #e5e7eb",background:vL===i?"#eef2ff":"#fff",
                  color:vL===i?"#4338ca":"#6b7280",borderRadius:10,padding:"10px 6px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:42}}>
                {l.short}</button>))}
          </div>
          <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.5,marginBottom:11}}>{L.desc}</div>

          <label style={lbl}>Isolierdicke</label>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:9}}>
            {L.th.map((t,i)=>(
              <button key={t.d} onClick={()=>{setVT(i);setVQ({});}} style={{flexShrink:0,border:"none",cursor:"pointer",borderRadius:20,
                padding:"9px 15px",fontSize:12.5,fontWeight:700,background:vT===i?"#6366f1":"#fff",color:vT===i?"#fff":"#6b7280",
                boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>{t.d} mm</button>))}
          </div>

          <label style={lbl}>Nennweite</label>
          <select value={vD} onChange={e=>{setVD(Number(e.target.value));setVQ({});}} style={inp}>
            {DN.map((d,i)=><option key={d} value={i}>DN {d} · {ZOLL[i]}" · Ø {ODIA[i]} mm</option>)}</select>

          {!vsiPrice(L,vT,0,vD)&&<div style={lockBox}>
            Für DN {DN[vD]} ist die Isolierdicke {th.d} mm in dieser Liste nicht vorgesehen.</div>}

          <div style={card}>
            <div style={{...row,marginBottom:9}}>
              <span style={{fontWeight:800,fontSize:14}}>{L.short} {th.d} mm · DN {DN[vD]}</span>
              <span style={{...badge("#eef2ff","#4338ca"),fontSize:11}}>Ø {ODIA[vD]} mm</span></div>
            {rows.map(r=>(
              <div key={r.pi} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6",opacity:r.price?1:.4}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13.5,fontWeight:600}}>{r.name}</div>
                  <div style={{fontSize:11.5,color:"#6b7280"}}>{r.price?`${chf(r.price)} / ${r.unit}`:"nicht verfügbar"}</div></div>
                {r.price&&<div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>setVQ({...vQ,[r.pi]:Math.max(0,(Number(vQ[r.pi])||0)-1)})} style={sbtn("#f3f4f6","#374151")}>−</button>
                  <input inputMode="decimal" value={vQ[r.pi]??""} placeholder="0"
                    onChange={e=>setVQ({...vQ,[r.pi]:e.target.value.replace(",",".")})}
                    style={{width:56,textAlign:"center",fontSize:15,fontWeight:700,border:"1.5px solid #e5e7eb",borderRadius:9,padding:"8px 4px",minHeight:38,boxSizing:"border-box"}}/>
                  <button onClick={()=>setVQ({...vQ,[r.pi]:(Number(vQ[r.pi])||0)+1})} style={sbtn("#eef2ff","#4338ca")}>+</button>
                </div>}
              </div>))}
            <div style={{display:"flex",alignItems:"center",gap:9,marginTop:11}}>
              <span style={{fontSize:12.5,color:"#6b7280",fontWeight:600}}>Objektrabatt</span>
              <input type="number" min="0" max="100" value={vRab} onChange={e=>setVRab(e.target.value)}
                style={{width:70,textAlign:"center",fontSize:14,fontWeight:700,border:"1.5px solid #e5e7eb",borderRadius:9,padding:"8px 4px",minHeight:38,boxSizing:"border-box"}}/>
              <span style={{fontSize:12.5,color:"#6b7280",fontWeight:600}}>%</span></div>
            <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",marginTop:11}}>
              <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Brutto</span><span>{chf(brutto)}</span></div>
              <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Rabatt {rab}%</span><span>− {chf(brutto-netto)}</span></div>
              <div style={{...row,fontSize:15,fontWeight:800,color:"#4338ca",marginTop:5}}><span>Netto</span><span>{chf(netto)}</span></div></div>
            <button onClick={bookVsi} disabled={!brutto} style={{...btn(brutto?"#6366f1":"#c7cbd3"),width:"100%",marginTop:11}}>
              Auf Baustelle buchen</button>
          </div>

          {siteId&&vBooked.length>0&&<>
            <div style={{...sect,...row}}><span>VSI AUF DIESER BAUSTELLE</span><span style={{color:"#4338ca"}}>{chf(vSum)}</span></div>
            <div style={{...card,marginBottom:16}}>
              {vBooked.map(b=>(
                <div key={b.id} style={{...row,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600}}>{b.qty} {b.unit} · {b.label}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{dFmt(b.date)} · {find(data.employees,b.userId).name}</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#4338ca"}}>{chf(b.qty*(Number(b.price)||0))}</span>
                    {(isAdmin||b.userId===user.id)&&<button onClick={()=>save({...data,siteMat:sm.filter(x=>x.id!==b.id)})} style={sbtn("#fee2e2","#991b1b")}>✕</button>}</div>
                </div>))}
            </div></>}
          <div style={{fontSize:11,color:"#9ca3af",padding:"0 3px 16px",lineHeight:1.55}}>
            VSI-Tarife sind Ausmasspreise und berühren den Lagerbestand nicht. Preise exkl. MwSt.
          </div>
        </>);})()}

      {view==="lager"&&<>
        {low.length>0&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a"}}>
          <div style={{fontWeight:700,fontSize:13.5,color:"#92400e",marginBottom:5}}>⚠️ Mindestbestand erreicht</div>
          {low.map(m=><div key={m.id} style={{fontSize:12,color:"#b45309"}}>{m.name}: {m.stock} {m.unit} (min. {m.minStock})</div>)}
        </div>}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Material suchen" style={inp}/>
        {catChips()}
        {groups.map(g=>(
          <div key={g} style={card}>
            <div style={{fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:.4,marginBottom:7}}>{g.toUpperCase()}</div>
            {filt.filter(m=>m.group===g).map(m=>{
              const lowM=Number(m.minStock)>0&&Number(m.stock)<=Number(m.minStock);
              return(
                <div key={m.id} style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:600}}>{m.name}</div>
                    <div style={{fontSize:11.5,color:lowM?"#b45309":"#6b7280"}}>
                      {m.stock} {m.unit} an Lager{m.minStock?`, min. ${m.minStock}`:""}{lowM?" ⚠️":""}</div></div>
                  {isAdmin&&<div style={{display:"flex",gap:6}}>
                    <button onClick={()=>adjust(m,-1)} style={sbtn("#f3f4f6","#374151")}>−</button>
                    <button onClick={()=>adjust(m,1)} style={sbtn("#dcfce7","#166534")}>+</button></div>}
                </div>);})}
          </div>))}
        <div style={{fontSize:11,color:"#9ca3af",padding:"0 3px 16px"}}>
          Buchungen auf eine Baustelle reduzieren den Lagerbestand automatisch. Mit + und − korrigierst du Wareneingang oder Inventurdifferenzen.</div>
      </>}

      {view==="katalog"&&isAdmin&&<>
        <div style={{display:"flex",gap:8,marginBottom:9}}>
          <button onClick={()=>{setErr("");setMf({id:"",sku:"",group:catF||"",name:"",unit:"m2",price:0,stock:0,minStock:0});setModal({t:"mat"});}}
            style={{...btn("#6366f1"),flex:1,fontSize:13}}>+ Artikel</button>
          <button onClick={()=>{setErr("");setImp("");setImpRows([]);setImpName("");setModal({t:"import"});}}
            style={{...btn("#107c41"),flex:1,fontSize:13}}>⬆️ Import</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:11}}>
          <button onClick={()=>{setErr("");setCf("");setModal({t:"cats"});}} style={{...sbtn("#f3f4f6","#374151"),flex:1}}>
            🗂 Kategorien ({catNames.length})</button>
          <button onClick={()=>{setSelMode(!selMode);setSelIds([]);setMoveTo(catF||"");}}
            style={{...sbtn(selMode?"#6366f1":"#f3f4f6",selMode?"#fff":"#374151"),flex:1}}>
            {selMode?"Auswahl beenden":"☑︎ Mehrere wählen"}</button>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Artikel oder Nummer suchen" style={inp}/>
        {catChips()}

        {selMode&&<div style={{...card,position:"sticky",top:0,zIndex:30,border:"1.5px solid #c7d2fe",background:"#eef2ff"}}>
          <div style={{...row,marginBottom:9}}>
            <span style={{fontSize:13.5,fontWeight:800,color:"#3730a3"}}>{selIds.length} ausgewählt</span>
            <button onClick={()=>setSelIds(selIds.length===filt.length?[]:filt.map(m=>m.id))}
              style={{...sbtn("#fff","#4338ca"),padding:"7px 11px"}}>
              {selIds.length===filt.length?"Keine":"Alle sichtbaren"}</button></div>
          <label style={lbl}>In Kategorie verschieben</label>
          <select value={moveTo} onChange={e=>setMoveTo(e.target.value)} style={{...inp,marginBottom:9}}>
            <option value="">Ohne Kategorie</option>
            {catNames.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <div style={{display:"flex",gap:8}}>
            <button onClick={bulkMove} disabled={!selIds.length}
              style={{...btn(selIds.length?"#6366f1":"#c7cbd3"),flex:2,fontSize:13}}>Verschieben</button>
            <button onClick={bulkDelete} disabled={!selIds.length}
              style={{...btn(selIds.length?"#ef4444":"#c7cbd3"),flex:1,fontSize:13}}>Löschen</button></div>
        </div>}

        {groups.map(g=>{
          const rows=filt.filter(m=>m.group===g);
          const allSel=rows.every(m=>selIds.includes(m.id));
          return(
          <div key={g} style={card}>
            <div style={{...row,marginBottom:7}}>
              <span style={{fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:.4}}>{g.toUpperCase()}</span>
              {selMode&&<button onClick={()=>setSelIds(s=>allSel?s.filter(x=>!rows.some(m=>m.id===x)):[...new Set([...s,...rows.map(m=>m.id)])])}
                style={{background:"none",border:"none",color:"#6366f1",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {allSel?"abwählen":"alle"}</button>}
            </div>
            {rows.map(m=>{
              const on=selIds.includes(m.id);
              return(
              <div key={m.id} onClick={()=>selMode?toggleSel(m.id):(setErr(""),setMf({...m}),setModal({t:"mat"}))}
                style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6",cursor:"pointer",gap:10}}>
                {selMode&&<div style={{width:22,height:22,borderRadius:6,flexShrink:0,background:on?"#6366f1":"#fff",
                  border:on?"none":"1.5px solid #cbd5e1",color:"#fff",fontSize:14,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>{on?"✓":""}</div>}
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13.5,fontWeight:600,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{m.name}</span>
                    {m.fire&&<span style={{...badge(m.fire==="VKF"?"#e0e7ff":"#fee2e2",m.fire==="VKF"?"#3730a3":"#991b1b"),fontSize:9.5,padding:"2px 7px"}}>{m.fire}</span>}</div>
                  <div style={{fontSize:11.5,color:"#6b7280"}}>
                    {m.sku?`${m.sku} · `:""}{chf(m.price)} / {m.unit}
                    {Number(m.sqs)>0&&<span style={{color:"#b45309"}}> · unter {m.sqt} {m.unit} +{chf(m.sqs)}</span>}</div></div>
                {!selMode&&<span style={{fontSize:11,color:"#a5b4fc",fontWeight:700}}>›</span>}
              </div>);})}
          </div>);})}
        <div style={{fontSize:11,color:"#9ca3af",padding:"0 3px 16px"}}>{mats.length} Artikel im Katalog. Alle Preise netto, exkl. MwSt.</div>
      </>}

      {modal?.t==="add"&&(()=>{
        const m=modal.m;
        const n=parseFloat(String(qty).replace(",","."))||0;
        const already=qtyOnSite(sm,siteId,m.id);
        const total=already+n;
        const s=surchargeOf(m,total);
        const fehlt=(Number(m.sqt)||0)-total;
        return(
        <Modal title={m.name} onClose={()=>setModal(null)}>
          {err&&<div style={errBox}>{err}</div>}
          <div style={{fontSize:12.5,color:"#6b7280",marginBottom:11}}>
            {chf(m.price)} / {m.unit} · Lager {m.stock} {m.unit}
            {m.fire&&<span style={{...badge("#fee2e2","#991b1b"),marginLeft:8,fontSize:10}}>{m.fire}</span>}</div>
          {already>0&&<div style={{fontSize:12,color:"#6b7280",marginBottom:9}}>
            Bereits auf dieser Baustelle: {already} {m.unit}</div>}
          <label style={lbl}>Menge in {m.unit}</label>
          <input type="number" min="0" step="0.5" value={qty} onChange={e=>{setQty(e.target.value);setErr("");}}
            style={{...inp,fontSize:20,fontWeight:700,textAlign:"center"}}/>
          <div style={{display:"flex",gap:6,marginBottom:11}}>
            {[1,5,10,25,50].map(x=><button key={x} onClick={()=>setQty(String(x))}
              style={{flex:1,border:"1.5px solid #e5e7eb",background:"#fff",color:"#6b7280",borderRadius:9,padding:"9px 2px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:38}}>{x}</button>)}
          </div>
          {s>0&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 12px",marginBottom:11}}>
            <div style={{fontSize:13,fontWeight:700,color:"#92400e"}}>
              ⚠️ Kleinmengenzuschlag {chf(s)} / {m.unit}</div>
            <div style={{fontSize:11.5,color:"#b45309",marginTop:3,lineHeight:1.5}}>
              Auf dieser Baustelle kommen {total} {m.unit} zusammen, die Mindestmenge liegt bei {m.sqt} {m.unit}.
              Noch {Math.max(0,fehlt)} {m.unit} bis der Zuschlag entfällt.</div></div>}
          <div style={{background:"#eef2ff",borderRadius:10,padding:"10px 12px",marginBottom:13}}>
            <div style={{...row,fontSize:12.5,color:"#4338ca"}}>
              <span>Material</span><span>{chf(n*m.price)}</span></div>
            {s>0&&<div style={{...row,fontSize:12.5,color:"#b45309"}}>
              <span>Zuschlag auf {total} {m.unit}</span><span>{chf(total*s)}</span></div>}
            <div style={{...row,fontSize:14.5,fontWeight:800,color:"#4338ca",marginTop:4}}>
              <span>Betrag</span><span>{chf(n*m.price+(s>0?total*s:0))}</span></div></div>
          <button onClick={addMat} style={{...btn("#6366f1"),width:"100%"}}>Auf Baustelle buchen</button>
        </Modal>);})()}

      {modal?.t==="cats"&&<Modal title="Kategorien" onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input value={cf} onChange={e=>{setCf(e.target.value);setErr("");}} placeholder="Neue Kategorie"
            onKeyDown={e=>e.key==="Enter"&&addCat()} style={{...inp,marginBottom:0}}/>
          <button onClick={addCat} style={btn("#6366f1")}>+</button></div>
        {catNames.map(n=>{
          const c=cats.find(x=>x.name===n),cnt=mats.filter(m=>m.group===n).length;
          return(
            <div key={n} style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6"}}>
              <div style={{minWidth:0,flex:1}}>
                <input defaultValue={n} onBlur={e=>c&&renameCat(n,e.target.value)}
                  disabled={!c} style={{...inp,marginBottom:0,fontSize:14,padding:"8px 10px",minHeight:38,
                    border:c?"1.5px solid #e5e7eb":"1.5px solid #f3f4f6",background:c?"#fff":"#fafafa"}}/>
                <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>{cnt} Artikel{!c?", nur aus Import":""}</div></div>
              {c&&<button onClick={()=>delCat(c)} style={{...sbtn("#fee2e2","#991b1b"),marginLeft:8}}>🗑</button>}
            </div>);})}
        <div style={{fontSize:11,color:"#9ca3af",marginTop:11,lineHeight:1.55}}>
          Umbenennen wird auf alle Artikel der Kategorie übertragen. Beim Löschen wandern die Artikel nach «Ohne Kategorie», sie gehen nicht verloren.</div>
      </Modal>}

      {modal?.t==="mat"&&<Modal title={mf.id?"Artikel bearbeiten":"Neuer Artikel"} onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          <div style={{width:"40%"}}><label style={lbl}>Artikelnummer</label>
            <input value={mf.sku||""} onChange={e=>setMf({...mf,sku:e.target.value})} placeholder="AF-13" style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Kategorie</label>
            <select value={mf.group} onChange={e=>setMf({...mf,group:e.target.value})} style={inp}>
              <option value="">Ohne Kategorie</option>
              {catNames.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div>
        <label style={lbl}>Bezeichnung</label>
        <input value={mf.name} onChange={e=>{setMf({...mf,name:e.target.value});setErr("");}} style={inp}/>
        <div style={{display:"flex",gap:8}}>
          <div style={{width:"35%"}}><label style={lbl}>Einheit</label>
            <select value={mf.unit} onChange={e=>setMf({...mf,unit:e.target.value})} style={inp}>
              {["m2","lfm","Stk","kg","Rolle","h"].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
          <div style={{flex:1}}><label style={lbl}>Preis Fr.</label>
            <input type="number" min="0" step="0.05" value={mf.price} onChange={e=>setMf({...mf,price:e.target.value})} style={inp}/></div></div>
        <label style={lbl}>Feuerwiderstand</label>
        <select value={mf.fire||""} onChange={e=>setMf({...mf,fire:e.target.value})} style={inp}>
          {EI.map(v=><option key={v||"none"} value={v}>{v||"keiner"}</option>)}</select>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><label style={lbl}>Mindestmenge</label>
            <input type="number" min="0" value={mf.sqt??0} onChange={e=>setMf({...mf,sqt:e.target.value})} style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Zuschlag Fr.</label>
            <input type="number" min="0" step="0.5" value={mf.sqs??0} onChange={e=>setMf({...mf,sqs:e.target.value})} style={inp}/></div></div>
        <div style={{fontSize:11,color:"#9ca3af",marginTop:-4,marginBottom:11,lineHeight:1.5}}>
          Wird auf einer Baustelle weniger als die Mindestmenge verbraucht, kommt der Zuschlag je Einheit dazu. 0 bedeutet kein Zuschlag.</div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><label style={lbl}>Lagerbestand</label>
            <input type="number" min="0" value={mf.stock} onChange={e=>setMf({...mf,stock:e.target.value})} style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Mindestbestand</label>
            <input type="number" min="0" value={mf.minStock} onChange={e=>setMf({...mf,minStock:e.target.value})} style={inp}/></div></div>
        <div style={{display:"flex",gap:8,marginTop:3}}>
          <button onClick={saveMat} style={{...btn("#6366f1"),flex:1}}>Speichern</button>
          {mf.id&&<button onClick={()=>delMat(mf.id)} style={btn("#ef4444")}>🗑</button>}</div>
      </Modal>}

      {modal?.t==="import"&&<Modal title="Preisliste importieren" onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <div style={{fontSize:12.5,color:"#6b7280",lineHeight:1.55,marginBottom:11}}>
          Excel-Datei wählen oder Zeilen einfügen. Erkannte Spalten: Artikelnummer, Kategorie, Artikel, Einheit, Preis, Lager, Mindestbestand.
          Bestehende Artikel werden aktualisiert, es entstehen keine Duplikate.</div>
        <label style={lbl}>Excel- oder CSV-Datei</label>
        <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={loadFile} style={{...inp,padding:"9px 10px",fontSize:13}}/>
        {impName&&<div style={{fontSize:12,color:"#4338ca",fontWeight:700,marginBottom:9}}>📄 {impName}</div>}
        <label style={lbl}>oder Zeilen einfügen</label>
        <textarea value={imp} onChange={e=>{setImp(e.target.value);setImpRows(rowsToItems(textToMatrix(e.target.value)));setErr("");}}
          placeholder={tmpl}
          style={{width:"100%",height:110,fontSize:12,fontFamily:"monospace",borderRadius:10,border:"1.5px solid #e5e7eb",padding:10,marginBottom:9,boxSizing:"border-box"}}/>
        <button onClick={()=>{setImp(tmpl);setImpRows(rowsToItems(textToMatrix(tmpl)));}}
          style={{...sbtn("#f3f4f6","#374151"),width:"100%",marginBottom:12}}>📋 Vorlage einfügen</button>
        {impRows.length>0&&<>
          <div style={{fontSize:12.5,fontWeight:700,color:"#4338ca",marginBottom:7}}>
            {impRows.length} Zeilen erkannt · {impRows.filter(r=>matchIdx(r)>=0).length} Updates · {impRows.filter(r=>matchIdx(r)<0).length} neu</div>
          <div style={{maxHeight:150,overflowY:"auto",background:"#f9fafb",borderRadius:10,padding:"8px 10px",marginBottom:12}}>
            {impRows.slice(0,40).map((r,i)=>(
              <div key={i} style={{fontSize:11.5,padding:"3px 0",borderBottom:"1px solid #f0f1f3",display:"flex",justifyContent:"space-between",gap:8}}>
                <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                <span style={{color:matchIdx(r)>=0?"#b45309":"#166534",fontWeight:700,flexShrink:0}}>
                  {matchIdx(r)>=0?"Update":"Neu"} {chf(r.price)}</span></div>))}
            {impRows.length>40&&<div style={{fontSize:11,color:"#9ca3af",paddingTop:5}}>… und {impRows.length-40} weitere</div>}
          </div></>}
        <button onClick={runImport} disabled={!impRows.length} style={{...btn(impRows.length?"#107c41":"#c7cbd3"),width:"100%"}}>
          Import starten</button>
      </Modal>}
    </div>
  );
}

function Admin({me,data,save,holSrc}){
  const emps=data.employees,staff=emps;
  const partners=data.partners||[],sites=data.sites||[];
  const yr=new Date().getFullYear();
  const [modal,setModal]=useState(null);
  const [ef,setEf]=useState({id:"",name:"",role:"employee",vacationDays:25});
  const [sf,setSf]=useState({id:"",name:"",street:"",zip:"",city:"",partnerId:"",sollH:0,active:true});
  const [pf,setPf]=useState({id:"",name:"",contact:"",phone:""});
  const [rsel,setRsel]=useState({pw:true,mfa:true});
  const [mode,setMode]=useState("monat");
  const [scope,setScope]=useState("summary");
  const [mth,setMth]=useState(new Date().getMonth());
  const [eyr,setEyr]=useState(yr);
  const [rs,setRs]=useState(todayISO().slice(0,8)+"01");
  const [re,setRe]=useState(todayISO());
  const [exp,setExp]=useState(null);
  const [err,setErr]=useState("");
  const [view,setView]=useState("sites");
  const [sfil,setSfil]=useState("offen");
  const toggleDone=s=>save({...data,sites:sites.map(x=>x.id===s.id?
    {...x,done:!x.done,doneAt:!x.done?new Date().toISOString():null}:x)});

  const usedOf=id=>data.vacations.filter(v=>v.userId===id&&v.status==="approved"&&v.startDate.slice(0,4)===String(yr)).reduce((s,v)=>s+workDays(v.startDate,v.endDate),0);
  const pendOf=id=>data.vacations.filter(v=>v.userId===id&&v.status==="pending").reduce((s,v)=>s+workDays(v.startDate,v.endDate),0);
  const istOf=(sid,s,e)=>data.entries.filter(x=>x.siteId===sid&&x.clockOut&&(!s||(x.date>=s&&x.date<=e))).reduce((a,x)=>a+netH(x),0);

  const saveEmp=()=>{
    if(!ef.name.trim())return;
    const vd=Math.max(0,Number(ef.vacationDays)||0);
    const rt=ef.regieTariff==="B"?"B":"A";
    if(ef.id)save({...data,employees:emps.map(e=>e.id===ef.id?{...e,name:ef.name,role:ef.role,vacationDays:vd,regieTariff:rt}:e)});
    else save({...data,employees:[...emps,{id:genId(),name:ef.name,role:ef.role,vacationDays:vd,regieTariff:rt}]});
    setModal(null);
  };
  const delEmp=id=>{save({...data,employees:emps.filter(e=>e.id!==id),entries:data.entries.filter(e=>e.userId!==id),
    vacations:data.vacations.filter(v=>v.userId!==id),sick:data.sick.filter(s=>s.userId!==id)});setModal(null);};

  const saveSite=()=>{
    setErr("");
    if(!sf.street.trim()||!sf.zip.trim()){setErr("Adresse mit Hausnummer und PLZ sind Pflicht.");return;}
    const rec={name:sf.name.trim(),street:sf.street.trim(),zip:sf.zip.trim(),city:sf.city.trim(),
      partnerId:sf.partnerId,sollH:Math.max(0,Number(sf.sollH)||0),active:!!sf.active};
    if(sf.id)save({...data,sites:sites.map(s=>s.id===sf.id?{...s,...rec}:s)});
    else save({...data,sites:[...sites,{id:genId(),...rec}]});
    setModal(null);
  };
  const delSite=id=>{save({...data,sites:sites.filter(s=>s.id!==id),
    entries:data.entries.map(e=>e.siteId===id?{...e,siteId:""}:e)});setModal(null);};
  const savePartner=()=>{
    setErr("");
    if(!pf.name.trim()){setErr("Name der Partnerfirma fehlt.");return;}
    if(pf.id)save({...data,partners:partners.map(p=>p.id===pf.id?{...p,...pf}:p)});
    else save({...data,partners:[...partners,{...pf,id:genId()}]});
    setModal(null);
  };
  const delPartner=id=>{save({...data,partners:partners.filter(p=>p.id!==id),
    sites:sites.map(s=>s.partnerId===id?{...s,partnerId:""}:s)});setModal(null);};

  const applyReset=u=>{
    const a={...(data.auth||{})},e=a[u.id];
    if(rsel.pw&&rsel.mfa)delete a[u.id];
    else if(rsel.pw)a[u.id]={...e,hash:null};
    else if(rsel.mfa)a[u.id]={...e,totp:null,recovery:[]};
    save({...data,auth:a});setModal(null);
  };

  const months=Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);return mKey(iso(d));});
  const monthStats=k=>{
    const s=mStart(k),e=mEnd(k);
    const en=data.entries.filter(x=>x.date>=s&&x.date<=e&&x.clockOut);
    return {h:en.reduce((a,x)=>a+netH(x),0),n:en.length,op:data.vacations.filter(v=>v.status==="pending"&&inRange(v,s,e)).length};
  };
  const setLock=(k,on)=>{
    const locks={...(data.locks||{})};
    if(on)locks[k]={by:me.name,at:new Date().toISOString()};else delete locks[k];
    const log=[{month:k,action:on?"gesperrt":"geöffnet",by:me.name,at:new Date().toISOString()},...(data.lockLog||[])].slice(0,30);
    save({...data,locks,lockLog:log});setModal(null);
  };

  const range=()=>mode==="monat"?[mStart(`${eyr}-${String(mth+1).padStart(2,"0")}`),mEnd(`${eyr}-${String(mth+1).padStart(2,"0")}`)]
    :mode==="jahr"?[`${eyr}-01-01`,`${eyr}-12-31`]:[rs,re];
  const label=()=>mode==="monat"?`${MONATE[mth]} ${eyr}`:mode==="jahr"?`Jahr ${eyr}`:`${dFmt(rs)} bis ${dFmt(re)}`;

  const summaryRows=()=>{
    const [s,e]=range();
    const rows=[["Mitarbeitende","Arbeitstage","Netto Stunden","Pausen h","Ferientage","Krankheitstage"]];
    staff.forEach(u=>{
      const en=data.entries.filter(x=>x.userId===u.id&&x.date>=s&&x.date<=e&&x.clockOut);
      const th=en.reduce((a,x)=>a+netH(x),0),pa=en.reduce((a,x)=>a+(Number(x.pause)||0),0)/60;
      const vd=data.vacations.filter(v=>v.userId===u.id&&v.status==="approved"&&inRange(v,s,e)).reduce((a,v)=>a+overlapDays(v,s,e),0);
      const sd=data.sick.filter(x=>x.userId===u.id&&x.date>=s&&x.date<=e).length;
      rows.push([u.name,en.length,num(th),num(pa),vd,sd]);
    });
    return rows;
  };
  const siteRows=()=>{
    const [s,e]=range();
    const rows=[["Baustelle","Adresse","PLZ","Ort","Partnerfirma","Soll h","Ist h (Zeitraum)","Ist h (total)","Differenz"]];
    sites.forEach(st=>{
      const isR=istOf(st.id,s,e),isT=istOf(st.id);
      rows.push([siteLbl(st),st.street,st.zip,st.city,find(partners,st.partnerId).name||"",num(st.sollH||0),num(isR),num(isT),num((st.sollH||0)-isT)]);
    });
    return rows;
  };
  const detailRows=()=>{
    const [s,e]=range();
    const rows=[["Mitarbeitende","Datum","Von","Bis","Pause min","Netto h","Baustelle","Typ","Notiz"]],all=[];
    staff.forEach(u=>{
      data.entries.filter(x=>x.userId===u.id&&x.date>=s&&x.date<=e).forEach(x=>
        all.push([u.name,x.date,tFmt(x.clockIn),x.clockOut?tFmt(x.clockOut):"",Number(x.pause)||0,x.clockOut?num(netH(x)):"",
          siteLbl(siteOf(data,x.siteId)),x.manual?"Arbeit (manuell)":"Arbeit (gestempelt)",x.note||""]));
      data.vacations.filter(v=>v.userId===u.id&&v.status==="approved"&&inRange(v,s,e)).forEach(v=>
        all.push([u.name,v.startDate,"","","",overlapDays(v,s,e),"","Ferien",v.note||""]));
      data.sick.filter(x=>x.userId===u.id&&x.date>=s&&x.date<=e).forEach(x=>
        all.push([u.name,x.date,"","","",1,"","Krankheit",x.note||""]));
    });
    all.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
    all.forEach(r=>rows.push([r[0],dFmt(r[1]),...r.slice(2)]));
    return rows;
  };
  const openExport=()=>setExp({title:label(),sheets:scope==="detail"
    ?[{name:"Zusammenfassung",rows:summaryRows()},{name:"Baustellen",rows:siteRows()},{name:"Detail",rows:detailRows()}]
    :[{name:"Zusammenfassung",rows:summaryRows()},{name:"Baustellen",rows:siteRows()}]});

  return (
    <div style={{padding:"14px 14px 0"}}>
      <div style={{marginBottom:11}}><span style={h2}>Administration</span></div>

      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:6,WebkitOverflowScrolling:"touch"}}>
        {[["sites","🏗 Baustellen"],["partners","🏢 Firmen"],["team","👥 Team"],["lock","🔒 Abschluss"],["access","🔑 Zugänge"],["export","📤 Export"],["firma","🏛 Firma"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{flexShrink:0,border:"none",cursor:"pointer",borderRadius:20,padding:"9px 14px",fontSize:12.5,fontWeight:700,minHeight:40,
            background:view===v?"#6366f1":"#fff",color:view===v?"#fff":"#6b7280",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>{l}</button>))}
      </div>

      {view==="firma"&&(()=>{
        const co=data.company||{};
        const setCo=p=>save({...data,company:{...co,...p}});
        const upload=(key,e)=>{
          setErr("");
          const f=e.target.files&&e.target.files[0];
          if(!f)return;
          if(f.size>1500000){setErr("Datei zu gross, maximal 1.5 MB. Bitte SVG oder ein kleineres PNG verwenden.");return;}
          const r=new FileReader();
          r.onload=()=>setCo({[key]:String(r.result)});
          r.onerror=()=>setErr("Datei konnte nicht gelesen werden.");
          r.readAsDataURL(f);
        };
        return(<>
          <div style={sect}>LOGO</div>
          <div style={card}>
            <div style={{background:"#f9fafb",borderRadius:10,padding:"14px 12px",marginBottom:11,display:"flex",justifyContent:"center"}}>
              <Logo w={230}/></div>
            <label style={lbl}>Logo hochladen (PNG, JPG oder SVG)</label>
            <input type="file" accept="image/*" onChange={e=>upload("logo",e)} style={{...inp,padding:"9px 10px",fontSize:13}}/>
            {co.logo&&<button onClick={()=>setCo({logo:""})} style={{...sbtn("#fee2e2","#991b1b"),width:"100%",marginBottom:11}}>Logo entfernen</button>}
            <label style={lbl}>Bildmarke für Kopfzeile und Favicon</label>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:9}}>
              <div style={{background:"#6366f1",padding:8,borderRadius:10}}><Mark s={38}/></div>
              <div style={{flex:1,fontSize:11.5,color:"#6b7280"}}>So erscheint die Marke in der Kopfzeile. Ohne eigenes Bild wird das Logo verwendet.</div></div>
            <input type="file" accept="image/*" onChange={e=>upload("mark",e)} style={{...inp,padding:"9px 10px",fontSize:13}}/>
            {co.mark&&<button onClick={()=>setCo({mark:""})} style={{...sbtn("#fee2e2","#991b1b"),width:"100%"}}>Bildmarke entfernen</button>}
            <div style={{fontSize:11,color:"#9ca3af",marginTop:10,lineHeight:1.55}}>
              Das Logo erscheint auf dem Anmeldebildschirm, in der Kopfzeile und im PDF-Export. Ohne Upload wird eine Nachbildung angezeigt.</div>
          </div>

          <div style={sect}>REGIETARIFE</div>
          <div style={card}>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}><label style={lbl}>Isoleur A, Fr. / h</label>
                <input type="number" min="0" step="0.5" value={co.regieA??84}
                  onChange={e=>setCo({regieA:numOf(e.target.value)??84})} style={inp}/></div>
              <div style={{flex:1}}><label style={lbl}>Isoleur B, Fr. / h</label>
                <input type="number" min="0" step="0.5" value={co.regieB??76}
                  onChange={e=>setCo({regieB:numOf(e.target.value)??76})} style={inp}/></div></div>
            <label style={lbl}>Gültig ab</label>
            <input type="date" value={co.regieFrom??"2024-01-01"} onChange={e=>setCo({regieFrom:e.target.value})} style={{...inp,marginBottom:0}}/>
            <div style={{fontSize:11,color:"#9ca3af",marginTop:10,lineHeight:1.55}}>
              Welchen Tarif eine Person hat, steht bei den Mitarbeitenden. Eine Tariferhöhung
              gilt ab dem gewählten Datum, bereits verrechnete Baustellen bleiben unverändert.</div>
          </div>

          <div style={sect}>FIRMENANGABEN</div>
          <div style={{...card,marginBottom:18}}>
            <label style={lbl}>Firmenname</label>
            <input value={co.name??"IsoTeam Suljejmani GmbH"} onChange={e=>setCo({name:e.target.value})} style={inp}/>
            <label style={lbl}>Strasse und Nummer</label>
            <input value={co.street??"Gerliswilstrasse 68"} onChange={e=>setCo({street:e.target.value})} style={inp}/>
            <div style={{display:"flex",gap:8}}>
              <div style={{width:"38%"}}><label style={lbl}>PLZ</label>
                <input value={co.zip??"6020"} onChange={e=>setCo({zip:e.target.value})} style={inp}/></div>
              <div style={{flex:1}}><label style={lbl}>Ort</label>
                <input value={co.city??"Emmenbrücke"} onChange={e=>setCo({city:e.target.value})} style={inp}/></div></div>
            <label style={lbl}>MwSt.-Nummer</label>
            <input value={co.vat??"CHE-305.978.601"} onChange={e=>setCo({vat:e.target.value})} style={inp}/>
            <label style={lbl}>IBAN oder QR-IBAN</label>
            <input value={co.iban??""} onChange={e=>setCo({iban:e.target.value})} placeholder="CH.. .... .... .... .... ." style={inp}/>
            <label style={lbl}>Telefon</label>
            <input value={co.phone??"079 616 89 75"} onChange={e=>setCo({phone:e.target.value})} style={inp}/>
            <label style={lbl}>E-Mail</label>
            <input value={co.mail??"info@isoteam-suljejmani.ch"} onChange={e=>setCo({mail:e.target.value})} style={{...inp,marginBottom:0}}/>
            <div style={{fontSize:11,color:"#9ca3af",marginTop:10}}>Diese Angaben erscheinen im Kopf jedes PDF-Auszugs.</div>
          </div>
        </>);})()}

      {view==="sites"&&<>
        <div style={{...sect,...row}}>
          <span>BAUSTELLEN</span>
          <button onClick={()=>{setErr("");setSf({id:"",name:"",street:"",zip:"",city:"",partnerId:"",sollH:0,status:"OFFERTE"});setModal({t:"site"});}}
            style={{...sbtn("#6366f1"),padding:"6px 11px",fontSize:11.5,minHeight:32}}>+ Neu</button>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:9}}>
          {[["aktiv","Aktiv"],["OFFERTE","Offerte"],["IN_ARBEIT","In Arbeit"],["erledigt","Erledigt"],["all","Alle"]].map(([v,l])=>{
            const n=sites.filter(s=>v==="all"?true:v==="aktiv"?!["ABGESCHLOSSEN","VERLOREN","STORNIERT"].includes(stOf(s))
              :v==="erledigt"?["ABGESCHLOSSEN","VERLOREN","STORNIERT"].includes(stOf(s)):stOf(s)===v).length;
            return <button key={v} onClick={()=>setSfil(v)} style={{flexShrink:0,border:"none",cursor:"pointer",borderRadius:20,
              padding:"9px 13px",fontSize:12,fontWeight:700,background:sfil===v?"#6366f1":"#fff",color:sfil===v?"#fff":"#6b7280",
              boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>{l} ({n})</button>;})}
        </div>
        {(()=>{
          const list=sites.filter(s=>sfil==="all"?true
            :sfil==="aktiv"?!["ABGESCHLOSSEN","VERLOREN","STORNIERT"].includes(stOf(s))
            :sfil==="erledigt"?["ABGESCHLOSSEN","VERLOREN","STORNIERT"].includes(stOf(s))
            :stOf(s)===sfil);
          if(!list.length)return <div style={{...card,fontSize:12.5,color:"#9ca3af"}}>Keine Baustellen in dieser Ansicht.</div>;
          return list.map(s=>{
            const st=stOf(s),ist=istOf(s.id),soll=Number(s.sollH)||0;
            const pct=soll?Math.min(100,ist/soll*100):0,over=soll>0&&ist>soll;
            const ruhend=["ABGESCHLOSSEN","VERLOREN","STORNIERT"].includes(st);
            return(
              <div key={s.id} style={{...card,opacity:ruhend?.72:1,borderLeft:`4px solid ${ST[st].fg}`}}>
                <div style={{...row,marginBottom:8,cursor:"pointer",alignItems:"flex-start"}}
                  onClick={()=>{setErr("");setSf({...s,sollH:s.sollH||0});setModal({t:"site"});}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14.5,marginBottom:4}}>{siteLbl(s)}</div>
                    <StBadge s={s}/>
                    <div style={{fontSize:11.5,color:"#6b7280",marginTop:5}}>{siteAddr(s)}</div>
                    {s.partnerId&&<div style={{fontSize:11.5,color:"#4338ca",marginTop:1}}>{find(partners,s.partnerId).name}</div>}</div>
                  <span style={{fontSize:11,color:"#a5b4fc",fontWeight:700,flexShrink:0,marginLeft:8}}>›</span></div>

                {st!=="OFFERTE"&&<>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:8}}>
                    {[["Soll",soll?`${soll} h`:"–","#374151"],["Ist",`${ist.toFixed(1).replace(".",",")} h`,"#4338ca"],
                      ["Rest",soll?`${(soll-ist).toFixed(1).replace(".",",")} h`:"–",over?"#b91c1c":"#166534"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"#f9fafb",borderRadius:9,padding:"7px 3px",textAlign:"center"}}>
                        <div style={{fontSize:9.5,color:"#6b7280",fontWeight:600}}>{l}</div>
                        <div style={{fontWeight:800,fontSize:13.5,color:c}}>{v}</div></div>))}
                  </div>
                  <div style={{height:7,background:"#eef0f3",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:ruhend?"#94a3b8":over?"#ef4444":pct>85?"#f59e0b":"#10b981"}}/></div>
                  {over&&!ruhend&&<div style={{fontSize:11,color:"#b91c1c",fontWeight:700,marginTop:6}}>
                    ⚠️ Soll überschritten um {(ist-soll).toFixed(1).replace(".",",")} h</div>}
                </>}

                {(s.statusLog||[]).length>0&&<div style={{fontSize:10.5,color:"#9ca3af",marginTop:8,lineHeight:1.5}}>
                  {(s.statusLog||[]).slice(-1).map((l,i)=>(
                    <div key={i}>{ST[l.to]?.l} seit {dFmt(l.at.slice(0,10))}, {l.by}{l.reason?`, ${l.reason}`:""}</div>))}
                </div>}

                {(s.plannedStart||s.deadline||(s.assignees||[]).length>0)&&(()=>{
                  const spaet=s.deadline&&s.deadline<todayISO()&&!["ABGESCHLOSSEN","VERRECHNET","AUSGEFUEHRT"].includes(st);
                  const bald=s.deadline&&!spaet&&s.deadline<=addD(todayISO(),7);
                  return(
                  <div style={{background:"#f9fafb",borderRadius:10,padding:"9px 11px",marginTop:9,fontSize:11.5,lineHeight:1.65,color:"#374151"}}>
                    {s.plannedStart&&<div>📅 {dFmtS(s.plannedStart)} bis {dFmtS(s.plannedEnd||s.plannedStart)}</div>}
                    {s.deadline&&<div style={{color:spaet?"#b91c1c":bald?"#b45309":"#374151",fontWeight:spaet||bald?700:400}}>
                      ⏰ Termin {dFmt(s.deadline)}{spaet?" · überfällig":bald?" · diese Woche":""}</div>}
                    {(s.assignees||[]).length>0&&<div>👥 {s.assignees.map(id=>find(emps,id).name).join(", ")}</div>}
                    {(s.deadlineLog||[]).length>0&&<div style={{color:"#9ca3af",fontSize:10.5}}>
                      Termin {(s.deadlineLog||[]).length}× verschoben</div>}
                  </div>);})()}
                <div style={{display:"flex",gap:8,marginTop:9}}>
                  {["AUSGEFUEHRT","VERRECHNET"].includes(st)&&<button
                    onClick={()=>setModal({t:"inv",s,groups:invoiceParts(data,s.id),rab:Number(s.discountPct)||0,
                      to:find(partners,s.partnerId).contact||"",pay:""})}
                    style={{...sbtn("#ede9fe","#5b21b6"),flex:1}}>🧾 Rechnung</button>}
                  {["OFFERTE","VERLOREN"].includes(st)&&<button
                    onClick={()=>{const l=offerLines(data,s.id);
                      setModal({t:"offer",s,lines:l,rab:Number(s.discountPct)||0,to:find(partners,s.partnerId).contact||""});}}
                    style={{...sbtn("#fef3c7","#92400e"),flex:1}}>📄 Offerte</button>}
                  <button onClick={()=>setModal({t:"plan",s,ps:s.plannedStart||"",pe:s.plannedEnd||"",
                    dl:s.deadline||"",reason:"",team:[...(s.assignees||[])]})}
                    style={{...sbtn("#f3f4f6","#374151"),flex:1}}>📅 Planen</button>
                  {NEXT[st].length>0&&<button onClick={()=>setModal({t:"status",s,to:NEXT[st][0],reason:""})}
                    style={{...sbtn("#eef2ff","#4338ca"),flex:1}}>Status</button>}
                </div>
                {(data.offers||[]).filter(o=>o.siteId===s.id).slice(-1).map(o=>(
                  <div key={o.id} style={{fontSize:11,color:"#6b7280",marginTop:8}}>
                    📄 Offerte {o.number}{o.version>1?` v${o.version}`:""}, {chf(o.total)}
                    {o.sentAt?`, versendet am ${dFmt(o.sentAt.slice(0,10))}`:", noch nicht versendet"}</div>))}
              </div>);});
        })()}
        <div style={{fontSize:11,color:"#9ca3af",padding:"0 3px 16px",lineHeight:1.55}}>
          Zeiten lassen sich ab «Auftrag» buchen, Material bereits in der Offertphase.
          Abgeschlossene, verlorene und stornierte Baustellen verschwinden aus der Auswahl,
          bleiben aber in den Auswertungen.</div>

        {modal?.t==="inv"&&(()=>{
          const s=modal.s,g=modal.groups;
          const all=[...g.offer,...g.nach,...g.regie,...g.gut];
          const sub=all.reduce((a,l)=>a+l.amount,0);
          const rab=Math.max(0,sub)*(Number(modal.rab)||0)/100;
          const netto=sub-rab,mwst=netto*VAT/100,total=netto+mwst;
          const sums={sub,rab,netto,mwst,total};
          const partner=find(partners,s.partnerId);
          const inv=(data.invoices||[]).find(x=>x.siteId===s.id);
          const bezahlt=(inv?.payments||[]).reduce((a,p)=>a+Number(p.amount||0),0);
          const offen=(inv?.total||total)-bezahlt;
          const blocks=[["Gemäss Offerte",g.offer],["Nachtrag",g.nach],["Regiearbeit",g.regie],["Gutschriften",g.gut]];
          const mkInv=()=>({
            id:genId(),siteId:s.id,
            number:`${new Date().getFullYear()}-${String((data.invoices||[]).length+1).padStart(3,"0")}`,
            issuedAt:new Date().toISOString(),dueDate:addD(todayISO(),30),discountDeadline:addD(todayISO(),10),
            discountPct:Number(modal.rab)||0,lines:all,total,qrReference:"",payments:[],sentAt:null,sentTo:"",by:me.name,
          });
          return(
          <Modal title={inv?`Rechnung ${inv.number}`:"Rechnung erstellen"} onClose={()=>setModal(null)}>
            <div style={{fontSize:13.5,fontWeight:700}}>{siteLbl(s)}</div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:12}}>{siteAddr(s)} · {partner.name||"ohne Auftraggeber"}</div>

            {all.length===0&&<div style={errBox}>Keine verrechenbaren Positionen vorhanden.</div>}

            {all.length>0&&<>
              <div style={{...card,padding:"10px 12px"}}>
                {blocks.filter(([,arr])=>arr.length).map(([t,arr])=>(
                  <div key={t} style={{marginBottom:8}}>
                    <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",letterSpacing:.4,marginBottom:4}}>{t.toUpperCase()}</div>
                    {arr.map((l,i)=>(
                      <div key={i} style={{...row,padding:"5px 0",borderBottom:"1px solid #f3f4f6",gap:8}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600}}>{l.desc}</div>
                          <div style={{fontSize:11,color:"#9ca3af"}}>{deNum(num(l.qty))} {l.unit} × {chf(l.price)}</div></div>
                        <span style={{fontSize:12.5,fontWeight:700,color:l.amount<0?"#991b1b":"#4338ca",flexShrink:0}}>{chf(l.amount)}</span>
                      </div>))}
                  </div>))}
              </div>

              {!inv&&<><label style={lbl}>Objektrabatt in Prozent</label>
                <input type="number" min="0" max="100" value={modal.rab}
                  onChange={e=>setModal({...modal,rab:e.target.value})} style={inp}/></>}

              <div style={{...card,background:"#f9fafb",padding:"11px 13px"}}>
                <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Zwischensumme</span><span>{chf(sub)}</span></div>
                {rab>0&&<div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Rabatt {modal.rab} %</span><span>− {chf(rab)}</span></div>}
                <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>MwSt. {VAT} %</span><span>{chf(mwst)}</span></div>
                <div style={{...row,fontSize:16,fontWeight:800,color:"#5b21b6",marginTop:5}}><span>Total</span><span>{chf(inv?inv.total:total)}</span></div>
                {inv&&<div style={{...row,fontSize:12,color:"#6b7280",marginTop:5,paddingTop:5,borderTop:"1px solid #e5e7eb"}}>
                  <span>2 % Skonto bis {dFmt(inv.discountDeadline)}</span><span>{chf(inv.total*0.98)}</span></div>}
              </div>

              {!inv&&<>
                <label style={lbl}>Empfänger</label>
                <input value={modal.to} onChange={e=>setModal({...modal,to:e.target.value})}
                  placeholder="rechnung@fluema.ch" style={inp}/>
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 11px",fontSize:11.5,color:"#92400e",marginBottom:11,lineHeight:1.55}}>
                  Beim Versand wird die Rechnungsnummer vergeben und die Rechnung eingefroren.
                  Eine Korrektur ist danach nur über Storno und Neuausstellung möglich.</div>
                <button onClick={()=>{
                    if(!modal.to.trim())return;
                    const base=mkInv();
                    const full={...base,qrReference:qrRef(base.number.replace("-","")+String(Date.now()).slice(-8)),
                      sentAt:new Date().toISOString(),sentTo:modal.to.trim()};
                    save({...data,invoices:[...(data.invoices||[]),full],
                      sites:sites.map(x=>x.id===s.id?{...x,status:"VERRECHNET",
                        statusLog:[...(x.statusLog||[]),{from:stOf(x),to:"VERRECHNET",by:me.name,at:new Date().toISOString(),reason:`Rechnung ${full.number}`}]}:x)});
                    setModal(null);
                  }} style={{...btn(modal.to.trim()?"#5b21b6":"#c7cbd3"),width:"100%"}}>✉️ Rechnung stellen und versenden</button>
              </>}

              {inv&&<>
                <div style={{fontSize:11.5,color:"#6b7280",marginBottom:11,lineHeight:1.6}}>
                  Versendet am {dFmt(inv.sentAt.slice(0,10))} an {inv.sentTo}<br/>
                  Referenz {inv.qrReference}<br/>
                  Fällig {dFmt(inv.dueDate)}
                  {offen>0.01&&todayISO()>inv.dueDate&&<span style={{color:"#b91c1c",fontWeight:700}}> · überfällig</span>}</div>

                <div style={{...card,background:offen<=0.01?"#ecfdf5":"#f9fafb",padding:"11px 13px"}}>
                  <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Bezahlt</span><span>{chf(bezahlt)}</span></div>
                  <div style={{...row,fontSize:14.5,fontWeight:800,color:offen<=0.01?"#059669":"#b45309"}}>
                    <span>{offen<=0.01?"Beglichen":"Offen"}</span><span>{chf(Math.max(0,offen))}</span></div></div>

                {offen>0.01&&<>
                  <label style={lbl}>Zahlungseingang erfassen</label>
                  <div style={{display:"flex",gap:8,marginBottom:11}}>
                    <input inputMode="decimal" value={modal.pay} onChange={e=>setModal({...modal,pay:e.target.value.replace(",",".")})}
                      placeholder={num(offen).toFixed(2)} style={{...inp,marginBottom:0,flex:1}}/>
                    <button onClick={()=>setModal({...modal,pay:String(num(offen))})} style={sbtn("#f3f4f6","#374151")}>voll</button>
                    <button onClick={()=>setModal({...modal,pay:String(num(inv.total*0.98))})} style={sbtn("#f3f4f6","#374151")}>Skonto</button>
                  </div>
                  <button onClick={()=>{
                      const a=Number(modal.pay)||0;if(a<=0)return;
                      save({...data,invoices:(data.invoices||[]).map(x=>x.id===inv.id
                        ?{...x,payments:[...(x.payments||[]),{amount:a,at:new Date().toISOString(),by:me.name}]}:x)});
                      setModal({...modal,pay:""});
                    }} style={{...btn("#6366f1"),width:"100%",marginBottom:9}}>Zahlung buchen</button></>}

                {offen<=0.01&&stOf(s)!=="ABGESCHLOSSEN"&&<button onClick={()=>{
                    save({...data,sites:sites.map(x=>x.id===s.id?{...x,status:"ABGESCHLOSSEN",doneAt:new Date().toISOString(),
                      statusLog:[...(x.statusLog||[]),{from:stOf(x),to:"ABGESCHLOSSEN",by:me.name,at:new Date().toISOString(),reason:`Rechnung ${inv.number} beglichen`}]}:x)});
                    setModal(null);
                  }} style={{...btn("#10b981"),width:"100%",marginBottom:9}}>🏁 Baustelle abschliessen</button>}

                <button onClick={()=>printDoc(invoiceHtml(data.company||{},s,partner,inv,g,
                    {sub:inv.total/(1+VAT/100)/(1-(inv.discountPct||0)/100),rab:0,
                     netto:inv.total/(1+VAT/100),mwst:inv.total-inv.total/(1+VAT/100),total:inv.total}))}
                  style={{...btn("#b91c1c"),width:"100%"}}>📄 PDF mit Zahlteil</button>

                {(inv.payments||[]).length>0&&<>
                  <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",margin:"16px 0 6px",letterSpacing:.5}}>ZAHLUNGEN</div>
                  {inv.payments.map((p,i)=>(
                    <div key={i} style={{...row,fontSize:11.5,color:"#6b7280",padding:"4px 0",borderBottom:"1px solid #f3f4f6"}}>
                      <span>{dFmt(p.at.slice(0,10))}, {p.by}</span><span style={{fontWeight:700}}>{chf(p.amount)}</span></div>))}
                </>}
              </>}
            </>}
          </Modal>);})()}

        {modal?.t==="offer"&&(()=>{
          const s=modal.s,lines=modal.lines;
          const sub=lines.reduce((a,l)=>a+l.amount,0);
          const rab=sub*(Number(modal.rab)||0)/100;
          const netto=sub-rab,mwst=netto*VAT/100,total=netto+mwst;
          const sums={sub,rab,netto,mwst,total};
          const prev=(data.offers||[]).filter(o=>o.siteId===s.id);
          const partner=find(partners,s.partnerId);
          const mkOffer=()=>({
            id:genId(),siteId:s.id,
            number:prev.length?prev[prev.length-1].number:`${new Date().getFullYear()}-${String((data.offers||[]).length+1).padStart(3,"0")}`,
            version:prev.length+1,createdAt:new Date().toISOString(),
            validUntil:addD(todayISO(),30),discountPct:Number(modal.rab)||0,
            lines,subtotal:sub,total,by:me.name,sentAt:null,sentTo:"",
          });
          const speichern=off=>save({...data,offers:[...(data.offers||[]),off]});
          return(
          <Modal title="Offerte" onClose={()=>setModal(null)}>
            <div style={{fontSize:13.5,fontWeight:700}}>{siteLbl(s)}</div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:12}}>{siteAddr(s)} · {partner.name||"ohne Auftraggeber"}</div>

            {lines.length===0&&<div style={errBox}>
              Keine Offertpositionen vorhanden. Erfasse zuerst im Material-Tab die Mengen,
              solange die Baustelle im Status «Offerte» steht.</div>}

            {lines.length>0&&<>
              <div style={{...card,padding:"10px 12px"}}>
                {lines.map((l,i)=>(
                  <div key={i} style={{...row,padding:"6px 0",borderBottom:"1px solid #f3f4f6",gap:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600}}>{l.desc}</div>
                      <div style={{fontSize:11,color:"#9ca3af"}}>{deNum(num(l.qty))} {l.unit} × {chf(l.price)}</div></div>
                    <span style={{fontSize:12.5,fontWeight:700,color:"#4338ca",flexShrink:0}}>{chf(l.amount)}</span>
                  </div>))}
              </div>

              <label style={lbl}>Objektrabatt in Prozent</label>
              <input type="number" min="0" max="100" value={modal.rab}
                onChange={e=>setModal({...modal,rab:e.target.value})} style={inp}/>

              <div style={{...card,background:"#f9fafb",padding:"11px 13px"}}>
                <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Zwischensumme</span><span>{chf(sub)}</span></div>
                {rab>0&&<div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>Rabatt {modal.rab} %</span><span>− {chf(rab)}</span></div>}
                <div style={{...row,fontSize:12.5,color:"#6b7280"}}><span>MwSt. {VAT} %</span><span>{chf(mwst)}</span></div>
                <div style={{...row,fontSize:16,fontWeight:800,color:"#4338ca",marginTop:5}}><span>Total</span><span>{chf(total)}</span></div>
              </div>

              <label style={lbl}>Empfänger</label>
              <input value={modal.to} onChange={e=>setModal({...modal,to:e.target.value})}
                placeholder="offerte@fluema.ch" style={inp}/>

              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={()=>{
                    const off=mkOffer();speichern(off);
                    printDoc(offerHtml(data.company||{},s,partner,off,lines,sums));
                  }} style={{...btn("#b91c1c"),flex:1,fontSize:13}}>📄 PDF</button>
                <button onClick={()=>{
                    if(!modal.to.trim())return;
                    const off={...mkOffer(),sentAt:new Date().toISOString(),sentTo:modal.to.trim()};
                    speichern(off);setModal(null);
                  }} style={{...btn(modal.to.trim()?"#107c41":"#c7cbd3"),flex:1,fontSize:13}}>✉️ Versenden</button>
              </div>
              <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.55}}>
                Jede Erstellung legt eine neue Version an, ältere bleiben erhalten.
                Der Versand ist in dieser Demo simuliert, produktiv geht die Mail über den Infomaniak Mail Service.</div>
            </>}

            {prev.length>0&&<>
              <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",margin:"16px 0 6px",letterSpacing:.5}}>BISHERIGE VERSIONEN</div>
              {[...prev].reverse().map(o=>(
                <div key={o.id} style={{fontSize:11.5,color:"#6b7280",padding:"4px 0",borderBottom:"1px solid #f3f4f6"}}>
                  {o.number} v{o.version}, {chf(o.total)}, {dFmt(o.createdAt.slice(0,10))}, {o.by}
                  {o.sentAt?<div style={{color:"#059669"}}>versendet an {o.sentTo}</div>
                    :<div style={{color:"#9ca3af"}}>nur als PDF erzeugt</div>}</div>))}
            </>}
          </Modal>);})()}

        {modal?.t==="plan"&&(()=>{
          const s=modal.s;
          const dlChanged=!!s.deadline&&modal.dl!==s.deadline;
          const konflikt=modal.team.map(id=>{
            const v=data.vacations.find(x=>x.userId===id&&x.status!=="denied"&&
              modal.ps&&modal.pe&&x.startDate<=modal.pe&&x.endDate>=modal.ps);
            return v?{name:find(emps,id).name,von:v.startDate,bis:v.endDate}:null;
          }).filter(Boolean);
          const ok=!dlChanged||modal.reason.trim();
          return(
          <Modal title="Baustelle planen" onClose={()=>setModal(null)}>
            <div style={{fontSize:13.5,fontWeight:700,marginBottom:12}}>{siteLbl(s)}</div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}><label style={lbl}>Start</label>
                <input type="date" value={modal.ps} onChange={e=>setModal({...modal,ps:e.target.value})} style={inp}/></div>
              <div style={{flex:1}}><label style={lbl}>Ende</label>
                <input type="date" value={modal.pe} onChange={e=>setModal({...modal,pe:e.target.value})} style={inp} min={modal.ps}/></div></div>

            <label style={lbl}>Termin gegenüber dem Auftraggeber</label>
            <input type="date" value={modal.dl} onChange={e=>setModal({...modal,dl:e.target.value})} style={inp}/>
            {dlChanged&&<>
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 11px",fontSize:11.5,color:"#92400e",marginBottom:9,lineHeight:1.55}}>
                Termin wird von {dFmt(s.deadline)} auf {modal.dl?dFmt(modal.dl):"leer"} geändert.
                Eine Begründung ist Pflicht und wird mit Datum und Name festgehalten.</div>
              <label style={lbl}>Begründung</label>
              <input value={modal.reason} onChange={e=>setModal({...modal,reason:e.target.value})}
                placeholder="z.B. Bauherr verschiebt Rohbau um zwei Wochen" style={inp}/></>}

            <label style={lbl}>Eingeteilte Personen</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:11}}>
              {emps.map(u=>{
                const on=modal.team.includes(u.id);
                return <button key={u.id} onClick={()=>setModal({...modal,
                  team:on?modal.team.filter(x=>x!==u.id):[...modal.team,u.id]})}
                  style={{border:on?"1.5px solid #6366f1":"1.5px solid #e5e7eb",background:on?"#eef2ff":"#fff",
                    color:on?"#4338ca":"#6b7280",borderRadius:20,padding:"8px 13px",fontSize:12.5,fontWeight:700,
                    cursor:"pointer",minHeight:38,display:"flex",alignItems:"center",gap:7}}>
                  <Ava emps={emps} id={u.id} sz={20}/>{u.name}</button>;})}
            </div>

            {konflikt.length>0&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"9px 11px",fontSize:11.5,color:"#991b1b",marginBottom:11,lineHeight:1.55}}>
              ⚠️ Ferien im geplanten Zeitraum:<br/>
              {konflikt.map((k,i)=><div key={i}>{k.name}, {dFmtS(k.von)} bis {dFmtS(k.bis)}</div>)}
              <div style={{color:"#b91c1c",marginTop:4}}>Planung ist trotzdem möglich, Baustellen verschieben sich nun einmal.</div></div>}

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{...btn("#f3f4f6","#374151"),flex:1}}>Abbrechen</button>
              <button onClick={()=>{
                  if(!ok)return;
                  const log=dlChanged
                    ?[...(s.deadlineLog||[]),{from:s.deadline,to:modal.dl,reason:modal.reason.trim(),by:me.name,at:new Date().toISOString()}]
                    :(s.deadlineLog||[]);
                  save({...data,sites:sites.map(x=>x.id===s.id?{...x,plannedStart:modal.ps,plannedEnd:modal.pe,
                    deadline:modal.dl,deadlineLog:log,assignees:modal.team}:x)});
                  setModal(null);
                }} style={{...btn(ok?"#6366f1":"#c7cbd3"),flex:1}}>Speichern</button></div>

            {(s.deadlineLog||[]).length>0&&<>
              <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",margin:"16px 0 6px",letterSpacing:.5}}>TERMINVERSCHIEBUNGEN</div>
              {[...(s.deadlineLog||[])].reverse().map((l,i)=>(
                <div key={i} style={{fontSize:11.5,color:"#6b7280",padding:"4px 0",borderBottom:"1px solid #f3f4f6"}}>
                  {dFmt(l.from)} → <b>{dFmt(l.to)}</b>, {dFmt(l.at.slice(0,10))}, {l.by}
                  <div style={{color:"#9ca3af"}}>{l.reason}</div></div>))}
            </>}
          </Modal>);})()}

        {modal?.t==="status"&&(()=>{
          const cur=stOf(modal.s),to=modal.to;
          const braucht=NEEDS_REASON.includes(to)&&ST_BACK(cur,to);
          return(
          <Modal title="Status ändern" onClose={()=>setModal(null)}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <StBadge s={modal.s}/><span style={{color:"#9ca3af",fontSize:16}}>→</span>
              <span style={{...badge(ST[to].bg,ST[to].fg),fontSize:11}}>{ST[to].ic} {ST[to].l}</span></div>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>{siteLbl(modal.s)}</div>
            <label style={lbl}>Neuer Status</label>
            <select value={to} onChange={e=>setModal({...modal,to:e.target.value})} style={inp}>
              {NEXT[cur].map(v=><option key={v} value={v}>{ST[v].l}</option>)}</select>
            <label style={lbl}>Begründung {braucht?"(erforderlich)":"(optional)"}</label>
            <input value={modal.reason||""} onChange={e=>setModal({...modal,reason:e.target.value})}
              placeholder={to==="VERLOREN"?"z.B. Preis zu hoch, Konkurrenz günstiger":"z.B. Termin bestätigt"}
              style={{...inp,marginBottom:13}}/>
            {braucht&&!modal.reason.trim()&&<div style={errBox}>Für diesen Wechsel wird eine Begründung verlangt.</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{...btn("#f3f4f6","#374151"),flex:1}}>Abbrechen</button>
              <button onClick={()=>{
                  if(braucht&&!modal.reason.trim())return;
                  const ev={from:cur,to,by:me.name,at:new Date().toISOString(),reason:modal.reason.trim()};
                  save({...data,sites:sites.map(x=>x.id===modal.s.id
                    ?{...x,status:to,doneAt:to==="ABGESCHLOSSEN"?new Date().toISOString():x.doneAt,
                      statusLog:[...(x.statusLog||[]),ev]}:x)});
                  setModal(null);
                }} style={{...btn(braucht&&!modal.reason.trim()?"#c7cbd3":"#6366f1"),flex:1}}>Übernehmen</button></div>
            {(modal.s.statusLog||[]).length>0&&<>
              <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",margin:"16px 0 6px",letterSpacing:.5}}>VERLAUF</div>
              {[...(modal.s.statusLog||[])].reverse().map((l,i)=>(
                <div key={i} style={{fontSize:11.5,color:"#6b7280",padding:"4px 0",borderBottom:"1px solid #f3f4f6"}}>
                  {ST[l.from]?.l} → <b>{ST[l.to]?.l}</b>, {dFmt(l.at.slice(0,10))}, {l.by}
                  {l.reason&&<div style={{color:"#9ca3af"}}>{l.reason}</div>}</div>))}
            </>}
          </Modal>);})()}
      </>}

      {view==="partners"&&<>
        <div style={{...sect,...row}}>
          <span>PARTNERFIRMEN</span>
          <button onClick={()=>{setErr("");setPf({id:"",name:"",contact:"",phone:""});setModal({t:"partner"});}}
            style={{...sbtn("#6366f1"),padding:"6px 11px",fontSize:11.5,minHeight:32}}>+ Neu</button>
        </div>
        <div style={{...card,marginBottom:16}}>
          {partners.length===0&&<div style={{fontSize:12.5,color:"#9ca3af"}}>Noch keine Partnerfirmen erfasst.</div>}
          {partners.map(p=>(
            <div key={p.id} onClick={()=>{setErr("");setPf({...p});setModal({t:"partner"});}}
              style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6",cursor:"pointer"}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13.5}}>{p.name}</div>
                <div style={{fontSize:11.5,color:"#6b7280"}}>
                  {[p.contact,p.phone,p.web].filter(Boolean).join(" · ")||"Keine Kontaktangaben"}</div>
                <div style={{fontSize:11,color:"#4338ca",marginTop:1}}>{sites.filter(s=>s.partnerId===p.id).length} Baustellen</div></div>
              <span style={{fontSize:11,color:"#a5b4fc",fontWeight:700}}>›</span>
            </div>))}
        </div>
      </>}

      {view==="lock"&&<>
        <div style={sect}>MONATSABSCHLUSS</div>
        <div style={{...card,marginBottom:16}}>
          {months.map(k=>{
            const lk=(data.locks||{})[k],st=monthStats(k);
            return(
              <div key={k} style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13.5}}>{mName(k)} {lk&&"🔒"}</div>
                  <div style={{fontSize:11,color:lk?"#64748b":"#9ca3af"}}>
                    {lk?lockTxt(lk):`${st.n} Einträge, ${hStr(st.h)}${st.op?`, ${st.op} Antr. offen`:""}`}</div></div>
                <button onClick={()=>setModal({t:lk?"unlock":"lock",k,st})}
                  style={lk?sbtn("#f1f5f9","#334155"):sbtn("#6366f1")}>{lk?"Öffnen":"Abschliessen"}</button>
              </div>);})}
          {(data.lockLog||[]).length>0&&<>
            <div style={{fontSize:10.5,fontWeight:800,color:"#9ca3af",margin:"13px 0 6px",letterSpacing:.5}}>PROTOKOLL</div>
            {(data.lockLog||[]).slice(0,5).map((l,i)=>(
              <div key={i} style={{fontSize:11,color:"#6b7280",padding:"3px 0"}}>
                {mName(l.month)} {l.action} von {l.by} am {dFmt(l.at.slice(0,10))}</div>))}</>}
        </div>
      </>}

      {view==="team"&&<>
        <div style={{...sect,...row}}>
          <span>MITARBEITENDE · FERIEN {yr}</span>
          <button onClick={()=>{setEf({id:"",name:"",role:"employee",vacationDays:25});setModal({t:"emp"});}}
            style={{...sbtn("#6366f1"),padding:"6px 11px",fontSize:11.5,minHeight:32}}>+ Neu</button>
        </div>
        {emps.map(u=>{
          const used=usedOf(u.id),pend=pendOf(u.id),an=u.vacationDays??0;
          return(
            <div key={u.id} style={{...card,cursor:"pointer"}} onClick={()=>{setEf({...u});setModal({t:"emp"});}}>
              <div style={{...row,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><Ava emps={emps} id={u.id} sz={36}/>
                  <div><div style={{fontWeight:700,fontSize:14.5}}>{u.name}{u.role==="admin"&&" 🔒"}</div>
                    <div style={{fontSize:11.5,color:"#6b7280"}}>{u.role==="admin"?"Admin":"Mitarbeitende"}</div></div></div>
                <span style={{fontSize:11,color:"#a5b4fc",fontWeight:700}}>bearbeiten ›</span></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                {[["Anspr.",an,"#374151"],["Bezogen",used,"#374151"],["Offen",pend,"#b45309"],["Rest",an-used,"#6366f1"]].map(([l,v,c])=>(
                  <div key={l} style={{background:"#f9fafb",borderRadius:9,padding:"8px 3px",textAlign:"center"}}>
                    <div style={{fontSize:9.5,color:"#6b7280",fontWeight:600}}>{l}</div>
                    <div style={{fontWeight:800,fontSize:15,color:c}}>{v}</div></div>))}</div>
            </div>);})}
      </>}

      {view==="access"&&<>
        <div style={sect}>ZUGÄNGE UND SICHERHEIT</div>
        <div style={{...card,marginBottom:16}}>
          {emps.map(u=>{
            const a=(data.auth||{})[u.id];
            const txt=!a?"Noch nicht eingerichtet":!a.hash?"Passwort zurückgesetzt, wartet auf neues"
              :!a.totp?"MFA zurückgesetzt, wartet auf Einrichtung"
              :`Passwort + MFA aktiv, ${(a.recovery||[]).length} Codes offen`;
            return(
              <div key={u.id} style={{...row,padding:"9px 0",borderBottom:"1px solid #f3f4f6"}}>
                <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                  <Ava emps={emps} id={u.id} sz={28}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13.5}}>{u.name}</div>
                    <div style={{fontSize:11,color:a?.hash&&a?.totp?"#6b7280":"#b45309"}}>{txt}</div></div></div>
                {a&&<button onClick={()=>{setRsel({pw:true,mfa:true});setModal({t:"reset",u});}} style={sbtn("#fee2e2","#991b1b")}>Reset</button>}
              </div>);})}
        </div>
      </>}

      {view==="export"&&<>
        <div style={sect}>EXPORT</div>
        <div style={card}>
          <label style={lbl}>Zeitraum</label>
          <Seg opts={[["monat","Monat"],["jahr","Jahr"],["range","Zeitspanne"]]} val={mode} set={setMode}/>
          {mode==="monat"&&<div style={{display:"flex",gap:8}}>
            <select value={mth} onChange={e=>setMth(Number(e.target.value))} style={{...inp,flex:2}}>{MONATE.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
            <select value={eyr} onChange={e=>setEyr(Number(e.target.value))} style={{...inp,flex:1}}>{[yr-2,yr-1,yr,yr+1].map(y=><option key={y} value={y}>{y}</option>)}</select></div>}
          {mode==="jahr"&&<select value={eyr} onChange={e=>setEyr(Number(e.target.value))} style={inp}>{[yr-2,yr-1,yr,yr+1].map(y=><option key={y} value={y}>{y}</option>)}</select>}
          {mode==="range"&&<div style={{display:"flex",gap:8}}>
            <div style={{flex:1}}><label style={lbl}>Von</label><input type="date" value={rs} onChange={e=>setRs(e.target.value)} style={inp}/></div>
            <div style={{flex:1}}><label style={lbl}>Bis</label><input type="date" value={re} onChange={e=>setRe(e.target.value)} style={inp}/></div></div>}
          <label style={lbl}>Umfang</label>
          <Seg opts={[["summary","Zusammenfassung"],["detail","Detailliert"]]} val={scope} set={setScope}/>
          <button onClick={openExport} style={{...btn("#6366f1"),width:"100%"}}>📤 Auszug erstellen</button>
        </div>
        <div style={sect}>FEIERTAGE KANTON LUZERN {yr}</div>
        <div style={{...card,marginBottom:18}}>
          <div style={{...badge(holSrc.includes("Live")?"#d1fae5":"#fef3c7",holSrc.includes("Live")?"#065f46":"#92400e"),marginBottom:9}}>Quelle: {holSrc}</div>
          {feiertageLU(yr).map(([d])=>[d,HOL[d]]).filter(([,n])=>n).map(([d,n])=>(
            <div key={d} style={{...row,padding:"6px 0",borderBottom:"1px solid #f3f4f6"}}>
              <span style={{fontSize:13,color:"#374151"}}>{n}</span>
              <span style={{fontSize:12.5,color:"#6b7280",fontWeight:700}}>{dFmt(d)}</span></div>))}
        </div>
      </>}

      {exp&&<ExportView title={exp.title} sheets={exp.sheets} holSrc={holSrc} onClose={()=>setExp(null)}/>}

      {modal?.t==="site"&&<Modal title={sf.id?"Baustelle bearbeiten":"Neue Baustelle"} onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <label style={lbl}>Objektname (optional)</label>
        <input value={sf.name} onChange={e=>setSf({...sf,name:e.target.value})} placeholder="z.B. MFH Sonnenhof" style={inp}/>
        <label style={lbl}>Adresse mit Hausnummer</label>
        <input value={sf.street} onChange={e=>{setSf({...sf,street:e.target.value});setErr("");}} placeholder="Bahnhofstrasse 12" style={inp}/>
        <div style={{display:"flex",gap:8}}>
          <div style={{width:"38%"}}><label style={lbl}>PLZ</label>
            <input inputMode="numeric" value={sf.zip} onChange={e=>{setSf({...sf,zip:e.target.value});setErr("");}} placeholder="6003" style={inp}/></div>
          <div style={{flex:1}}><label style={lbl}>Ort</label>
            <input value={sf.city} onChange={e=>setSf({...sf,city:e.target.value})} placeholder="Luzern" style={inp}/></div></div>
        <label style={lbl}>Partnerfirma</label>
        <select value={sf.partnerId} onChange={e=>setSf({...sf,partnerId:e.target.value})} style={inp}>
          <option value="">Keine</option>
          {partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label style={lbl}>Soll-Stunden</label>
        <input type="number" min="0" step="1" value={sf.sollH} onChange={e=>setSf({...sf,sollH:e.target.value})} style={inp}/>
        <Check on={sf.active!==false} onClick={()=>setSf({...sf,active:!(sf.active!==false)})}
          title="Aktiv" sub="Nur aktive Baustellen erscheinen bei der Zeiterfassung"/>
        <div style={{display:"flex",gap:8,marginTop:5}}>
          <button onClick={saveSite} style={{...btn("#6366f1"),flex:1}}>Speichern</button>
          {sf.id&&<button onClick={()=>delSite(sf.id)} style={btn("#ef4444")}>🗑</button>}</div>
        {sf.id&&<div style={{fontSize:11,color:"#9ca3af",marginTop:9}}>Beim Löschen bleiben die Zeiteinträge bestehen, verlieren aber die Baustellenzuordnung.</div>}
      </Modal>}

      {modal?.t==="partner"&&<Modal title={pf.id?"Partnerfirma bearbeiten":"Neue Partnerfirma"} onClose={()=>setModal(null)}>
        {err&&<div style={errBox}>{err}</div>}
        <label style={lbl}>Firmenname</label>
        <input value={pf.name} onChange={e=>{setPf({...pf,name:e.target.value});setErr("");}} placeholder="z.B. Bauwerk AG" style={inp}/>
        <label style={lbl}>Adresse / Ansprechperson (optional)</label>
        <input value={pf.contact||""} onChange={e=>setPf({...pf,contact:e.target.value})} placeholder="Industriestrasse 8, 6030 Ebikon" style={inp}/>
        <label style={lbl}>Telefon (optional)</label>
        <input value={pf.phone||""} onChange={e=>setPf({...pf,phone:e.target.value})} style={inp}/>
        <label style={lbl}>Webseite (optional)</label>
        <input value={pf.web||""} onChange={e=>setPf({...pf,web:e.target.value})} placeholder="firma.ch" style={{...inp,marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={savePartner} style={{...btn("#6366f1"),flex:1}}>Speichern</button>
          {pf.id&&<button onClick={()=>delPartner(pf.id)} style={btn("#ef4444")}>🗑</button>}</div>
      </Modal>}

      {modal?.t==="lock"&&<Modal title="Monat abschliessen" onClose={()=>setModal(null)}>
        <div style={{fontSize:13,color:"#374151",lineHeight:1.6,marginBottom:11}}>
          <b>{mName(modal.k)}</b> wird gesperrt. Danach kann niemand mehr Zeiten oder Absenzen in diesem Monat ändern.</div>
        <div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",fontSize:12.5,color:"#374151",marginBottom:11}}>
          {modal.st.n} Zeiteinträge, {hStr(modal.st.h)} netto</div>
        {modal.st.op>0&&<div style={errBox}>⚠️ {modal.st.op} Ferienantrag/Anträge sind noch offen.</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setModal(null)} style={{...btn("#f3f4f6","#374151"),flex:1}}>Abbrechen</button>
          <button onClick={()=>setLock(modal.k,true)} style={{...btn("#6366f1"),flex:1}}>Abschliessen</button></div>
      </Modal>}

      {modal?.t==="unlock"&&<Modal title="Monat wieder öffnen" onClose={()=>setModal(null)}>
        <div style={{fontSize:13,color:"#374151",lineHeight:1.6,marginBottom:11}}>
          <b>{mName(modal.k)}</b> wird wieder bearbeitbar. Das wird im Protokoll mit deinem Namen festgehalten.</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setModal(null)} style={{...btn("#f3f4f6","#374151"),flex:1}}>Abbrechen</button>
          <button onClick={()=>setLock(modal.k,false)} style={{...btn("#ef4444"),flex:1}}>Öffnen</button></div>
      </Modal>}

      {modal?.t==="reset"&&<Modal title="Zugang zurücksetzen" onClose={()=>setModal(null)}>
        <div style={{fontSize:13,color:"#374151",lineHeight:1.6,marginBottom:12}}>
          Was soll für <b>{modal.u.name}</b> zurückgesetzt werden?</div>
        <Check on={rsel.pw} onClick={()=>setRsel({...rsel,pw:!rsel.pw})}
          title="🔑 Passwort" sub="Person setzt beim nächsten Anmelden ein neues Passwort, der Authenticator bleibt"/>
        <Check on={rsel.mfa} onClick={()=>setRsel({...rsel,mfa:!rsel.mfa})}
          title="📱 Zwei-Faktor (MFA)" sub="Authenticator-Schlüssel und Wiederherstellungscodes werden gelöscht"/>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 11px",fontSize:11.5,color:"#92400e",marginBottom:13}}>
          Vorher die Identität der Person persönlich prüfen. Zeiteinträge und Absenzen bleiben unverändert.</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setModal(null)} style={{...btn("#f3f4f6","#374151"),flex:1}}>Abbrechen</button>
          <button onClick={()=>applyReset(modal.u)} disabled={!rsel.pw&&!rsel.mfa}
            style={{...btn(!rsel.pw&&!rsel.mfa?"#c7cbd3":"#ef4444"),flex:1}}>Zurücksetzen</button></div>
      </Modal>}

      {modal?.t==="emp"&&<Modal title={ef.id?"Person bearbeiten":"Person hinzufügen"} onClose={()=>setModal(null)}>
        <label style={lbl}>Name</label>
        <input value={ef.name} onChange={e=>setEf({...ef,name:e.target.value})} placeholder="Name" style={inp}/>
        <label style={lbl}>Rolle</label>
        <select value={ef.role} onChange={e=>setEf({...ef,role:e.target.value})} style={inp}>
          <option value="employee">Mitarbeitende</option><option value="admin">Admin / Vorgesetzte</option></select>
        <label style={lbl}>Ferienanspruch pro Jahr (Tage)</label>
        <input type="number" min="0" max="60" value={ef.vacationDays} onChange={e=>setEf({...ef,vacationDays:e.target.value})} style={inp}/>
        <label style={lbl}>Regietarif</label>
        <select value={ef.regieTariff||"A"} onChange={e=>setEf({...ef,regieTariff:e.target.value})} style={inp}>
          <option value="A">Isoleur A ({chf((data.company||{}).regieA??84)} / h)</option>
          <option value="B">Isoleur B ({chf((data.company||{}).regieB??76)} / h)</option></select>
        <div style={{fontSize:11,color:"#9ca3af",marginTop:-4,marginBottom:14,lineHeight:1.5}}>
          Gilt für Stunden, die auf einer Baustelle als Regiearbeit gekennzeichnet sind. Die Ansätze änderst du unter Firma.</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={saveEmp} style={{...btn("#6366f1"),flex:1}}>Speichern</button>
          {ef.id&&emps.length>1&&<button onClick={()=>delEmp(ef.id)} style={btn("#ef4444")}>🗑</button>}</div>
      </Modal>}
    </div>
  );
}

const PRINT_CSS=`
*{-webkit-tap-highlight-color:transparent}
input,select,textarea{font-family:inherit}
#printArea{display:none}
@media print{
  body *{visibility:hidden!important}
  #printArea,#printArea *{visibility:visible!important}
  #printArea{display:block!important;position:absolute;left:0;top:0;width:100%}
  @page{size:A4 landscape;margin:12mm}
}
#printArea .doc{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;font-size:10pt}
#printArea .logo{width:200px;margin-bottom:10px}
#printArea .logoimg{width:190px;height:auto;margin-bottom:10px;display:block}
#printArea .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0d6ab5;padding-bottom:8px;margin-bottom:14px}
#printArea h1{font-size:16pt;margin:0}
#printArea .sub{font-size:11pt;color:#4b5563}
#printArea .meta{font-size:9pt;color:#6b7280}
#printArea h2{font-size:11pt;margin:16px 0 6px}
#printArea table{width:100%;border-collapse:collapse;font-size:9pt}
#printArea th{background:#eef2ff;text-align:left;padding:5px 7px;border:1px solid #c7d2fe}
#printArea td{padding:4px 7px;border:1px solid #e5e7eb}
#printArea .ft{margin-top:14px;font-size:8pt;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:6px}
#printArea table.meta2{width:100%;margin-bottom:14px;border:none;font-size:9pt}
#printArea table.meta2 td{border:none;padding:0 14px 0 0;vertical-align:top;width:50%}
#printArea table.sum{width:52%;margin:12px 0 0 auto;font-size:9.5pt}
#printArea table.sum td{border:none;padding:3px 7px}
#printArea table.sum tr.tot td{border-top:2px solid #0d6ab5;font-weight:700;font-size:11pt}
#printArea tr.grp td{background:#f1f5f9;font-weight:700;font-size:9pt}
#printArea .pay{display:flex;gap:16px;margin-top:22px;border-top:2px dashed #9ca3af;padding-top:12px}
#printArea .qr{width:105px;height:105px;border:2px solid #111;display:flex;flex-direction:column;
  align-items:center;justify-content:center;font-size:14pt;font-weight:700;flex-shrink:0}
#printArea .qr span{font-size:7pt;font-weight:400}
#printArea .payinfo{font-size:8.5pt;line-height:1.5}
`;

let lastScroll=0;

export default function App(){
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("dash");
  const [navMin,setNavMin]=useState(false);
  const onScroll=e=>{
    const t=e&&e.target;
    let y=t&&typeof t.scrollTop==="number"?t.scrollTop:0;
    if(!y)y=window.scrollY||document.documentElement.scrollTop||0;
    if(y<40)setNavMin(false);
    else if(y>lastScroll+5)setNavMin(true);
    else if(y<lastScroll-5)setNavMin(false);
    lastScroll=y;
  };
  useEffect(()=>{
    const h=e=>onScroll(e);
    window.addEventListener("scroll",h,true);
    document.addEventListener("scroll",h,true);
    window.addEventListener("wheel",h,{passive:true});
    window.addEventListener("touchmove",h,{passive:true});
    return()=>{
      window.removeEventListener("scroll",h,true);
      document.removeEventListener("scroll",h,true);
      window.removeEventListener("wheel",h);
      window.removeEventListener("touchmove",h);
    };
  },[]);
  const goTab=id=>{setTab(id);setNavMin(false);lastScroll=0;};
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [holSrc,setHolSrc]=useState("Berechnet (Offline-Fallback)");
  const [,tick]=useState(0);

  useEffect(()=>{(async()=>{
    try{const r=await window.storage.get("isoteam_v12");
      const d=r?JSON.parse(r.value):genSample(DEFAULT_EMPS);
      if(!d.auth)d.auth={};if(!d.locks)d.locks={};if(!d.lockLog)d.lockLog=[];
      if(!d.partners||!d.partners.length)d.partners=DEFAULT_PARTNERS;if(!d.sites)d.sites=DEFAULT_SITES;
      if(!d.siteMat)d.siteMat=[];
      if(!d.offers)d.offers=[];
      if(!d.invoices)d.invoices=[];
      // Preisliste 2024: Katalog erneuern, sobald die alte Fassung erkannt wird
      if(!d.materials||!d.materials.length||!d.materials.some(m=>m.sku==="ALU-GS")){
        d.materials=DEFAULT_MATERIALS;
        d.categories=DEFAULT_CATS;
        d.siteMat=sampleBookings(d.employees||DEFAULT_EMPS);
      }
      if(!d.categories||!d.categories.length)d.categories=DEFAULT_CATS;
      setData(d);}
    catch{setData(genSample(DEFAULT_EMPS));}
    setLoading(false);
  })();},[]);

  useEffect(()=>{(async()=>{
    const y=new Date().getFullYear();
    try{
      const r=await fetch(`https://openholidaysapi.org/PublicHolidays?countryIsoCode=CH&subdivisionCode=CH-LU&languageIsoCode=DE&validFrom=${y-1}-01-01&validTo=${y+2}-12-31`,{headers:{accept:"application/json"}});
      if(!r.ok)throw new Error();
      const j=await r.json();
      if(Array.isArray(j)&&j.length){
        const o={};j.forEach(h=>{o[h.startDate]=(h.name?.find(n=>n.language==="DE")||h.name?.[0])?.text||"Feiertag";});
        mergeHol(o);setHolSrc("OpenHolidays API (Live)");tick(x=>x+1);
      }
    }catch{setHolSrc("Berechnet (Offline-Fallback)");}
  })();},[]);

  const save=async d=>{setData({...d});try{await window.storage.set("isoteam_v12",JSON.stringify(d));}catch{}};
  const saveAuth=async(uid,entry)=>{await save({...data,auth:{...(data.auth||{}),[uid]:entry}});};

  if(loading)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#6b7280",fontSize:14}}>Wird geladen...</div>;
  if(!user)return <><style>{PRINT_CSS}</style><div id="printArea"/>
    <Login emps={data.employees} auth={data.auth||{}} onLogin={u=>{setUser(u);setTab("dash");}} onSaveAuth={saveAuth}/></>;

  const me=find(data.employees,user.id);
  const isAdmin=me.role==="admin";
  const tabs=[{id:"dash",icon:"🏠",lbl:"Start"},{id:"log",icon:"🕐",lbl:"Zeiten"},{id:"cal",icon:"📅",lbl:"Kalender"},
    {id:"abs",icon:"🌴",lbl:"Absenzen"},{id:"mat",icon:"📦",lbl:"Material"},...(isAdmin?[{id:"adm",icon:"⚙️",lbl:"Admin"}]:[])];

  return (
    <div style={{height:"100%",maxHeight:"100vh",display:"flex",flexDirection:"column",background:"#f7f8fa",position:"relative",overflow:"hidden"}}>
      <style>{PRINT_CSS}</style>
      <div id="printArea"/>
      <div style={{background:"#6366f1",color:"#fff",padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}><Mark s={32}/>
          <div style={{lineHeight:1.15}}><div style={{fontWeight:800,fontSize:16,letterSpacing:-.3}}>IsoPilot</div>
          <div style={{fontSize:10,opacity:.85,fontWeight:600}}>Cockpit</div></div></div>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <span style={{fontSize:12,opacity:.9}}>{me.name}{isAdmin&&" 🔒"}</span>
          <button onClick={()=>{setUser(null);setTab("dash");}} style={{background:"rgba(255,255,255,.22)",border:"none",color:"#fff",borderRadius:9,padding:"8px 11px",fontSize:11.5,cursor:"pointer",fontWeight:700,minHeight:36}}>Abmelden</button>
        </div>
      </div>
      <div key={tab} onScroll={onScroll} style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",
        paddingBottom:navMin?50:78,transition:"padding-bottom .18s ease"}}>
        {tab==="dash"&&<Dash user={me} data={data} save={save} isAdmin={isAdmin} go={goTab}/>}
        {tab==="log"&&<TimeLog user={me} data={data} save={save} isAdmin={isAdmin}/>}
        {tab==="cal"&&<Kalender user={me} data={data}/>}
        {tab==="abs"&&<Absenzen user={me} data={data} save={save} isAdmin={isAdmin}/>}
        {tab==="mat"&&<Material user={me} data={data} save={save} isAdmin={isAdmin}/>}
        {tab==="adm"&&isAdmin&&<Admin me={me} data={data} save={save} holSrc={holSrc}/>}
      </div>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(6px)",
        borderTop:"1px solid #e8eaed",display:"flex",zIndex:50,padding:navMin?"3px 4px 4px":"4px 4px 6px",
        boxShadow:navMin?"0 -2px 10px rgba(0,0,0,.06)":"none",transition:"padding .2s ease"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>goTab(t.id)} style={{flex:1,border:"none",background:tab===t.id?"#eef2ff":"transparent",cursor:"pointer",
            padding:navMin?"2px 2px":"7px 2px",borderRadius:12,minHeight:navMin?32:52,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:navMin?0:3,transition:"min-height .2s ease, padding .2s ease"}}>
            <span style={{fontSize:navMin?14:18,lineHeight:1,opacity:tab===t.id?1:.6,transition:"font-size .2s ease"}}>{t.icon}</span>
            {!navMin&&<span style={{fontSize:10,fontWeight:700,color:tab===t.id?"#6366f1":"#9ca3af"}}>{t.lbl}</span>}
            {navMin&&tab===t.id&&<span style={{width:12,height:2.5,background:"#6366f1",borderRadius:2,marginTop:2}}/>}
          </button>))}
      </div>
    </div>
  );
}
