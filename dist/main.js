(()=>{"use strict";class e{static WEEKDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];static MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];static MONTHS_FULL=["January","February","March","April","May","June","July","August","September","October","November","December"];static startWeek=1;static timezone=3;static initLocale(t=3,a=1){e.timezone=t,e.startWeek=a}static getDayMonthWeekday(e){const t=new Date(1e3*e);return{day:t.getDate(),month:t.getMonth(),weekday:t.getDay()}}static getWeekday(e){return new Date(1e3*e).getDay()}static getBegintWeekTimestamp(t){const a=new Date(1e3*t);a.setHours(0,0,0,0);const n=a.getDate();let c=a.getDay()-e.startWeek;return c<0&&(c+=7),a.setDate(n-c)/1e3}static getBeginDayTimestamp=e=>new Date(1e3*e).setHours(0,0,0,0)/1e3;static getEndDayTimestamp=t=>86400*~~((t+3600*e.timezone)/86400)-3600*e.timezone+86399;static getTime=t=>t-e.getBeginDayTimestamp(t);static getTimeToEndDay=t=>e.getBeginDayTimestamp(t)+86399-t;static getDifferenceInDays=(t,a)=>(e.getBeginDayTimestamp(a)-e.getBeginDayTimestamp(t))/86400;static getTimeString(e){const t=new Date(1e3*e),a=t.getUTCHours(),n=t.getUTCMinutes();return a+(n>9?":":":0")+n}static getYYYYMMDD(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,c=t.getDate();return a+(n>9?"-":"-0")+n+(c>9?"-":"-0")+c}static getHHMM(e){const t=new Date(1e3*e),a=t.getHours(),n=t.getMinutes();return(a>9?"":"0")+a+(n>9?":":":0")+n}static getYYYYMMDDTHHMM(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,c=t.getDate(),r=t.getHours(),l=t.getMinutes();return a+(n>9?"-":"-0")+n+(c>9?"-":"-0")+c+(r>9?"T":"T0")+r+(l>9?":":":0")+l}static HHMMToSeconds(e){if(!e)return 0;const[t,a]=e.split(":",2);return console.log("hhmm",t,a),60*(60*t+ +a)}static DDHHMMToSeconds(t){const[a,n]=t.split("d",2);return console.log(t,a,n),void 0===n?e.HHMMToSeconds(a):86400*a+e.HHMMToSeconds(n)}static HHMMFromSeconds(e){if(null===e)return"";const t=~~(e%3600/60);return~~(e/3600)+(t>9?":":":0")+t}static DDHHMMFromSeconds(t){if(t<0)return"";const a=~~(t/86400);return(a<1?"":a+"d ")+e.HHMMFromSeconds(t%86400)}}function t({timestamp:t,dayHeight:a,actualBalance:n,plannedBalance:c,plannedBalanceChange:r,onAddEvent:l=(()=>{}),children:s=null}){const i=React.useRef(null),{day:d,month:o}=e.getDayMonthWeekday(t),m=e=>(e/1e3).toFixed(1);return React.createElement("div",{className:"CalendarDay_afb7130",style:{height:a},onClick:function(e){i&&i.current.focus()}},React.createElement("div",{className:"CalendarDayHeader_ce37fdc"},d+(1==d?" "+e.MONTHS[o]:"")),React.createElement("div",{className:"balance_c271232"},React.createElement("span",{className:"plannedBalance_dee8e33"},m(c)+(0==r?"k":((u=r/1e3)>0?"+"+u.toFixed(1):u.toFixed(1))+"k"))," ",React.createElement("span",{className:"actualBalance_c28974d"},m(n))),React.createElement("div",{className:"CalendarDayTasks"}," ",s," "),React.createElement("div",{className:"DayTaskInput_c3fce47"},React.createElement("input",{ref:i,rows:1,wrap:"off",onBlur:function(e){l(t,e.target.value),e.target.value=""},onKeyDown:function(e){13===e.keyCode&&e.target.blur()}})));var u}const a={item:"item_bb964bd",completed:"completed_b30da5e",event_row:"event_row_c1f0c4e",complete_button:"complete_button_a23d2b0",EventPlaceholder:"EventPlaceholder_b109d15",time:"time_c10a237"};function n({event:t,days:n,onClick:c=((e,t)=>{})}){const{id:r,name:l,completed:s,background:i,color:d}=t;return React.createElement("div",{className:a.item,style:{width:1==n?"calc(100% + 2px)":"calc("+n+" * (100% + 1px) + 1px )",backgroundColor:i,color:d},onClick:e=>{e.stopPropagation(),c(r,s)}},s&&React.createElement("div",{className:a.completed}),React.createElement("div",{className:a.event_row},React.createElement("div",{className:a.complete_button},s?"✔":"☐"),React.createElement("span",{className:a.name},l),React.createElement("span",{className:a.time},e.HHMMFromSeconds(t.time))))}function c(){return React.createElement("div",{className:a.EventPlaceholder})}function r(e,t,a=31,n=1){const[c,r=null]=t.split("-",2);if(null===r){const[c,r=null]=t.split("/",2);if(""===c||""===r)return e;const l="*"===c?n:+c;let s=+r;if(isNaN(l)||isNaN(s))return e;if(null===r&&"*"!==c)return e.push(+c),e;0===s&&(s=1);for(let t=l;t<=a;t+=s)e.push(t);return e}if(""===c||""===r)return e;for(let t=+c;t<=+r;t++)e.push(t);return e}const l=(e,t,a)=>({id:e.id,name:e.name,background:e.background,color:e.color,start:e.start,time:e.time,end:e.end,days:Math.ceil((e.end-t)/86400),credit:e.credit,debit:e.debit,completed:a}),s=t=>{const a=e.getBeginDayTimestamp(new Date(t.start)/1e3),n=t.time?e.HHMMToSeconds(t.time):null,c=t.duration?e.DDHHMMToSeconds(t.duration):0;if(console.log(c),t.repeat)return{name:t.name,comment:t.comment??"",project:t.project??"",repeat:t.repeat,start:a,time:n,duration:c,repeatEnd:t.repeatEnd?e.getBeginDayTimestamp(new Date(t.repeatEnd)/1e3):0,credit:t.credit??0,debit:t.debit??0};const r=c?(null!==n?a+n:a)+c:t.end?e.getBeginDayTimestamp(new Date(t.end)/1e3):a+86400;return{name:t.name,comment:t.comment??"",project:t.project??"",start:a,time:n,duration:c,end:r,credit:t.credit??0,debit:t.debit??0}};class i{static default_background="lightgray";static default_color="black";constructor(e,t,a){this.cachedPlannedEvents=[],this.cachedCompletedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastId=1,this.projects=[...a],this.completed=e.map((e=>{const t=s(e),a=t.project?this.projects.find((e=>e.name===t.project)):{name:"",background:i.default_background,color:i.default_color};return{id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,start:t.start,time:t.time,duration:t.duration,end:t.end,days:Math.ceil((t.end-t.start)/86400),credit:t.credit,debit:t.debit}})),this.planned=[],this.plannedRepeatable=[],t.forEach((e=>{const t=s(e),a=t.project?this.projects.find((e=>e.name===t.project)):{name:"",background:i.default_background,color:i.default_color};t.repeat?this.plannedRepeatable.push({id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,repeat:t.repeat,repeatStart:t.start,time:t.time,duration:t.duration,repeatEnd:t.repeatEnd,days:1,credit:t.credit,debit:t.debit}):this.planned.push({id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,start:t.start,time:t.time,duration:t.duration,end:t.end,days:Math.ceil((t.end-t.start)/86400),credit:t.credit,debit:t.debit})})),this.sort(),this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed[this.completed.length-1].start,this.firstActualBalanceDate=this.completed[0].start}sort(){this.completed.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.planned.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.plannedRepeatable.sort(((e,t)=>e.time-t.time))}calculateActualBalance(){return this.completed.reduce(((e,t)=>e+(t.credit-t.debit)),0)}getPlannedEvents(t){if(void 0!==this.cachedPlannedEvents[t])return this.cachedPlannedEvents[t];const a=this.planned.reduce(((e,a)=>(t<a.start||t>=a.end||e.push(l(a,t,!1)),e)),[]);return this.plannedRepeatable.reduce(((a,n)=>(t<n.repeatStart||n.repeatEnd&&t+n.time>=n.repeatEnd||class{static isMatch(t,a,n){const{day:c,month:l,weekday:s}=e.getDayMonthWeekday(n),[i=null,d="*",o="*"]=t.trim().split(" ",3);if(null===i)return!1;if("/"===i[0]){const t=~~((n-e.getBeginDayTimestamp(a))/86400);return!(t<0)&&t%+i.substring(1)==0}const m=i.split(",").reduce(((e,t)=>r(e,t)),[]),u=d.split(",").reduce(((e,t)=>r(e,t,12)),[]),p=o.split(",").reduce(((e,t)=>r(e,t,7,0)),[]);return!!(u.includes(l+1)&&m.includes(c)&&p.includes(s))}}.isMatch(n.repeat,n.repeatStart,t)&&a.push(l(((e,t,a)=>({id:e,name:t.name,comment:t.comment,project:t.project,background:t.background,color:t.color,start:a,time:t.time,end:a+86400,days:1,credit:t.credit,debit:t.debit}))(n.id,n,t),t,!1)),a)),a),this.cachedPlannedEvents[t]=a,a}getCompletedEvents(e){if(void 0!==this.cachedCompletedEvents[e])return this.cachedCompletedEvents[e];const t=this.completed.reduce(((t,a)=>(e>=a.start&&e<a.end&&t.push(l(a,e,!0)),t)),[]);return this.cachedCompletedEvents[e]=t,t}getEventsWithPlaceholders(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();return t.forEach((e=>a.push({id:-1}))),this.getPlannedEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a),this.getCompletedEvents(e).reduce(((e,t)=>(e.push(t),e)),a),a}getPlannedEventsFilteredBySkip(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();this.getPlannedEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a)}getPlannedEventsInInterval(e,t){const a=[],n=[];for(let c=e;c<t;c+=86400)this.getPlannedEventsFilteredBySkip(c,n,a);return a}getActualBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e>=this.lastActualBalanceDate)return this.lastActualBalance;if(void 0!==this.cachedActualBalance[e])return this.cachedActualBalance[e];const t=this.completed.reduce(((t,a)=>(e>a.start+a.time&&(t+=a.credit-a.debit),t)),0);return this.cachedActualBalance[e]=t,t}getPlannedBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e<this.lastActualBalanceDate)return this.getActualBalance(e);if(void 0!==this.cachedPlannedBalance[e])return this.cachedPlannedBalance[e];const t=this.getPlannedEventsInInterval(this.lastActualBalanceDate,e).reduce(((e,t)=>e+(t.credit-t.debit)),this.lastActualBalance);return this.cachedPlannedBalance[e]=t,t}getPlannedBalanceChange(e){return this.getPlannedEvents(e).reduce(((e,t)=>e+(t.credit-t.debit)),0)}prepareToStorage(){const t=this.completed.map((t=>{const a={};return a.name=t.name,t.comment&&(a.comment=t.comment),a.start=e.getYYYYMMDD(t.start),null!==t.time&&(a.time=e.HHMMFromSeconds(t.time)),t.duration?a.duration=e.DDHHMMFromSeconds(t.duration):a.end=e.getYYYYMMDD(t.end),t.credit&&(a.credit=t.credit),t.debit&&(a.debit=t.debit),a})),a=this.plannedRepeatable.reduce(((t,a)=>{const n={};return n.name=a.name,a.comment&&(n.comment=a.comment),n.repeat=a.repeat,n.start=e.getYYYYMMDD(a.repeatStart),null!==a.time&&(n.time=e.HHMMFromSeconds(a.time)),a.duration&&(n.duration=e.DDHHMMFromSeconds(a.duration)),a.repeatEnd&&(n.repeatEnd=e.getYYYYMMDD(a.repeatEnd)),a.credit&&(n.credit=a.credit),a.debit&&(n.debit=a.debit),t.push(n),t}),[]);return this.planned.reduce(((t,a)=>{const n={};return n.name=a.name,a.comment&&(n.comment=a.comment),n.start=e.getYYYYMMDD(a.start),null!==a.time&&(n.time=e.HHMMFromSeconds(a.time)),a.duration?n.duration=e.DDHHMMFromSeconds(a.duration):n.end=e.getYYYYMMDD(a.end),a.credit&&(n.credit=a.credit),a.debit&&(n.debit=a.debit),t.push(n),t}),a),{completedList:t,plannedList:a}}}const d=new i([{name:"НО +30000",project:"Доход",credit:52683,comment:"начальный остаток",start:"2022-01-01"}],[{name:"ЗП +40020",project:"Доход",credit:40020,repeat:"10,25 * *",start:"2021-12-01",time:"10:00",duration:"0:20"},{name:"пенсия мамы",project:"Доход",credit:31e3,repeat:"17",start:"2021-12-01",time:"9:00",duration:"0:20"},{name:"заправка",project:"Машина",debit:2500,repeat:"/6",start:"2022-01-12",time:"8:00",duration:"0:30"},{name:"купить продукты",project:"Общий",debit:8e3,repeat:"* * 0",start:"2022-01-04",time:"19:00",duration:"0:80"},{name:"маму на укол",debit:4e4,start:"2022-02-05",time:"10:00",duration:"1:20"},{name:"тест2",start:"2022-02-05",duration:"0:80"},{name:"четные",repeat:"2/2",repeatEnd:"2022-01-16",start:"2021-11-01"},{name:"комплексные",repeat:"1/3,20-25",start:"2021-11-01"},{name:"дорога на работу",cost:0,repeat:"* * 1-5",start:"2021-11-01",time:"8:00",duration:"1:00"},{name:"работа",project:"Рутина",cost:0,repeat:"* * 1-5",start:"2021-11-01",time:"9:00",duration:"9:00"},{name:"праздники",cost:0,start:"2021-12-31",end:"2022-01-19"},{name:"test",cost:0,start:"2022-01-14",duration:"34:00"},{name:"отпуск",cost:0,start:"2022-01-07",duration:"14d"}],[{name:"Общий",background:"blue",color:"white"},{name:"Доход",background:"red",color:"white"},{name:"Машина",background:"violet",color:"white"},{name:"Дача",background:"yellow",color:"black"},{name:"Рутина",background:"gray",color:"white"}]);function o({isOpen:e=!1,onSubmit:t=(()=>{}),onCancel:a=(()=>{}),children:n=null}){return e&&React.createElement("div",{className:"modalOverlay_faa7164",onClick:a},React.createElement("div",{className:"modalWindow_fac41c2",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"modalBody_a8134eb"},n),React.createElement("div",{className:"modalFooter_dcf803f"},React.createElement("span",{className:"cancel_b0d96c0",onClick:a},"Cancel"),React.createElement("span",{className:"apply_dc7f5d7",onClick:t},"Apply"))))}function m(){return m=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var a=arguments[t];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(e[n]=a[n])}return e},m.apply(this,arguments)}function u({active:e=!1,disabled:t=!1,children:a="Button",...n}){return React.createElement("span",m({className:"button_c0afaa2 "+(e?"active_b40adfc":"")},n),a)}const p="comment_df4a5f8",h="date_dc57e46",g="time_b2002a3",E="parameter_dcc1064",b="block_parameter_ddf33c6";function f({event:t}){const[a,n]=React.useState(t.repeat&&""!=t.repeat),c=!t.id;return c&&(t.repeatStart=t.start,t.credit=0,t.debit=0),console.log("event",t),React.createElement("form",{className:"event_form_e576b51"},React.createElement(u,null,t.completed?"Completed":"Mark complete"),React.createElement("div",{className:"name_c4b14a4",contentEditable:"true",suppressContentEditableWarning:!0},t.name??""),React.createElement("div",{className:b},React.createElement("label",null,"comment:"),React.createElement("div",{className:p,contentEditable:"true",suppressContentEditableWarning:!0},t.comment??"")),React.createElement("div",{className:b},React.createElement("label",null,"project:"),React.createElement("select",{defaultValue:t.project},React.createElement("option",{value:""},"Default"),d.projects.map(((e,t)=>React.createElement("option",{key:t,value:e.name},e.name))))),React.createElement("div",{className:"repeat_row_ac3cbfd"},React.createElement("span",{style:{fontWeight:"bold",color:a?"black":"lightgray"},onClick:e=>{c&&(n((e=>!e)),t.repeat||(t.repeat="* * *"))}},"⭮"),a&&React.createElement(React.Fragment,null,React.createElement("span",null," repeat: "),React.createElement("span",{className:"repeat_string_ced7d1c",contentEditable:"true",suppressContentEditableWarning:!0},t.repeat))),React.createElement("div",null,"start date:"),React.createElement("input",{type:"date",className:h,defaultValue:e.getYYYYMMDD(t.repeat?t.repeatStart:t.start??0)}),React.createElement("div",{className:"row_c3cffbc"},React.createElement("div",{className:E},React.createElement("div",null,"time:"),React.createElement("input",{type:"time",className:g,defaultValue:e.getHHMM(t.repeat?t.repeatStart:t.start??0)}))," ",React.createElement("div",{className:E},React.createElement("div",null,"duration:"),React.createElement("input",{type:"time",className:g,defaultValue:""}))),React.createElement("div",null,"end date:"),React.createElement("input",{type:"date",className:h,defaultValue:e.getYYYYMMDD(t.repeat?t.repeatStart:t.start??0)}),React.createElement("div",null,"credit:"),React.createElement("div",{className:p,contentEditable:"true",suppressContentEditableWarning:!0},t.credit),React.createElement("div",null,"debit:"),React.createElement("div",{className:p,contentEditable:"true",suppressContentEditableWarning:!0},t.debit))}function v({children:a=null}){const[r,l]=React.useState(!1),[s,i]=React.useState(4),m=React.useRef(null),p=React.useRef(null),[h,g]=React.useState({title:"Add new event",name:"New event"});let E=e.getBegintWeekTimestamp(Date.now()/1e3);const b=E;E-=7*s*86400,React.useEffect((()=>{i(6),m.current.scrollTop=604}),[]);const v=[];for(let e=0;e<=20;e++){v.push([]);let t=[];for(let a=0;a<=6;a++)v[e].push([]),v[e][a]={timestamp:E,tasks:d.getEventsWithPlaceholders(E,t),actualBalance:d.getActualBalance(E),plannedBalance:d.getPlannedBalance(E),plannedBalanceChange:d.getPlannedBalanceChange(E)},E+=86400}const R=React.useCallback(((e,t)=>{""!==t&&(g({name:t,start:e}),l(!0))})),D=React.useCallback(((e,t)=>{const a=(t?d.completed.find((t=>t.id===e)):d.planned.find((t=>t.id===e)))??d.plannedRepeatable.find((t=>t.id===e));a.completed=t,g(a),l(!0)}));return console.log("draw calendar"),React.createElement("div",{className:"wrapper_af90f78"},React.createElement("div",{className:"header_e3daf93"},React.createElement(u,{onClick:e=>{console.log(JSON.stringify(d.prepareToStorage()))}},"Save to LocalStorage"),React.createElement(u,null,"Today"),React.createElement("span",{ref:p,className:"monthTitle_a8c3ab6"})),React.createElement("div",{className:"dayOfWeekLabels_cf63ad3"},e.WEEKDAYS.map(((e,t)=>React.createElement("div",{key:t},e)))),React.createElement("div",{className:"CalendarBody_b3637e9",onScroll:t=>{const a=t.target,n=a.scrollTop,c=a.scrollHeight-a.scrollTop-a.clientHeight,r=Math.ceil(n/151-s),l=new Date(1e3*(b+7*r*86400));p.current.innerText=l.getFullYear()+" "+e.MONTHS_FULL[l.getMonth()]+" "+r+" week",n<600?i((e=>e+4)):c<600&&i((e=>e-4))},ref:m},React.createElement("div",null," ",v.map((e=>React.createElement("div",{className:"CalendarWeek_ef509bf",key:e[0].timestamp}," ",e.map(((e,a)=>React.createElement(t,{timestamp:e.timestamp,dayHeight:150,key:e.timestamp,actualBalance:e.actualBalance,plannedBalance:e.plannedBalance,plannedBalanceChange:e.plannedBalanceChange,onAddEvent:R},e.tasks.map(((e,t)=>{return-1===e.id?React.createElement(c,{key:t}):React.createElement(n,{key:t,event:e,days:(r=e.days,l=7-a,r<l?r:l),onClick:D});var r,l})))))))))),React.createElement(o,{isOpen:r,onCancel:()=>l(!1)},React.createElement(f,{event:h})))}function R(){return React.createElement(v,null)}ReactDOM.render(React.createElement(R,null),document.getElementById("root"))})();