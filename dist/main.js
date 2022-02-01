(()=>{"use strict";class e{static WEEKDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];static MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];static MONTHS_FULL=["January","February","March","April","May","June","July","August","September","October","November","December"];static startWeek=1;static timezone=3;static initLocale(t=3,a=1){e.timezone=t,e.startWeek=a}static getDayMonthWeekday(e){const t=new Date(1e3*e);return{day:t.getDate(),month:t.getMonth(),weekday:t.getDay()}}static getWeekday(e){return new Date(1e3*e).getDay()}static getBegintWeekTimestamp(t){const a=new Date(1e3*t);a.setHours(0,0,0,0);const n=a.getDate();let r=a.getDay()-e.startWeek;return r<0&&(r+=7),a.setDate(n-r)/1e3}static getBeginDayTimestamp=e=>new Date(1e3*e).setHours(0,0,0,0)/1e3;static getEndDayTimestamp=t=>86400*~~((t+3600*e.timezone)/86400)-3600*e.timezone+86399;static getTime=t=>t-e.getBeginDayTimestamp(t);static getTimeToEndDay=t=>e.getBeginDayTimestamp(t)+86399-t;static getDifferenceInDays=(t,a)=>(e.getBeginDayTimestamp(a)-e.getBeginDayTimestamp(t))/86400;static getTimeString(e){const t=new Date(1e3*e),a=t.getUTCHours(),n=t.getUTCMinutes();return a+(n>9?":":":0")+n}static getYYYYMMDD(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,r=t.getDate();return a+(n>9?"-":"-0")+n+(r>9?"-":"-0")+r}static getHHMM(e){const t=new Date(1e3*e),a=t.getHours(),n=t.getMinutes();return(a>9?"":"0")+a+(n>9?":":":0")+n}static getYYYYMMDDTHHMM(e){const t=new Date(1e3*e),a=t.getFullYear(),n=t.getMonth()+1,r=t.getDate(),c=t.getHours(),i=t.getMinutes();return a+(n>9?"-":"-0")+n+(r>9?"-":"-0")+r+(c>9?"T":"T0")+c+(i>9?":":":0")+i}static HHMMToSeconds(e){if(!e)return 0;const[t,a]=e.split(":",2);return 60*(60*t+ +a)}static DDHHMMToSeconds(t){const[a,n]=t.split("d",2);return void 0===n?e.HHMMToSeconds(a):86400*a+e.HHMMToSeconds(n)}static HHMMFromSeconds(e){if(null===e)return"";const t=~~(e%3600/60);return~~(e/3600)+(t>9?":":":0")+t}static DDHHMMFromSeconds(t){if(t<0)return"";const a=~~(t/86400);return(a<1?"":a+"d ")+e.HHMMFromSeconds(t%86400)}}function t(e,t,a=31,n=1){const[r,c=null]=t.split("-",2);if(null===c){const[r,c=null]=t.split("/",2);if(""===r||""===c)return e;const i="*"===r?n:+r;let s=+c;if(isNaN(i)||isNaN(s))return e;if(null===c&&"*"!==r)return e.push(+r),e;0===s&&(s=1);for(let t=i;t<=a;t+=s)e.push(t);return e}if(""===r||""===c)return e;for(let t=+r;t<=+c;t++)e.push(t);return e}class a{static isMatch(a,n,r){const{day:c,month:i,weekday:s}=e.getDayMonthWeekday(r),[l=null,d="*",o="*"]=a.trim().split(" ",3);if(null===l)return!1;if("/"===l[0]){const t=~~((r-e.getBeginDayTimestamp(n))/86400);return!(t<0)&&t%+l.substring(1)==0}const u=l.split(",").reduce(((e,a)=>t(e,a)),[]),m=d.split(",").reduce(((e,a)=>t(e,a,12)),[]),p=o.split(",").reduce(((e,a)=>t(e,a,7,0)),[]);return!!(m.includes(i+1)&&u.includes(c)&&p.includes(s))}static ariseInInterval(e,t,a,n){for(var r=a;r<n;r+=86400)if(this.isMatch(e,t,r))return!0;return!1}}class n{static default_background="lightgray";static default_color="black";static asanaToEvent=t=>{const a=t.split('"').map(((e,t)=>t%2==0?e:e.replace(/,/g,"."))).join('"'),[n,r,c,i,s,l,d,o,u,m,p,h,g,f,v]=a.split(","),E={name:s.replace(/"/g,""),start:m,comment:h.replace(/"/g,""),project:g},R=e.getBeginDayTimestamp(new Date(E.start)/1e3);return{name:""===E.name?"без названия":E.name,comment:E.comment??"",project:E.project??"",start:R,time:null,duration:0,end:R+86400,credit:0,debit:0,completed:""!==c}};eventToCompact=(e,t,a)=>{const n={id:e.id,name:e.name,background:this.projects[e.projectId].background,color:this.projects[e.projectId].color,start:e.start,time:e.time,end:e.end,days:Math.ceil((e.end-t)/86400),credit:e.credit,debit:e.debit,completed:a,repeatable:!1};return e.repeat&&(n.start=t,n.end=t+86400,n.days=1,n.repeatable=!0),n};rawToEvent=t=>{const a=e.getBeginDayTimestamp(new Date(t.start)/1e3),n=t.time?e.HHMMToSeconds(t.time):null,r=t.duration?e.DDHHMMToSeconds(t.duration):0;var c=t.project?this.projects.findIndex((e=>e.name===t.project)):0;if(c<0&&(c=0),t.repeat)return{name:t.name,comment:t.comment??"",project:t.project??"",projectId:c,repeat:t.repeat,start:a,time:n,duration:r,end:t.end?e.getBeginDayTimestamp(new Date(t.end)/1e3):0,credit:t.credit??0,debit:t.debit??0};const i=r?(null!==n?a+n:a)+r:t.end?e.getBeginDayTimestamp(new Date(t.end)/1e3):a+86400;return{name:t.name,comment:t.comment??"",project:t.project??"",projectId:c,start:a,time:n,duration:r,end:i,credit:t.credit??0,debit:t.debit??0}};static eventToRaw=t=>{const a={};return a.name=t.name,t.comment&&(a.comment=t.comment),t.project&&(a.project=t.project),a.start=e.getYYYYMMDD(t.start),null!==t.time&&(a.time=e.HHMMFromSeconds(t.time)),t.repeat?(a.repeat=t.repeat,t.duration&&(a.duration=e.DDHHMMFromSeconds(t.duration)),t.end&&(a.end=e.getYYYYMMDD(t.end))):t.duration?a.duration=e.DDHHMMFromSeconds(t.duration):t.end&&t.end-t.start!=86400&&(a.end=e.getYYYYMMDD(t.end)),t.credit&&(a.credit=t.credit),t.debit&&(a.debit=t.debit),a};constructor(e=[],t=[],a=[]){this.cachedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastId=1,this.projects=[{name:"Default",background:n.default_background,color:n.default_color},...a],this.completed=[],e.forEach((e=>{const t=this.rawToEvent(e);this.addCompletedEvent(t)})),this.planned=[],this.plannedRepeatable=[],t.forEach((e=>this.addPlannedRawEvent(e))),this.sort(),this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed.length?this.completed[this.completed.length-1].start:0,this.firstActualBalanceDate=this.completed.length?this.completed[0].start:0}addCompletedEvent(e){this.completed.push({id:this.lastId++,name:e.name,comment:e.comment,project:e.project,projectId:e.projectId,start:e.start,time:e.time,duration:e.duration,end:e.end,days:Math.ceil((e.end-e.start)/86400),credit:e.credit,debit:e.debit})}addPlannedRawEvent(e){this.addPlannedEvent(this.rawToEvent(e))}addPlannedEvent(e){e.repeat?this.plannedRepeatable.push({id:this.lastId++,name:e.name,comment:e.comment,project:e.project,projectId:e.projectId,repeat:e.repeat,start:e.start,time:e.time,duration:e.duration,end:e.end,days:1,credit:e.credit,debit:e.debit}):this.planned.push({id:this.lastId++,name:e.name,comment:e.comment,project:e.project,projectId:e.projectId,start:e.start,time:e.time,duration:e.duration,end:e.end,days:Math.ceil((e.end-e.start)/86400),credit:e.credit,debit:e.debit})}clearCache(){this.cachedEvents=[],this.cachedActualBalance=[],this.cachedPlannedBalance=[],this.lastActualBalance=this.calculateActualBalance(),this.lastActualBalanceDate=this.completed.length?this.completed[this.completed.length-1].start:0,this.firstActualBalanceDate=this.completed.length?this.completed[0].start:0}deleteEvent(e){this.completed=this.completed.filter((t=>t.id!==e)),this.planned=this.planned.filter((t=>t.id!==e)),this.plannedRepeatable=this.plannedRepeatable.filter((t=>t.id!==e)),this.clearCache()}completeEvent(e,t,n={}){var r=this.completed.find((t=>t.id===e));if(void 0!==r)return this.addPlannedEvent({...r,...this.rawToEvent(n)}),this.sort(),void this.deleteEvent(r.id);if(void 0!==(r=this.planned.find((t=>t.id===e))))return this.addCompletedEvent({...r,...this.rawToEvent(n)}),this.sort(),void this.deleteEvent(r.id);if(void 0!==(r=this.plannedRepeatable.find((t=>t.id===e)))){const e=((e,t,a)=>({id:e,name:t.name,comment:t.comment,project:t.project,projectId:t.projectId,start:a,time:t.time,end:a+86400,days:1,credit:t.credit,debit:t.debit}))(this.lastId++,{...r,...this.rawToEvent(n)},t);if(this.completed.push(e),a.ariseInInterval(r.repeat,r.start,r.start,t)){const e={...r,end:t,id:this.lastId++};this.plannedRepeatable.push(e)}if("/"==r.repeat[0]){const e=+r.repeat.substr(1);r.start=t+86400*e}else r.start=t+86400;return r.end&&!a.ariseInInterval(r.repeat,r.start,r.start,r.end)&&this.deleteEvent(r.id),this.sort(),void this.clearCache()}}updateEvent(e,t){var a=this.completed.find((t=>t.id===e));return void 0!==a?(this.addCompletedEvent(this.rawToEvent(t)),this.sort(),void this.deleteEvent(e)):void 0!==(a=this.planned.find((t=>t.id===e)))||void 0!==(a=this.plannedRepeatable.find((t=>t.id===e)))?(this.addPlannedEvent(this.rawToEvent(t)),this.sort(),void this.deleteEvent(e)):void 0}shiftToDate(e,t,a){var n=this.completed.find((t=>t.id===e));if(void 0!==n){const e=t-n.start;return n.start=t,n.end=n.end?n.end+e:n.end,this.sort(),void this.clearCache()}if(void 0!==(n=this.planned.find((t=>t.id===e)))){const e=t-n.start;return n.start=t,n.end=n.end?n.end+e:n.end,this.sort(),void this.clearCache()}if(void 0!==(n=this.plannedRepeatable.find((t=>t.id===e)))){if("/"!==n.repeat[0]||n.start!==a)return;const e=t-a;return n.start=n.start+e,n.end=n.end?n.end+e:n.end,this.sort(),void this.clearCache()}}copyToDate(e,t){var a=this.completed.find((t=>t.id===e));if(void 0!==a){const e=t-a.start,n={...a,start:t,end:a.end?a.end+e:a.end};return this.addCompletedEvent(n),this.sort(),void this.clearCache()}if(void 0!==(a=this.planned.find((t=>t.id===e)))){const e=t-a.start,n={...a,start:t,end:a.end?a.end+e:a.end};return this.addPlannedEvent(n),this.sort(),void this.clearCache()}if(void 0!==(a=this.plannedRepeatable.find((t=>t.id===e)))){a.start;const e={...a,repeat:"",start:t,end:t+86400};return this.addPlannedEvent(e),this.sort(),void this.clearCache()}}sort(){this.completed.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.planned.sort(((e,t)=>{const a=e.start-t.start;return 0===a?t.days-e.days:a})),this.plannedRepeatable.sort(((e,t)=>e.time-t.time))}getEvents(e){if(void 0!==this.cachedEvents[e])return this.cachedEvents[e];const t=this.planned.reduce(((t,a)=>(e<a.start||e>=a.end||t.push(this.eventToCompact(a,e,!1)),t)),[]);return this.plannedRepeatable.reduce(((t,n)=>(e<n.start||n.end&&e+n.time>=n.end||a.isMatch(n.repeat,n.start,e)&&t.push(this.eventToCompact(n,e,!1)),t)),t),this.completed.reduce(((t,a)=>(e>=a.start&&e<a.end&&t.push(this.eventToCompact(a,e,!0)),t)),t),t.sort(((e,t)=>{var a=e.start-t.start;return a||(a=t.end-t.start-(e.end-e.start))||e.time-t.time})),this.cachedEvents[e]=t,t}getEventsWithPlaceholders(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();return t.forEach((e=>a.push({id:-1}))),this.getEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a),a}getPlannedEventsFilteredBySkip(e,t=[],a=[]){for(;t.length>0&&!(e<t[t.length-1].end);)t.pop();this.getEvents(e).reduce(((e,a)=>(t.some((e=>a.id===e.id))||a.completed||(a.days>1&&t.push({id:a.id,end:a.end}),e.push(a)),e)),a)}getPlannedEventsInInterval(e,t){const a=[],n=[];for(let r=e;r<t;r+=86400)this.getPlannedEventsFilteredBySkip(r,n,a);return a}calculateActualBalance(){return this.completed.reduce(((e,t)=>e+(t.credit-t.debit)),0)}getActualBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e>this.lastActualBalanceDate)return this.lastActualBalance;if(void 0!==this.cachedActualBalance[e])return this.cachedActualBalance[e];const t=this.completed.reduce(((t,a)=>(e>a.start+a.time&&(t+=a.credit-a.debit),t)),0);return this.cachedActualBalance[e]=t,t}getPlannedBalance(e){if(e<this.firstActualBalanceDate)return 0;if(e<=this.lastActualBalanceDate)return this.getActualBalance(e);if(void 0!==this.cachedPlannedBalance[e])return this.cachedPlannedBalance[e];const t=this.getPlannedEventsInInterval(this.lastActualBalanceDate,e).reduce(((e,t)=>e+(t.credit-t.debit)),this.lastActualBalance);return this.cachedPlannedBalance[e]=t,t}getPlannedBalanceChange(e){return this.getEvents(e).reduce(((e,t)=>e+(t.credit-t.debit)),0)}prepareToStorage(){const e=this.completed.map((e=>n.eventToRaw(e))),t=this.plannedRepeatable.reduce(((e,t)=>(e.push(n.eventToRaw(t)),e)),[]);return this.planned.reduce(((e,t)=>(e.push(n.eventToRaw(t)),e)),t),{projectsList:this.projects.slice(1),completedList:e,plannedList:t}}}const r=localStorage.getItem("data");console.log("localStorage",r);const c=JSON.parse(r),i=new n(c?.completedList,c?.plannedList,c?.projectsList);function s({data:t,onAddEvent:a=(()=>{}),onDragDrop:n=(e=>{}),children:r=null}){const{timestamp:c,actualBalance:s,plannedBalance:l,plannedBalanceChange:d}=t,o=React.useRef(null),{day:u,month:m}=e.getDayMonthWeekday(c),p=e=>(e/1e3).toFixed(1);return React.createElement("div",{className:c>=i.lastActualBalanceDate?"day_d84e778":"before_actual_date_fb6a4cf",onClick:function(e){o&&o.current.focus()},onDrop:n,onDragOver:e=>{e.preventDefault(),e.ctrlKey?e.dataTransfer.dropEffect="copy":e.dataTransfer.dropEffect="move"}},React.createElement("div",{className:"header_d741756"},u+(1==u?" "+e.MONTHS[m]:"")),React.createElement("div",{className:"balance_c271232"},p(l)+(0==d?"k":((h=d/1e3)>0?"+"+h.toFixed(1):h.toFixed(1))+"k")+" "+p(s)),React.createElement("div",null," ",r," "),React.createElement("div",{ref:o,className:"input_f2f0e78",contentEditable:"true",suppressContentEditableWarning:!0,onBlur:function(e){a(c,e.target.innerText),e.target.innerText=""},onKeyDown:function(e){"Enter"==e.key&&e.target.blur()}}));var h}function l({event:t,days:a,onClick:n=(e=>{}),onDragStart:r=(e=>{})}){const{name:c,completed:i,background:s,color:l,repeatable:d}=t;return-1===t.id?React.createElement("div",{className:"placeholder_c47b4a3"}):React.createElement("div",{className:i?"completed_b30da5e":d?"repeatable_ca186f6":"item_bb964bd",draggable:!0,onDragStart:r,style:{width:1==a?"calc(100% + 2px)":"calc("+a+" * (100% + 1px) + 1px )",backgroundColor:s,color:l},onClick:e=>{e.stopPropagation(),n(t)}},React.createElement("div",{className:"name_ddde4d8"},c)," "+e.HHMMFromSeconds(t.time))}function d({isOpen:e=!1,onCancel:t=(()=>{}),children:a=null}){return e&&React.createElement("div",{className:"modalOverlay_faa7164",onClick:t},React.createElement("div",{className:"modalWindow_fac41c2",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"modalBody_a8134eb"},a)))}function o(){return o=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var a=arguments[t];for(var n in a)Object.prototype.hasOwnProperty.call(a,n)&&(e[n]=a[n])}return e},o.apply(this,arguments)}function u({active:e=!1,disabled:t=!1,children:a="Button",...n}){return React.createElement("span",o({className:"button_c0afaa2 "+(e?"active_b40adfc":"")},n),a)}const m="color_f674b54";function p({name:e,style:t,children:a}){return React.createElement(React.Fragment,null,React.createElement("div",{className:"parameter_dcc1064",style:t},React.createElement("div",null,e),a)," ")}function h({inputRef:e,children:t}){return React.createElement("div",{ref:e,className:"value_f50ce86",contentEditable:"true",suppressContentEditableWarning:!0},t)}function g({colorRef:e}){const[t,a]=React.useState(e.current);return React.createElement(React.Fragment,null,React.createElement("div",{className:m,style:{backgroundColor:t.background,color:t.color},contentEditable:"true",suppressContentEditableWarning:!0,onBlur:t=>{e.current.background=t.target.innerText,a((e=>({...e,background:t.target.innerText})))}},t.background),React.createElement("div",{className:"completed_a56a0e7",style:{backgroundColor:t.background}},t.background),React.createElement("div",{className:m,style:{backgroundColor:"white",color:"black"},contentEditable:"true",suppressContentEditableWarning:!0,onBlur:t=>{e.current.color=t.target.innerText,a((e=>({...e,color:t.target.innerText})))}},t.color))}function f({event:e,onExit:t=(()=>{})}){const a=React.useRef(null),n=React.useRef(null),r=React.useRef(null),c=React.useRef(null),s=React.useRef(null),l=React.useRef(null),d=React.useRef(null),o=React.useRef(null),m=React.useRef(null),f=React.useRef(null),v=!e.id;var E=i.projects.findIndex((t=>t.name===e.project));E<0&&(E=0);const R=React.useRef({...i.projects[E]});return console.log("event",e),React.createElement("div",{className:"form_aaccbc4"},!v&&React.createElement(u,{onClick:()=>{const c={name:a.current.innerText,comment:n.current.innerText,project:r.current.value,start:s.current.innerText,end:o.current.innerText,time:l.current.innerText,duration:d.current.innerText,credit:m.current.innerText,debit:f.current.innerText};i.completeEvent(e.id,e.timestamp,c),t()}},e.completed?"Mark uncompleted":"Complete"),!v&&React.createElement(u,{onClick:()=>{return a=e.id,i.deleteEvent(a),void t();var a}},"Delete"),!v&&React.createElement(u,{onClick:()=>(e=>{const u={name:a.current.innerText,comment:n.current.innerText,project:r.current.value,repeat:c.current.innerText,start:s.current.innerText,end:o.current.innerText,time:l.current.innerText,duration:d.current.innerText,credit:m.current.innerText,debit:f.current.innerText};i.updateEvent(e,u),t()})(e.id)},e.repeat?"Change All":"Change"),v&&React.createElement(u,{onClick:()=>{const e={name:a.current.innerText,comment:n.current.innerText,project:r.current.value,repeat:c.current.innerText,start:s.current.innerText,end:o.current.innerText,time:l.current.innerText,duration:d.current.innerText,credit:m.current.innerText,debit:f.current.innerText};i.addPlannedRawEvent(e),i.clearCache(),t()}},"Add Event"),React.createElement(u,{onClick:()=>{i.projects[E].background=R.current.background,i.projects[E].color=R.current.color,i.clearCache(),t()}},"Save Project Color"),React.createElement(u,{onClick:t},"Cancel"),React.createElement("div",{ref:a,className:"name_c4b14a4",contentEditable:"true",suppressContentEditableWarning:!0},e.name??""),React.createElement(p,{name:"comment",style:{width:"100%"}},React.createElement(h,{inputRef:n},e.comment??"")),React.createElement("br",null),React.createElement(p,{name:"project",style:{minWidth:100}},React.createElement("select",{className:"select_b60c21c",ref:r,defaultValue:e.project},i.projects.map(((e,t)=>React.createElement("option",{key:t,value:e.name},e.name))))),React.createElement(p,{name:"background/color",style:{minWidth:60}},React.createElement(g,{colorRef:R})),React.createElement("br",null),React.createElement(p,{name:"repeat",style:{minWidth:120}},React.createElement(h,{inputRef:c},e.repeat)),React.createElement("br",null),React.createElement(p,{name:"start date",style:{minWidth:110}},React.createElement(h,{inputRef:s},e.start?e.start:"")),React.createElement(p,{name:"time",style:{minWidth:60}},React.createElement(h,{inputRef:l},e.time?e.time:"")),React.createElement(p,{name:"duration",style:{minWidth:70}},React.createElement(h,{inputRef:d},e.duration?e.duration:"")),React.createElement(p,{name:"end date",style:{minWidth:110}},React.createElement(h,{inputRef:o},e.end?e.end:"")),React.createElement("br",null),React.createElement(p,{name:"credit",style:{minWidth:120}},React.createElement(h,{inputRef:m},e.credit?e.credit:"")),React.createElement(p,{name:"debit",style:{minWidth:120}},React.createElement(h,{inputRef:f},e.debit?e.debit:"")))}function v(){gapi.client.init({apiKey:"AIzaSyDRPEe6LBi-O697m5NPCxhn8swqHm3ExEg",clientId:"153901704601-4n12u2s1bup0sinlesv6aetfgjdsldt2.apps.googleusercontent.com",discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],scope:"https://www.googleapis.com/auth/drive.appfolder"}).then((()=>{console.log("Init GAPI client ok"),gapi.auth2.getAuthInstance().isSignedIn.listen(y)}),(e=>{console.log("Failed to init GAPI client",e)}))}function E(){return gapi&&gapi.auth2}function R(){E()&&gapi.auth2.getAuthInstance().signIn()}function b(){E()&&gapi.auth2.getAuthInstance().signOut()}function T(){return E()&&gapi.auth2.getAuthInstance().isSignedIn.get()}function y(){T()}function D(){const[t,a]=React.useState(!1),[r,c]=React.useState(4),o=React.useRef(null),m=React.useRef(null),[p,h]=React.useState({title:"Add new event",name:"New event"}),g=React.useRef(null);let E=e.getBegintWeekTimestamp(Date.now()/1e3);const y=E;E-=7*r*86400,React.useEffect((()=>{gapi.load("client:auth2",v),g.current.scrollIntoView(!0)}),[]);const D=[];for(let e=0;e<=20;e++){D.push([]);let t=[];for(let a=0;a<=6;a++)D[e].push([]),D[e][a]={timestamp:E,tasks:i.getEventsWithPlaceholders(E,t),actualBalance:i.getActualBalance(E),plannedBalance:i.getPlannedBalance(E),plannedBalanceChange:i.getPlannedBalanceChange(E)},E+=86400}const M=(e,t)=>{""!==t&&(h(n.eventToRaw({name:t,start:e,time:null})),a(!0))},k=e=>{const{id:t,completed:r,start:c}=e,s=(r?i.completed.find((e=>e.id===t)):i.planned.find((e=>e.id===t)))??i.plannedRepeatable.find((e=>e.id===t));h({...n.eventToRaw(s),completed:r,timestamp:c,id:s.id}),a(!0)};return console.log("draw calendar"),React.createElement("div",{className:"wrapper_af90f78"},React.createElement("div",{className:"header_e3daf93"},T()?React.createElement(u,{onClick:b},"Logout"):React.createElement(u,{onClick:R},"Login"),React.createElement(u,{onClick:()=>{const e=JSON.stringify(i.prepareToStorage());localStorage.setItem("data",e),console.log(e)}},"Save to LocalStorage"),React.createElement(u,null,"Today"),React.createElement("span",{ref:m,className:"monthTitle_a8c3ab6"})),React.createElement("div",{className:"dayOfWeekLabels_cf63ad3"},e.WEEKDAYS.map(((e,t)=>React.createElement("div",{key:t},e)))),React.createElement("div",{className:"CalendarBody_b3637e9",onScroll:t=>{const a=t.target,n=a.scrollTop,i=a.scrollHeight-a.scrollTop-a.clientHeight,s=Math.ceil(n/151-r),l=new Date(1e3*(y+7*s*86400));m.current.innerText=l.getFullYear()+" "+e.MONTHS_FULL[l.getMonth()]+" "+s+" week",n<600?c((e=>e+4)):i<600&&c((e=>e-4))},ref:o},D.map((e=>React.createElement("div",{ref:e[0].timestamp==y?g:null,className:"CalendarWeek_ef509bf",key:e[0].timestamp,style:{height:14*e.reduce(((e,t)=>t.tasks.length>e?t.tasks.length:e),7)+31+19}}," ",e.map(((e,t)=>React.createElement(s,{data:e,key:e.timestamp,onAddEvent:M,onDragDrop:t=>((e,t)=>{e.preventDefault();const a=JSON.parse(e.dataTransfer.getData("event_item"));e.ctrlKey?i.copyToDate(a.id,t):i.shiftToDate(a.id,t,a.start),h((e=>({...e})))})(t,e.timestamp)},e.tasks.map(((e,a)=>{return React.createElement(l,{key:a,event:e,days:(n=e.days,r=7-t,n<r?n:r),onClick:k,onDragStart:t=>((e,t)=>{e.dataTransfer.setData("event_item",JSON.stringify(t)),console.log("drag start",e,t)})(t,e)});var n,r}))))))))),React.createElement(d,{isOpen:t,onCancel:()=>a(!1)},React.createElement(f,{event:p,onExit:()=>a(!1)})))}function M(){return React.createElement(D,null)}ReactDOM.render(React.createElement(M,null),document.getElementById("root"))})();