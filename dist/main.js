(()=>{"use strict";class e{static WEEKDAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];static MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];static startWeek=1;static timezone=3;static initLocale(t=3,a=1){e.timezone=t,e.startWeek=a}static getDayMonthWeekday(e){const t=new Date(1e3*e);return{day:t.getDate(),month:t.getMonth(),weekday:t.getDay()}}static getWeekday(e){return new Date(1e3*e).getDay()}static getBegintWeekTimestamp(t){const a=new Date(1e3*t);a.setHours(0,0,0,0);const n=a.getDate();let r=a.getDay()-e.startWeek;return r<0&&(r+=7),a.setDate(n-r)/1e3}static getBeginDayTimestamp=t=>86400*~~((t+3600*e.timezone)/86400)-3600*e.timezone;static getEndDayTimestamp=t=>86400*~~((t+3600*e.timezone)/86400)-3600*e.timezone+86400;static getTime=t=>(t+3600*e.timezone)%86400-3600*e.timezone;static getTimeToEndDay=t=>86400-e.getTime(t);static getDifferenceInDays=(t,a)=>(e.getBeginDayTimestamp(a)-e.getBeginDayTimestamp(t))/86400;static getTimeString(e){const t=new Date(1e3*e),a=t.getHours(),n=t.getMinutes();return a+(n>9?":":":0")+n}}function t({timestamp:t,dayHeight:a,actualBalance:n,plannedBalance:r,children:s=null}){const{day:i,month:c}=e.getDayMonthWeekday(t);return React.createElement("div",{className:"CalendarDay_afb7130",style:{height:a}},React.createElement("div",{className:"CalendarDayHeader_ce37fdc"},i+(1==i?" "+e.MONTHS[c]:"")),React.createElement("div",null,n),React.createElement("div",null,r),React.createElement("div",{className:"CalendarDayTasks"}," ",s," "),React.createElement("div",{className:"DayTaskInput_c3fce47"},React.createElement("textarea",{rows:1,wrap:"off"})))}function a({name:t,days:a,time:n=0}){return React.createElement("div",{className:"EventItem_b1f2ae7",style:{width:"calc("+a+" * (100% + 1px) + 1px)"}},React.createElement("span",null,t),React.createElement("span",{className:"EventTime_f0aa565"},e.getTimeString(n)))}function n(){return React.createElement("div",{className:"EventPlaceholder_b109d15"})}function r(e,t,a=31,n=1){const[r,s=null]=t.split("-",2);if(null===s){const[r,s=null]=t.split("/",2);if(""===r||""===s)return e;const i="*"===r?n:+r;let c=+s;if(isNaN(i)||isNaN(c))return e;if(null===s&&"*"!==r)return e.push(+r),e;0===c&&(c=1);for(let t=i;t<=a;t+=c)e.push(t);return e}if(""===r||""===s)return e;for(let t=+r;t<=+s;t++)e.push(t);return e}class s{static getStartDay=t=>e.getBeginDayTimestamp(t.start);static getStartTime=t=>e.getTime(t.start);static getEnd=t=>void 0!==t.end?t.end:void 0!==t.duration?t.start+60*t.duration:e.getEndDayTimestamp(t.start);static getEndDayOfEnd=t=>e.getEndDayTimestamp(s.getEnd(t));static getDuration=t=>void 0!==t.end?t.end-t.start:void 0!==t.duration?60*t.duration:e.getTimeToEndDay(t.start);static getDurationInDays=t=>{const a=void 0!==t.end?(e.getEndDayTimestamp(t.end)-e.getBeginDayTimestamp(t.start))/86400:void 0!==t.duration?(e.getEndDayTimestamp(t.start+60*t.duration)-e.getBeginDayTimestamp(t.start))/86400:1;return Math.ceil(a)};static isRepeatable=e=>void 0!==e.repeat;static isIncludes=(e,t)=>t>=s.getStartDay(e)&&t<s.getEndDayOfEnd(e);static toPlannedEventItem=(e,t,a)=>({id:e,name:t.name,time:s.getStartTime(t),days:a,debit:t.debit??0,credit:t.credit??0});static toActualEventItem=(e,t,a)=>({id:e,name:t.name,time:s.getStartTime(t),days:a,debit:t.debit??0,credit:t.credit??0})}const i=[{name:"НО +30000",credit:{account:1,amount:3e4},comment:"начальный остаток",start:new Date("2022-01-01 00:00")/1e3,balance:52683}],c=[{name:"ЗП +40020",credit:40020,repeat:"10,25 * *",start:new Date("2021-11-01 10:00")/1e3,duration:20},{name:"заправка",debit:2500,repeat:"/6",start:new Date("2022-01-12 15:00")/1e3,duration:30},{name:"купить продукты",debit:8e3,repeat:"* * 0",start:new Date("2022-01-04 15:00")/1e3,duration:80},{name:"маму на укол",debit:4e4,start:new Date("2022-02-05 10:00")/1e3,duration:80},{name:"праздники",cost:0,start:new Date("2021-12-31 00:00")/1e3,end:new Date("2022-01-09 23:59")/1e3},{name:"test",cost:0,start:new Date("2022-01-14 14:00")/1e3,duration:2039},{name:"отпуск",cost:0,start:new Date("2022-01-07 00:00")/1e3,duration:20159}];function l(t,a,n=[],l=!1){for(;n.length>0&&!(a<n[n.length-1].end);)n.pop();n.forEach((e=>{t.push({id:-1})}));const m=c.reduce(((t,i,c)=>{if(i.repeat&&a>=i.start){if(i.repeatEnd&&a+e.getTime(i.start)-i.repeatEnd>0)return t;(class{static isMatch(t,a,n){const{day:s,month:i,weekday:c}=e.getDayMonthWeekday(n),[l=null,m="*",d="*"]=t.trim().split(" ",3);if(null===l)return!1;if("/"===l[0]){const t=~~((n-e.getBeginDayTimestamp(a))/86400);return!(t<0)&&t%+l.substring(1)==0}const o=l.split(",").reduce(((e,t)=>r(e,t)),[]),u=m.split(",").reduce(((e,t)=>r(e,t,12)),[]),g=d.split(",").reduce(((e,t)=>r(e,t,7,0)),[]);return!!(u.includes(i+1)&&o.includes(s)&&g.includes(c))}}).isMatch(i.repeat,i.start,a)&&t.push(s.toPlannedEventItem(c,i,1))}else{if(a<s.getStartDay(i))return t;const r=s.getEndDayOfEnd(i);if(a>=r)return t;if(s.getDurationInDays(i)>1){if(n.filter((e=>c==e.id)).length>0)return t;n.push({id:c,end:r})}t.push(s.toPlannedEventItem(c,i,e.getDifferenceInDays(a,r)))}return t}),t);return l&&i.reduce(((t,n,r)=>(n.start&&e.getBeginDayTimestamp(n.start)<=a&&e.getEndDayTimestamp(n.start)>a&&t.push(s.toActualEventItem(r,n,1)),t)),m),m}function m(e){const t=i.filter((t=>t.start<e));return 0==t.length?0:t.slice(-1)[0].balance}function d(t){let a=i[i.length-1].start,n=i[i.length-1].balance;t<a&&(a=t,n=0);const r=[],s=[];for(let n=e.getBeginDayTimestamp(a);n<t;n+=86400)l(r,n,s);return r.reduce(((e,t)=>e+((t.credit?t.credit:0)-(t.debit?t.debit:0))),n)}const o=150;function u({children:r=null}){const[u,g]=React.useState(0),p=React.useRef(null);i.sort(((e,t)=>e.start-t.start)),c.sort(((e,t)=>{if(e.repeat)return t.repeat?s.getStartTime(e)-s.getStartTime(t):1;if(t.repeat)return-1;const a=s.getStartDay(e)-s.getStartDay(t);return 0!=a?a:s.getDurationInDays(t)-s.getDurationInDays(e)})),c.forEach((t=>console.log(t.name,e.getTime(t.start))));let y=e.getBegintWeekTimestamp(Date.now()/1e3);console.log("scrollHeight",u),y+=604800*(~~(u/o)-1);const D=[];for(let e=0;e<=5;e++){D.push([]);let t=[];for(let a=0;a<=6;a++)D[e].push([]),D[e][a]={timestamp:y,tasks:l([],y,t,!0),actualBalance:m(y),plannedBalance:d(y)},y+=86400}function E(e){e.preventDefault();let t=e.wheelDelta>0?1:-1;console.log(this.style.top);let a=parseInt(this.style.top)+15*t;a>=0?(console.log(a),g((e=>e-o)),a-=o):a<-150&&(console.log(a),g((e=>e+o)),a+=o),this.style.top=a+"px"}return React.useEffect((()=>(console.log("Calendar AddEventListener Mouse"),p.current.addEventListener("wheel",E),()=>{console.log("Calendar RemoveEventListener Mouse"),p.current.removeEventListener("wheel",E)})),[]),console.log("draw calendar"),React.createElement(React.Fragment,null,React.createElement("div",{className:"dayOfWeekLabels_cf63ad3"},e.WEEKDAYS.map(((e,t)=>React.createElement("div",{key:t},e)))),React.createElement("div",{className:"CalendarBody_b3637e9"},React.createElement("div",{className:"Scrolled_ce022ef",style:{top:-150},ref:p}," ",D.map((e=>React.createElement("div",{className:"CalendarWeek_ef509bf",key:e[0].timestamp}," ",e.map(((e,r)=>React.createElement(t,{timestamp:e.timestamp,dayHeight:o,key:e.timestamp,actualBalance:e.actualBalance,plannedBalance:e.plannedBalance},e.tasks.map(((e,t)=>{return-1===e.id?React.createElement(n,{key:t}):React.createElement(a,{key:t,name:e.name,time:e.time,days:(console.log("min",e.days,7-r),s=e.days,i=7-r,s<i?s:i)});var s,i})))))))))))}function g(){return React.createElement(u,null)}ReactDOM.render(React.createElement(g,null),document.getElementById("root"))})();