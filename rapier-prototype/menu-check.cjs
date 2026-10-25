const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.className='';this.textContent='';this.classList={toggle:(name,on)=>{const classes=new Set(this.className.split(' ').filter(Boolean));on?classes.add(name):classes.delete(name);this.className=[...classes].join(' ');}};}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(k,v){this.attrs[k]=v;}
 querySelector(selector){for(const child of this.children){if(child.className.split(' ').includes(selector.slice(1)))return child;const found=child.querySelector(selector);if(found)return found;}return null;}
}
const events={},sent=[],body=new Element('body');let poll;
const Net={phase:'lobby',player:'host',roster:[],session:{host:'host',selected:'mountain',catalog:[{id:'mountain',name:'Snowbound · The Long Way Up',biome:'snow',kind:'race',available:true},{id:'forest',name:'Forest · Branch Management',biome:'forest',kind:'race',available:true}]},on:(event,fn)=>(events[event]??=[]).push(fn),socket:{emit:(...args)=>sent.push(args)}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'client/menu.js'),'utf8'),{Net,document:{body,createElement:tag=>new Element(tag),getElementById:()=>null},setInterval:fn=>poll=fn});
const menu=body.querySelector('.main-menu'),maps=body.querySelector('.menu-maps'),race=body.querySelector('.race'),prologue=body.querySelector('.prologue'),back=body.querySelector('.menu-back'),original=maps.children[0];
assert.equal(menu.hidden,false);assert.equal(maps.children[0].attrs['aria-checked'],'true');poll();assert.equal(maps.children[0],original,'Roster polling must preserve the focused map button');
maps.children[1].onclick();assert.equal(sent.at(-1)[0],'selectCourse');assert.equal(sent.at(-1)[1],'forest');race.onclick();assert.equal(sent.at(-1)[0],'start');prologue.onclick();assert.equal(sent.at(-1)[0],'practice');
Net.player='guest';poll();assert.ok(race.disabled&&prologue.disabled&&maps.children.every(b=>b.disabled));
Net.player='host';Net.phase='playing';poll();assert.equal(menu.hidden,true);assert.equal(back.hidden,false);back.onclick();assert.equal(sent.at(-1)[0],'endRound');
Net.phase='results';poll();back.onclick();assert.equal(sent.at(-1)[0],'selectCourse');assert.equal(sent.at(-1)[1],'mountain','Results return to the same map lobby through the allowed server action');
console.log('PASS menu preserves keyboard focus, host permissions, existing race/prologue actions, and return-to-menu from play/results');
