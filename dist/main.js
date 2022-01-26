(()=>{"use strict";class e{static WEEKDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];static MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];static MONTHS_FULL=["January","February","March","April","May","June","July","August","September","October","November","December"];static startWeek=1;static timezone=3;static initLocale(t=3,a=1){e.timezone=t,e.startWeek=a}static getDayMonthWeekday(e){const t=new Date(1e3*e);return{day:t.getDate(),month:t.getMonth(),weekday:t.getDay()}}static getWeekday(e){return new Date(1e3*e).getDay()}static getBegintWeekTimestamp(t){const a=new Date(1e3*t);a.setHours(0,0,0,0);const n=a.getDate();let c=a.getDay()-e.startWeek;return c<0&&(c+=7),a.setDate(n-c)/1e3}static getBeginDayTimestamp=e=>new Date(1e3*e).setHours(0,0,0,0)/1e3;static getEndDayTimestamp=t=>86400*~~((t+3600*e.timezone)/86400)-3600*e.timezone+86399;static getTime=t=>t-e.getBeginDayTimestamp(t);static getTimeToEndDay=t=>e.getBeginDayTimestamp(t)+86399-t;static getDifferenceInDays=(t,a)=>(e.getBeginDayTimestamp(a)-e.getBeginDayTimestamp(t))/86400;static getTimeString(e){const t=new Date(1e3*e),a=t.getUTCHours(),n=t.getUTCMinutes();return a+(n>9?":":":0")+n}static getYYYYMMDD(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,c=t.getDate();return a+(n>9?"-":"-0")+n+(c>9?"-":"-0")+c}static getHHMM(e){const t=new Date(1e3*e),a=t.getHours(),n=t.getMinutes();return(a>9?"":"0")+a+(n>9?":":":0")+n}static getYYYYMMDDTHHMM(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,c=t.getDate(),r=t.getHours(),l=t.getMinutes();return a+(n>9?"-":"-0")+n+(c>9?"-":"-0")+c+(r>9?"T":"T0")+r+(l>9?":":":0")+l}static HHMMToSeconds(e){if(!e)return 0;const[t,a]=e.split(":",2);return console.log("hhmm",t,a),60*(60*t+ +a)}static DDHHMMToSeconds(t){const[a,n]=t.split("d",2);return console.log(t,a,n),void 0===n?e.HHMMToSeconds(a):86400*a+e.HHMMToSeconds(n)}static HHMMFromSeconds(e){if(null===e)return"";const t=~~(e%3600/60);return~~(e/3600)+(t>9?":":":0")+t}static DDHHMMFromSeconds(t){if(t<0)return"";const a=~~(t/86400);return(a<1?"":a+"d ")+e.HHMMFromSeconds(t%86400)}}function t({timestamp:t,dayHeight:a,actualBalance:n,plannedBalance:c,plannedBalanceChange:r,onAddEvent:l=(()=>{}),children:s=null}){const i=React.useRef(null),{day:d,month:o}=e.getDayMonthWeekday(t),m=e=>(e/1e3).toFixed(1);return React.createElement("div",{className:"CalendarDay_afb7130",style:{height:a},onClick:function(e){i&&i.current.focus()}},React.createElement("div",{className:"CalendarDayHeader_ce37fdc"},d+(1==d?" "+e.MONTHS[o]:"")),React.createElement("div",{className:"balance_c271232"},React.createElement("span",{className:"plannedBalance_dee8e33"},m(c)+(0==r?"k":((u=r/1e3)>0?"+"+u.toFixed(1):u.toFixed(1))+"k"))," ",React.createElement("span",{className:"actualBalance_c28974d"},m(n))),React.createElement("div",{className:"CalendarDayTasks"}," ",s," "),React.createElement("div",{className:"DayTaskInput_c3fce47"},React.createElement("input",{ref:i,rows:1,wrap:"off",onBlur:function(e){l(t,e.target.value),e.target.value=""},onKeyDown:function(e){13===e.keyCode&&e.target.blur()}})));var u}const a={item:"item_bb964bd",completed:"completed_b30da5e",event_row:"event_row_c1f0c4e",complete_button:"complete_button_a23d2b0",EventPlaceholder:"EventPlaceholder_b109d15",time:"time_c10a237"};function n({event:t,days:n,onClick:c=(e=>{})}){const{name:r,completed:l,background:s,color:i}=t;return React.createElement("div",{className:a.item,style:{width:1==n?"calc(100% + 2px)":"calc("+n+" * (100% + 1px) + 1px )",backgroundColor:s,color:i},onClick:e=>{e.stopPropagation(),c(t)}},l&&React.createElement("div",{className:a.completed}),React.createElement("div",{className:a.event_row},React.createElement("div",{className:a.complete_button},l?"✔":"☐"),React.createElement("span",{className:a.name},r),React.createElement("span",{className:a.time},e.HHMMFromSeconds(t.time))))}function c(){return React.createElement("div",{className:a.EventPlaceholder})}function r(e,t,a=31,n=1){const[c,r=null]=t.split("-",2);if(null===r){const[c,r=null]=t.split("/",2);if(""===c||""===r)return e;const l="*"===c?n:+c;let s=+r;if(isNaN(l)||isNaN(s))return e;if(null===r&&"*"!==c)return e.push(+c),e;0===s&&(s=1);for(let t=l;t<=a;t+=s)e.push(t);return e}if(""===c||""===r)return e;for(let t=+c;t<=+r;t++)e.push(t);return e}class l{static isMatch(t,a,n){const{day:c,month:l,weekday:s}=e.getDayMonthWeekday(n),[i=null,d="*",o="*"]=t.trim().split(" ",3);if(null===i)return!1;if("/"===i[0]){const t=~~((n-e.getBeginDayTimestamp(a))/86400);return!(t<0)&&t%+i.substring(1)==0}const m=i.split(",").reduce(((e,t)=>r(e,t)),[]),u=d.split(",").reduce(((e,t)=>r(e,t,12)),[]),p=o.split(",").reduce(((e,t)=>r(e,t,7,0)),[]);return!!(u.includes(l+1)&&m.includes(c)&&p.includes(s))}static ariseInInterval(e,t,a,n){for(var c=a;c<n;c+=86400)if(this.isMatch(e,t,c))return!0;return!1}}const s=(e,t,a)=>({id:e,name:t.name,comment:t.comment,project:t.project,background:t.background,color:t.color,start:a,time:t.time,end:a+86400,days:1,credit:t.credit,debit:t.debit}),i=(e,t,a)=>({id:e.id,name:e.name,background:e.background,color:e.color,start:e.start,time:e.time,end:e.end,days:Math.ceil((e.end-t)/86400),credit:e.credit,debit:e.debit,completed:a}),d=t=>{const a=e.getBeginDayTimestamp(new Date(t.start)/1e3),n=t.time?e.HHMMToSeconds(t.time):null,c=t.duration?e.DDHHMMToSeconds(t.duration):0;if(t.repeat)return{name:t.name,comment:t.comment??"",project:t.project??"",repeat:t.repeat,start:a,time:n,duration:c,end:t.end?e.getBeginDayTimestamp(new Date(t.end)/1e3):0,credit:t.credit??0,debit:t.debit??0};const r=c?(null!==n?a+n:a)+c:t.end?e.getBeginDayTimestamp(new Date(t.end)/1e3):a+86400;return{name:t.name,comment:t.comment??"",project:t.project??"",start:a,time:n,duration:c,end:r,credit:t.credit??0,debit:t.debit??0}};class o{static default_background="lightgray";static default_color="black";constructor(e,t,a){this.cachedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastId=1,this.projects=[...a],this.completed=e.map((e=>{const t=d(e),a=t.project?this.projects.find((e=>e.name===t.project)):{name:"",background:o.default_background,color:o.default_color};return{id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,start:t.start,time:t.time,duration:t.duration,end:t.end,days:Math.ceil((t.end-t.start)/86400),credit:t.credit,debit:t.debit}})),this.planned=[],this.plannedRepeatable=[],t.forEach((e=>this.addPlannedEvent(e))),this.sort(),this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed.length?this.completed[this.completed.length-1].start:0,this.firstActualBalanceDate=this.completed.length?this.completed[0].start:0}addPlannedEvent(e){const t=d(e),a=t.project?this.projects.find((e=>e.name===t.project)):{name:"",background:o.default_background,color:o.default_color};t.repeat?this.plannedRepeatable.push({id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,repeat:t.repeat,start:t.start,time:t.time,duration:t.duration,end:t.end,days:1,credit:t.credit,debit:t.debit}):this.planned.push({id:this.lastId++,name:t.name,comment:t.comment,project:a.name,background:a.background,color:a.color,start:t.start,time:t.time,duration:t.duration,end:t.end,days:Math.ceil((t.end-t.start)/86400),credit:t.credit,debit:t.debit})}deleteEvent(e){this.completed=this.completed.filter((t=>t.id!==e)),this.planned=this.planned.filter((t=>t.id!==e)),this.plannedRepeatable=this.plannedRepeatable.filter((t=>t.id!==e)),this.cachedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed.length?this.completed[this.completed.length-1].start:0,this.firstActualBalanceDate=this.completed.length?this.completed[0].start:0}completeEvent(e,t){var a=this.completed.find((t=>t.id===e));if(void 0!==a){const e={...a,id:this.lastId++};return this.planned.push(e),this.sort(),void this.deleteEvent(a.id)}if(void 0!==(a=this.planned.find((t=>t.id===e)))){const e={...a,id:this.lastId++};return this.completed.push(e),this.sort(),void this.deleteEvent(a.id)}if(void 0!==(a=this.plannedRepeatable.find((t=>t.id===e)))){const e=s(this.lastId++,a,t);if(this.completed.push(e),l.ariseInInterval(a.repeat,a.start,a.start,t)){const e={...a,end:t,id:this.lastId++};this.plannedRepeatable.push(e)}if("/"==a.repeat[0]){const e=+a.repeat.substr(1);a.start=t+86400*e}else a.start=t+86400;return a.end&&!l.ariseInInterval(a.repeat,a.start,a.start,a.end)&&this.deleteEvent(a.id),this.sort(),this.cachedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed.length?this.completed[this.completed.length-1].start:0,void(this.firstActualBalanceDate=this.completed.length?this.completed[0].start:0)}}sort(){this.completed.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.planned.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.plannedRepeatable.sort(((e,t)=>e.time-t.time))}getEvents(e){if(void 0!==this.cachedEvents[e])return this.cachedEvents[e];const t=this.planned.reduce(((t,a)=>(e<a.start||e>=a.end||t.push(i(a,e,!1)),t)),[]);return this.plannedRepeatable.reduce(((t,a)=>(e<a.start||a.end&&e+a.time>=a.end||l.isMatch(a.repeat,a.start,e)&&t.push(i(s(a.id,a,e),e,!1)),t)),t),this.completed.reduce(((t,a)=>(e>=a.start&&e<a.end&&t.push(i(a,e,!0)),t)),t),t.sort(((e,t)=>{var a=e.start-t.start;return a||(a=t.end-t.start-(e.end-e.start))||e.time-t.time})),this.cachedEvents[e]=t,t}getEventsWithPlaceholders(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();return t.forEach((e=>a.push({id:-1}))),this.getEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a),a}getPlannedEventsFilteredBySkip(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();this.getEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||a.completed||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a)}getPlannedEventsInInterval(e,t){const a=[],n=[];for(let c=e;c<t;c+=86400)this.getPlannedEventsFilteredBySkip(c,n,a);return a}calculateActualBalance(){return this.completed.reduce(((e,t)=>e+(t.credit-t.debit)),0)}getActualBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e>this.lastActualBalanceDate)return this.lastActualBalance;if(void 0!==this.cachedActualBalance[e])return this.cachedActualBalance[e];const t=this.completed.reduce(((t,a)=>(e>a.start+a.time&&(t+=a.credit-a.debit),t)),0);return this.cachedActualBalance[e]=t,t}getPlannedBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e<=this.lastActualBalanceDate)return this.getActualBalance(e);if(void 0!==this.cachedPlannedBalance[e])return this.cachedPlannedBalance[e];const t=this.getPlannedEventsInInterval(this.lastActualBalanceDate,e).reduce(((e,t)=>e+(t.credit-t.debit)),this.lastActualBalance);return this.cachedPlannedBalance[e]=t,t}getPlannedBalanceChange(e){return this.getEvents(e).reduce(((e,t)=>e+(t.credit-t.debit)),0)}prepareToStorage(){const t=this.completed.map((t=>{const a={};return a.name=t.name,t.comment&&(a.comment=t.comment),t.project&&(a.project=t.project),a.start=e.getYYYYMMDD(t.start),null!==t.time&&(a.time=e.HHMMFromSeconds(t.time)),t.duration?a.duration=e.DDHHMMFromSeconds(t.duration):t.end-t.start!=86400&&(a.end=e.getYYYYMMDD(t.end)),t.credit&&(a.credit=t.credit),t.debit&&(a.debit=t.debit),a})),a=this.plannedRepeatable.reduce(((t,a)=>{const n={};return n.name=a.name,a.comment&&(n.comment=a.comment),a.project&&(n.project=a.project),n.repeat=a.repeat,n.start=e.getYYYYMMDD(a.start),null!==a.time&&(n.time=e.HHMMFromSeconds(a.time)),a.duration&&(n.duration=e.DDHHMMFromSeconds(a.duration)),a.end&&(n.end=e.getYYYYMMDD(a.end)),a.credit&&(n.credit=a.credit),a.debit&&(n.debit=a.debit),t.push(n),t}),[]);return this.planned.reduce(((t,a)=>{const n={};return n.name=a.name,a.comment&&(n.comment=a.comment),a.project&&(n.project=a.project),n.start=e.getYYYYMMDD(a.start),null!==a.time&&(n.time=e.HHMMFromSeconds(a.time)),a.duration?n.duration=e.DDHHMMFromSeconds(a.duration):a.end-a.start!=86400&&(n.end=e.getYYYYMMDD(a.end)),a.credit&&(n.credit=a.credit),a.debit&&(n.debit=a.debit),t.push(n),t}),a),{projectsList:this.projects,completedList:t,plannedList:a}}}const m=JSON.parse('{"projectsList":[{"name":"Общий","background":"blue","color":"white"},{"name":"Доход","background":"red","color":"white"},{"name":"Машина","background":"violet","color":"white"},{"name":"Дача","background":"yellow","color":"black"},{"name":"Рутина","background":"gray","color":"white"}],"completedList":[{"name":"НО +30000","comment":"начальный остаток","project":"Доход","start":"2022-01-01","credit":52683}],"plannedList":[{"name":"четные","repeat":"2/2","start":"2021-11-01","end":"2022-01-16"},{"name":"комплексные","repeat":"1/3,20-25","start":"2021-11-01"},{"name":"заправка","project":"Машина","repeat":"/6","start":"2022-01-12","time":"8:00","duration":"0:30","debit":2500},{"name":"дорога на работу","repeat":"* * 1-5","start":"2021-11-01","time":"8:00","duration":"1:00"},{"name":"пенсия мамы","project":"Доход","repeat":"17","start":"2021-12-01","time":"9:00","duration":"0:20","credit":31000},{"name":"работа","project":"Рутина","repeat":"* * 1-5","start":"2021-11-01","time":"9:00","duration":"9:00"},{"name":"ЗП +40020","project":"Доход","repeat":"10,25 * *","start":"2021-12-01","time":"10:00","duration":"0:20","credit":40020},{"name":"купить продукты","project":"Общий","repeat":"* * 0","start":"2022-01-04","time":"19:00","duration":"1:20","debit":8000},{"name":"праздники","start":"2021-12-31","end":"2022-01-19"},{"name":"отпуск","start":"2022-01-07","duration":"14d 0:00"},{"name":"test","start":"2022-01-14","duration":"1d 10:00"},{"name":"маму на укол","start":"2022-02-05","time":"10:00","duration":"1:20","debit":40000},{"name":"тест2","start":"2022-02-05","duration":"1:20"}]}'),u=new o(m.completedList,m.plannedList,m.projectsList);function p({isOpen:e=!1,onSubmit:t=(()=>{}),onCancel:a=(()=>{}),children:n=null}){return e&&React.createElement("div",{className:"modalOverlay_faa7164",onClick:a},React.createElement("div",{className:"modalWindow_fac41c2",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"modalBody_a8134eb"},n),React.createElement("div",{className:"modalFooter_dcf803f"},React.createElement("span",{className:"cancel_b0d96c0",onClick:a},"Cancel"),React.createElement("span",{className:"apply_dc7f5d7",onClick:t},"Apply"))))}function h(){return h=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var a=arguments[t];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(e[n]=a[n])}return e},h.apply(this,arguments)}function g({active:e=!1,disabled:t=!1,children:a="Button",...n}){return React.createElement("span",h({className:"button_c0afaa2 "+(e?"active_b40adfc":"")},n),a)}const b="comment_df4a5f8",E="date_dc57e46",f="time_b2002a3",v="parameter_dcc1064",R="block_parameter_ddf33c6";function D({event:t,onDelete:a=(e=>{}),onComplete:n=((e,t)=>{})}){const[c,r]=React.useState(t.repeat&&""!=t.repeat),l=!t.id;return l&&(t.credit=0,t.debit=0),console.log("event",t),React.createElement("form",{className:"event_form_e576b51"},React.createElement(g,{onClick:()=>n(t.id,t.timestamp)},t.completed?"Mark uncompleted":"Complete"),!l&&React.createElement(g,{onClick:()=>a(t.id)},"Delete"),React.createElement("div",{className:"name_c4b14a4",contentEditable:"true",suppressContentEditableWarning:!0},t.name??""),React.createElement("div",{className:R},React.createElement("label",null,"comment:"),React.createElement("div",{className:b,contentEditable:"true",suppressContentEditableWarning:!0},t.comment??"")),React.createElement("div",{className:R},React.createElement("label",null,"project:"),React.createElement("select",{defaultValue:t.project},React.createElement("option",{value:""},"Default"),u.projects.map(((e,t)=>React.createElement("option",{key:t,value:e.name},e.name))))),React.createElement("div",{className:"repeat_row_ac3cbfd"},React.createElement("span",{style:{fontWeight:"bold",color:c?"black":"lightgray"},onClick:e=>{l&&(r((e=>!e)),t.repeat||(t.repeat="* * *"))}},"⭮"),c&&React.createElement(React.Fragment,null,React.createElement("span",null," repeat: "),React.createElement("span",{className:"repeat_string_ced7d1c",contentEditable:"true",suppressContentEditableWarning:!0},t.repeat))),React.createElement("div",null,"start date:"),React.createElement("input",{type:"date",className:E,defaultValue:e.getYYYYMMDD(t.start??0)}),React.createElement("div",{className:"row_c3cffbc"},React.createElement("div",{className:v},React.createElement("div",null,"time:"),React.createElement("input",{type:"text",className:f,defaultValue:e.HHMMFromSeconds(t.time)}))," ",React.createElement("div",{className:v},React.createElement("div",null,"duration:"),React.createElement("input",{type:"text",className:f,defaultValue:e.DDHHMMFromSeconds(t.duration??0)}))),React.createElement("div",null,"end date:"),React.createElement("input",{type:"date",className:E,defaultValue:e.getYYYYMMDD(t.end??0)}),React.createElement("div",null,"credit:"),React.createElement("div",{className:b,contentEditable:"true",suppressContentEditableWarning:!0},t.credit),React.createElement("div",null,"debit:"),React.createElement("div",{className:b,contentEditable:"true",suppressContentEditableWarning:!0},t.debit))}function M({children:a=null}){const r=(()=>{const[,e]=React.useState({});return React.useCallback((()=>e({})),[])})(),[l,s]=React.useState(!1),[i,d]=React.useState(4),o=React.useRef(null),m=React.useRef(null),[h,b]=React.useState({title:"Add new event",name:"New event"});let E=e.getBegintWeekTimestamp(Date.now()/1e3);const f=E;E-=7*i*86400,React.useEffect((()=>{d(6),o.current.scrollTop=604}),[]);const v=[];for(let e=0;e<=20;e++){v.push([]);let t=[];for(let a=0;a<=6;a++)v[e].push([]),v[e][a]={timestamp:E,tasks:u.getEventsWithPlaceholders(E,t),actualBalance:u.getActualBalance(E),plannedBalance:u.getPlannedBalance(E),plannedBalanceChange:u.getPlannedBalanceChange(E)},E+=86400}const R=React.useCallback(((e,t)=>{""!==t&&(b({name:t,start:e}),s(!0))})),M=React.useCallback((e=>{const t=e.id,a=e.completed,n=(a?u.completed.find((e=>e.id===t)):u.planned.find((e=>e.id===t)))??u.plannedRepeatable.find((e=>e.id===t)),c=e.start;console.log("compactEvent",e),b({...n,completed:a,timestamp:c}),s(!0)}));return console.log("draw calendar"),React.createElement("div",{className:"wrapper_af90f78"},React.createElement("div",{className:"header_e3daf93"},React.createElement(g,{onClick:e=>{console.log(JSON.stringify(u.prepareToStorage()))}},"Save to LocalStorage"),React.createElement(g,null,"Today"),React.createElement("span",{ref:m,className:"monthTitle_a8c3ab6"})),React.createElement("div",{className:"dayOfWeekLabels_cf63ad3"},e.WEEKDAYS.map(((e,t)=>React.createElement("div",{key:t},e)))),React.createElement("div",{className:"CalendarBody_b3637e9",onScroll:t=>{const a=t.target,n=a.scrollTop,c=a.scrollHeight-a.scrollTop-a.clientHeight,r=Math.ceil(n/151-i),l=new Date(1e3*(f+7*r*86400));m.current.innerText=l.getFullYear()+" "+e.MONTHS_FULL[l.getMonth()]+" "+r+" week",n<600?d((e=>e+4)):c<600&&d((e=>e-4))},ref:o},React.createElement("div",null," ",v.map((e=>React.createElement("div",{className:"CalendarWeek_ef509bf",key:e[0].timestamp}," ",e.map(((e,a)=>React.createElement(t,{timestamp:e.timestamp,dayHeight:150,key:e.timestamp,actualBalance:e.actualBalance,plannedBalance:e.plannedBalance,plannedBalanceChange:e.plannedBalanceChange,onAddEvent:R},e.tasks.map(((e,t)=>{return-1===e.id?React.createElement(c,{key:t}):React.createElement(n,{key:t,event:e,days:(r=e.days,l=7-a,r<l?r:l),onClick:M});var r,l})))))))))),React.createElement(p,{isOpen:l,onCancel:()=>s(!1)},React.createElement(D,{event:h,onDelete:e=>{u.deleteEvent(e),s(!1),r()},onComplete:(e,t)=>{u.completeEvent(e,t),s(!1),r()}})))}function y(){return React.createElement(M,null)}ReactDOM.render(React.createElement(y,null),document.getElementById("root"))})();