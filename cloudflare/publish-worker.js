const ORIGIN = "https://bercutgame-cell.github.io";
const REPO = "bercutgame-cell/local-leads-finder";
const BRANCH = "main";
const MAX_HTML_BYTES = 1500000;
const cors = () => ({
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
});
function reply(data,status){return new Response(JSON.stringify(data),{status,headers:{...cors(),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
function slugify(value){
 return String(value||"client").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"client";
}
function toBase64Utf8(value){
 const bytes=new TextEncoder().encode(value);let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);
}
async function github(path,token,options={}){
 const response=await fetch("https://api.github.com"+path,{...options,headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"LeadScout-Publisher",...(options.headers||{})}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(body.message||("GitHub API HTTP "+response.status));error.status=response.status;throw error;}
 return body;
}
export default {
 async fetch(request,env){
  const origin=request.headers.get("Origin")||"";
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
  if(origin!==ORIGIN)return reply({ok:false,error:"Origin not allowed"},403);
  const url=new URL(request.url);
  if(url.pathname==="/health"&&request.method==="GET")return reply({ok:true,service:"LeadScout Publisher"},200);
  if(url.pathname!=="/publish"||request.method!=="POST")return reply({ok:false,error:"Not found"},404);
  if(!env.GITHUB_TOKEN||!env.PUBLISH_PASSWORD)return reply({ok:false,error:"На Worker не настроены секреты GITHUB_TOKEN и PUBLISH_PASSWORD."},503);
  const auth=request.headers.get("Authorization")||"";
  const supplied=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!supplied||supplied!==env.PUBLISH_PASSWORD)return reply({ok:false,error:"Неверный пароль публикации."},401);
  try{
   const length=Number(request.headers.get("Content-Length")||0);
   if(length>MAX_HTML_BYTES+20000)return reply({ok:false,error:"HTML слишком большой. Максимум 1,5 МБ."},413);
   const input=await request.json();
   const html=String(input.html||"");
   if(!html.trim()||new TextEncoder().encode(html).length>MAX_HTML_BYTES)return reply({ok:false,error:"HTML пустой или превышает лимит 1,5 МБ."},413);
   if(!/<html[\s>]|<!doctype\s+html/i.test(html))return reply({ok:false,error:"Передан не полноценный HTML-документ."},400);
   const id=String(input.leadId||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
   if(!id)return reply({ok:false,error:"Не указан идентификатор компании."},400);
   const slug=slugify(input.companyName)+"-"+slugify(id).slice(0,24);
   const path="clients/"+slug+"/index.html";
   let existingSha="";
   try{const existing=await github("/repos/"+REPO+"/contents/"+path+"?ref="+BRANCH,env.GITHUB_TOKEN);existingSha=existing.sha||"";}catch(error){if(error.status!==404)throw error;}
   const payload={message:(existingSha?"Update":"Publish")+" client site: "+slug,content:toBase64Utf8(html),branch:BRANCH};
   if(existingSha)payload.sha=existingSha;
   const committed=await github("/repos/"+REPO+"/contents/"+path,env.GITHUB_TOKEN,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   return reply({ok:true,path,url:"https://bercutgame-cell.github.io/local-leads-finder/"+path.replace(/index\.html$/,""),commit:committed.commit?.sha||null,updated:!!existingSha},200);
  }catch(error){return reply({ok:false,error:error.message||"Ошибка публикации."},error.status===401?401:502);}
 }
};
