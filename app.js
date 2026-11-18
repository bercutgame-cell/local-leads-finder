const API_NOMINATIM = "https://nominatim.openstreetmap.org/search";
const API_OVERPASS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://ovp.dresel.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];
const $ = (id) => document.getElementById(id);
const state = { results: [], saved: loadSaved() };
const categories = {
  beauty: ['shop~"beauty|hairdresser|massage|tattoo|perfumery"','amenity~"beauty_salon|barber"'],
  food: ['amenity~"restaurant|cafe|fast_food|bar|pub|food_court"','shop~"bakery|pastry|coffee|confectionery"'],
  auto: ['shop~"car_repair|tyres|car"','amenity~"car_wash|fuel"'],
  health: ['amenity~"doctors|dentist|clinic|hospital|pharmacy|veterinary"','healthcare'],
  construction: ['craft~"plumber|electrician|carpenter|painter|roofer|builder|hvac|tiler"','office~"construction|architect"'],
  fitness: ['leisure~"fitness_centre|sports_centre|sports_hall|pitch"','sport'],
  education: ['amenity~"school|college|language_school|music_school|kindergarten"','office~"educational_institution"'],
  lodging: ['tourism~"hotel|guest_house|motel|hostel|apartment"'],
  professional: ['office~"lawyer|accountant|estate_agent|insurance|consulting|company|financial|employment_agency"','craft'],
  retail: ['shop'],
  all: ['amenity','shop','office','craft','tourism','leisure','healthcare']
};
const categoryNames = Object.fromEntries([...$('category').options].map(o=>[o.value,o.textContent]));
const subcategories = {"beauty":[["Парикмахерские","shop=\"hairdresser\""],["Барбершопы","amenity=\"barber\""],["Салоны красоты","shop=\"beauty\""],["Массаж","shop=\"massage\""],["Тату и пирсинг","shop=\"tattoo\""],["Косметика","shop=\"cosmetics\""]],"food":[["Рестораны","amenity=\"restaurant\""],["Кафе и кофейни","amenity=\"cafe\""],["Фастфуд","amenity=\"fast_food\""],["Пекарни","shop=\"bakery\""],["Кондитерские","shop=\"confectionery\""],["Бары","amenity=\"bar\""]],"auto":[["Автосервисы","shop=\"car_repair\""],["Автомойки","amenity=\"car_wash\""],["Шиномонтаж","shop=\"tyres\""],["Автодилеры","shop=\"car\""],["АЗС","amenity=\"fuel\""]],"health":[["Стоматологии","amenity=\"dentist\""],["Клиники","amenity=\"clinic\""],["Врачи","amenity=\"doctors\""],["Больницы","amenity=\"hospital\""],["Аптеки","amenity=\"pharmacy\""],["Ветеринарные клиники","amenity=\"veterinary\""]],"construction":[["Сантехники","craft=\"plumber\""],["Электрики","craft=\"electrician\""],["Строители","craft=\"builder\""],["Маляры","craft=\"painter\""],["Кровельщики","craft=\"roofer\""],["Архитекторы","office=\"architect\""]],"fitness":[["Фитнес-клубы","leisure=\"fitness_centre\""],["Спортивные центры","leisure=\"sports_centre\""],["Спортзалы","leisure=\"sports_hall\""],["Спортивные площадки","leisure=\"pitch\""]],"education":[["Детские сады","amenity=\"kindergarten\""],["Школы","amenity=\"school\""],["Языковые школы","amenity=\"language_school\""],["Музыкальные школы","amenity=\"music_school\""],["Колледжи","amenity=\"college\""]],"lodging":[["Отели","tourism=\"hotel\""],["Гостевые дома","tourism=\"guest_house\""],["Хостелы","tourism=\"hostel\""],["Мотели","tourism=\"motel\""],["Апартаменты","tourism=\"apartment\""]],"professional":[["Юристы","office=\"lawyer\""],["Бухгалтеры","office=\"accountant\""],["Недвижимость","office=\"estate_agent\""],["Страхование","office=\"insurance\""],["Консалтинг","office=\"consulting\""],["Рекрутинг","office=\"employment_agency\""]],"retail":[["Продуктовые магазины","shop=\"supermarket\""],["Одежда","shop=\"clothes\""],["Обувь","shop=\"shoes\""],["Электроника","shop=\"electronics\""],["Цветочные магазины","shop=\"florist\""],["Мебель","shop=\"furniture\""],["Зоомагазины","shop=\"pet\""]]};
function updateSubcategories(){const key=$('category').value,select=$('subcategory'),items=subcategories[key]||[];select.innerHTML='<option value="">Все подкатегории</option>'+items.map((x,i)=>'<option value="'+i+'">'+esc(x[0])+'</option>').join('');select.disabled=!items.length;}
function loadSaved(){try{return JSON.parse(localStorage.getItem('leadscout_saved')||'[]')}catch{return []}}
function persist(){localStorage.setItem('leadscout_saved',JSON.stringify(state.saved));renderSaved();$('savedCount').textContent=state.saved.length}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2300)}
function setStatus(msg){$('searchStatus').textContent=msg}
function tagValue(tags,keys){for(const k of keys){if(tags[k])return tags[k]}return ''}
function siteUrl(v){if(!v)return '';let s=v.trim();if(!/^https?:\/\//i.test(s))s='https://'+s;try{return new URL(s).href}catch{return ''}}
function extract(el){
  const t=el.tags||{},name=t.name||t.brand||t.operator||'Без названия';
  const website=tagValue(t,['website','contact:website','url']);
  const phone=tagValue(t,['phone','contact:phone','mobile']);
  const email=tagValue(t,['email','contact:email']);
  const address=[t['addr:street'],t['addr:housenumber'],t['addr:city']].filter(Boolean).join(', ')||'Адрес не указан в OpenStreetMap';
  const social={vk:tagValue(t,['contact:vk','vk']),telegram:tagValue(t,['contact:telegram','telegram']),max:tagValue(t,['contact:max','max']),instagram:tagValue(t,['contact:instagram','instagram'])};
  const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;
  const osmType=el.type==='node'?'node':el.type;
  return {id:'osm-'+osmType+'-'+el.id,name,category:tagValue(t,['shop','amenity','office','craft','tourism','leisure','healthcare'])||'Компания',address,website:siteUrl(website),phone,email,social,lat,lon,osmUrl:'https://www.openstreetmap.org/'+osmType+'/'+el.id,source:'OpenStreetMap',status:'Новый',note:'',addedAt:new Date().toISOString()};
}
async function requestOverpass(query){
  const errors=[];
  for(let i=0;i<API_OVERPASS.length;i++){
    const endpoint=API_OVERPASS[i];
    setStatus('Проверяем картографический источник '+(i+1)+' из '+API_OVERPASS.length+'…');
    showProgress(38+i*3,'Получаем список компаний','Источник '+(i+1)+' из '+API_OVERPASS.length+' · до 50 секунд');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),50000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({data:query}),signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||!Array.isArray(data.elements))throw new Error('Некорректный ответ');
      return data;
    }catch(error){
      const reason=error.name==='AbortError'?'тайм-аут 50 сек.':error.message||'сетевая ошибка / CORS';
      errors.push(new URL(endpoint).host+': '+reason);
    }finally{clearTimeout(timeout);}
  }
  throw new Error('Все картографические источники недоступны. '+errors.join(' · '));
}
let progressTimer=null, searchStartedAt=0, progressValue=0;
function showProgress(value,stage,detail=''){
  progressValue=Math.max(progressValue,Math.min(100,value));
  const wrap=$('searchProgress'),bar=$('progressBar'),pct=$('progressPercent');
  wrap.hidden=false;bar.style.width=progressValue+'%';pct.textContent=Math.round(progressValue)+'%';
  $('progressStage').textContent=stage;
  $('progressDetail').textContent=detail;
  $('progressElapsed').textContent='Прошло '+Math.floor((Date.now()-searchStartedAt)/1000)+' сек.';
}
function startProgress(){
  searchStartedAt=Date.now();progressValue=3;showProgress(3,'Подготовка поиска','Подключаем геокодер и картографические источники');
  clearInterval(progressTimer);
  progressTimer=setInterval(()=>{
    const elapsed=(Date.now()-searchStartedAt)/1000;
    const target=Math.min(91,12+elapsed*1.25);
    if(progressValue<target)showProgress(target,$('progressStage').textContent,'Запрос выполняется. Скорость зависит от загруженности серверов');
    $('progressElapsed').textContent='Прошло '+Math.floor(elapsed)+' сек.';
  },700);
}
function finishProgress(ok){
  clearInterval(progressTimer);progressTimer=null;
  if(ok){progressValue=100;showProgress(100,'Поиск завершён','Результаты готовы');}
  else{$('progressStage').textContent='Поиск не завершён';$('progressDetail').textContent='Можно повторить попытку через несколько секунд';$('progressElapsed').textContent='Завершено с ошибкой';}
}
async function search(){
  const city=$('city').value.trim(),category=$('category').value,radius=Number($('radius').value);
  if(!city){setStatus('Укажи город.');return}
  $('searchBtn').disabled=true;$('searchBtn').textContent='Ищем…';startProgress();setStatus('Определяем координаты города…');
  try{
    showProgress(12,'Определяем местоположение','Ищем координаты: '+city);
    const geoController=new AbortController();const geoTimer=setTimeout(()=>geoController.abort(),12000);let geo;try{geo=await fetch(API_NOMINATIM+'?format=jsonv2&limit=1&q='+encodeURIComponent(city),{headers:{'Accept-Language':'ru'},signal:geoController.signal});}finally{clearTimeout(geoTimer)}
    if(!geo.ok)throw new Error('Не удалось обратиться к геокодеру. Попробуй позже.');
    const places=await geo.json();if(!places.length)throw new Error('Город не найден. Уточни название.');
    const {lat,lon,display_name}=places[0];
    showProgress(27,'Формируем запрос','Радиус '+(radius/1000)+' км · '+display_name);
    setStatus('Ищем компании в радиусе '+(radius/1000)+' км от '+display_name+'…');
    const chosen=$('subcategory').value;const filters=(chosen!==''&&subcategories[category]?.[Number(chosen)])?[subcategories[category][Number(chosen)][1]]:(categories[category]||categories.all);
    const clauses=filters.map(f=>f==='healthcare'?'nwr(around:'+radius+','+lat+','+lon+')[healthcare];':f==='sport'?'nwr(around:'+radius+','+lat+','+lon+')[sport];':f==='shop'||f==='craft'?'nwr(around:'+radius+','+lat+','+lon+')['+f+'];':'nwr(around:'+radius+','+lat+','+lon+')['+f+'];').join('\n');
    const query='[out:json][timeout:45];(\n'+clauses+'\n);out center tags;';
    showProgress(35,'Запрос отправлен','Ожидаем ответ картографического сервера. Процент — ориентировочная индикация, не точный таймер');
    const data=await requestOverpass(query);
    showProgress(94,'Обрабатываем результаты','Получено объектов: '+data.elements.length);
    const seen=new Set();state.results=data.elements.map(extract).filter(x=>x.name!=='Без названия').filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true}).sort((a,b)=>Number(!a.website)-Number(!b.website));
    renderResults();const missing=state.results.filter(x=>!x.website).length;
    setStatus('Готово: найдено '+state.results.length+' компаний. Без указанного сайта: '+missing+'.');
    finishProgress(true);
  }catch(e){setStatus(e.name==='AbortError'?'Геокодер не ответил за 12 секунд. Попробуй ещё раз.':(e.message||'Ошибка поиска.'));finishProgress(false);}
  finally{$('searchBtn').disabled=false;$('searchBtn').innerHTML='<span>⌕</span> Найти компании'}
}
function profileUrl(value,platform){
 if(!value)return '';
 const raw=value.trim();
 if(!raw)return '';
 const isKnownDomain=/^(?:https?:\/\/)?(?:www\.)?(?:max\.ru|vk\.com|t\.me)(?:\/|$)/i.test(raw);
 if(/^https?:\/\//i.test(raw)||isKnownDomain){
  try{
   const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
   if(!url.pathname||url.pathname==='/')return '';
   return url.href;
  }catch{return ''}
 }
 const handle=raw.replace(/^@/,'').replace(/^\/+|\/+$/g,'');
 if(!handle||/^(?:www\.)?(?:max\.ru|vk\.com|t\.me)$/i.test(handle))return '';
 if(platform==='telegram')return 'https://t.me/'+handle;
 if(platform==='vk')return 'https://vk.com/'+handle;
 if(platform==='max')return 'https://max.ru/'+handle;
 return '';
}
function messageFor(lead){
 return 'Здравствуйте! Нашёл вашу компанию «'+lead.name+'» и хотел предложить идею по привлечению новых клиентов.\n\nЯ занимаюсь созданием современных лендингов для бизнеса. Такой сайт помогает показать услуги, цены, преимущества и получать обращения из рекламы и поиска.\n\nЕсли вам актуально, могу бесплатно предложить пару идей, как можно улучшить онлайн-презентацию вашей компании. Интересно обсудить?';
}
function card(lead){
 const saved=state.saved.some(x=>x.id===lead.id),site=lead.website?'<a href="'+esc(lead.website)+'" target="_blank" rel="noopener">Сайт ↗</a>':'<span>Сайт не указан</span>';
 const phone=lead.phone?'<a href="tel:'+esc(lead.phone)+'">'+esc(lead.phone)+'</a>':'';
 const email=lead.email?'<a href="mailto:'+esc(lead.email)+'">'+esc(lead.email)+'</a>':'';
 const links=[site,phone,email].filter(Boolean).join(' · ');
 const socialLinks=[['VK',lead.social?.vk,'vk'],['Telegram',lead.social?.telegram,'telegram'],['MAX',lead.social?.max,'max']].filter(x=>x[1]).map(x=>{const u=profileUrl(x[1],x[2]);return u?'<a class="mini-btn" href="'+esc(u)+'" target="_blank" rel="noopener">'+x[0]+' ↗</a>':''}).join('');
 return '<article class="lead-card"><div class="lead-top"><div><h3>'+esc(lead.name)+'</h3><div class="category-label">'+esc(lead.category)+'</div></div><span class="badge '+(lead.website?'has':'missing')+'">'+(lead.website?'Сайт указан':'Нет сайта в данных')+'</span></div><p class="lead-address">'+esc(lead.address)+'</p><div class="contact-lines">'+(links||'Публичные контакты не указаны')+'</div><div class="lead-actions">'+socialLinks+'<button class="mini-btn save" data-save="'+esc(lead.id)+'">'+(saved?'✓ В базе':'＋ Сохранить')+'</button><button class="mini-btn" data-site="'+esc(lead.id)+'">Сайт для клиента</button><button class="mini-btn" data-copy="'+esc(lead.id)+'">Текст предложения</button><a class="mini-btn" target="_blank" rel="noopener" href="'+esc(lead.osmUrl)+'">Карта ↗</a></div></article>';
}
function renderResults(){
 const term=$('filterInput').value.toLowerCase(),wf=$('websiteFilter').value;
 const filtered=state.results.filter(x=>(x.name+' '+x.address).toLowerCase().includes(term)&&(wf==='all'||(wf==='missing'?!x.website:!!x.website)));
 $('results').innerHTML=filtered.length?filtered.map(card).join(''):'<div class="empty-state"><h3>Ничего не найдено</h3><p>Измени фильтр или параметры поиска.</p></div>';
 $('resultCount').textContent='Показано '+filtered.length+' из '+state.results.length;
 $('missingCount').textContent=state.results.filter(x=>!x.website).length+' без указанного сайта';
}
function saveLead(id){const lead=state.results.find(x=>x.id===id);if(!lead)return;if(state.saved.some(x=>x.id===id)){toast('Уже есть в базе');return}state.saved.unshift({...lead});persist();renderResults();toast('Компания сохранена в твоей базе')}
function renderSaved(){
 $('savedCount').textContent=state.saved.length;
 $('savedLeads').innerHTML=state.saved.length?state.saved.map(x=>'<div class="saved-row"><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.address)+' · '+(x.website?'Сайт указан':'Сайт не указан')+' · '+esc(x.status||'Новый')+'</small></div><div><button class="mini-btn" data-site="'+esc(x.id)+'">Сайт / изменить</button> <button class="mini-btn" data-outreach="'+esc(x.id)+'">Связаться</button> <button class="mini-btn" data-remove="'+esc(x.id)+'">Удалить</button></div></div>').join(''):'<p class="muted">Пока ничего не сохранено.</p>';
}
function openOutreach(id){
 const lead=state.saved.find(x=>x.id===id);if(!lead)return;
 $('outreachWorkspace').hidden=false;
 $('outreachCompany').innerHTML='<strong>'+esc(lead.name)+'</strong><p>'+esc(lead.address)+'</p><div class="contact-lines">'+(lead.phone?'<a href="tel:'+esc(lead.phone)+'">Телефон: '+esc(lead.phone)+'</a>':'')+(lead.email?' <a href="mailto:'+esc(lead.email)+'">Email: '+esc(lead.email)+'</a>':'')+(lead.website?' <a href="'+esc(lead.website)+'" target="_blank" rel="noopener">Сайт ↗</a>':'')+'</div>';
 $('outreachMessage').value=lead.outreachMessage||messageFor(lead);
 $('outreachWorkspace').dataset.leadId=id;
 const links=[['VK',lead.social?.vk,'vk'],['Telegram',lead.social?.telegram,'telegram'],['MAX',lead.social?.max,'max']];
 const channels=[];
 if(lead.phone)channels.push('<a class="mini-btn" href="tel:'+esc(lead.phone)+'">Позвонить</a>');
 if(lead.email)channels.push('<a class="mini-btn" href="mailto:'+esc(lead.email)+'?subject='+encodeURIComponent('Предложение по сайту для '+lead.name)+'">Написать на email</a>');
 links.forEach(([label,value,kind])=>{const url=profileUrl(value,kind);if(url)channels.push('<a class="mini-btn" href="'+esc(url)+'" target="_blank" rel="noopener">Открыть '+label+'</a>')});
 $('outreachChannels').innerHTML=channels.length?channels.join(''):'<p class="muted">В карточке нет телефона, email или публичных социальных ссылок. Можно скопировать текст и найти официальный канал компании.</p>';
 $('outreachStatus').textContent=lead.status==='Написал'?'✓ Уже отмечено: написал':'Отметить: написал';
}
function closeOutreach(){$('outreachWorkspace').hidden=true;}

function exportCSV(){
 if(!state.saved.length){toast('Сначала сохрани компании');return}
 const cols=['Название','Категория','Адрес','Телефон','Email','Сайт','VK','Telegram','Источник','Ссылка на карту','Статус'];
 const rows=state.saved.map(x=>[x.name,x.category,x.address,x.phone,x.email,x.website,x.social?.vk,x.social?.telegram,x.source,x.osmUrl,x.status]);
 const csv='\uFEFF'+[cols,...rows].map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='leadscout-leads.csv';a.click();URL.revokeObjectURL(url);
}

function siteLead(id){
  return state.saved.find(x=>x.id===id)||state.results.find(x=>x.id===id);
}
function openSiteEditor(id){
  const lead=siteLead(id);if(!lead)return;
  const cfg=lead.siteDraft||{};
  $('siteEditor').hidden=false;
  $('siteLeadId').value=id;
  $('siteName').value=cfg.siteName||('Сайт '+lead.name);
  $('siteTitle').value=cfg.title||('Услуги компании '+lead.name);
  $('sitePhone').value=cfg.phone??lead.phone??'';
  $('siteEmail').value=cfg.email??lead.email??'';
  $('siteAddress').value=cfg.address??lead.address??'';
  $('siteDescription').value=cfg.description||('Расскажите о компании '+lead.name+', её преимуществах и услугах.');
  $('siteServices').value=cfg.services||'Консультация — уточнить цену\nОсновная услуга — уточнить цену';
  $('siteButton').value=cfg.button||'Оставить заявку';
  $('siteNotice').textContent='Черновик привязан к компании «'+lead.name+'». Сохраните компанию в базе, чтобы не потерять изменения.';
}
function closeSiteEditor(){$('siteEditor').hidden=true}
function saveSiteDraft(){
  const id=$('siteLeadId').value;
  let lead=state.saved.find(x=>x.id===id);
  if(!lead){const found=state.results.find(x=>x.id===id);if(!found)return;lead={...found};state.saved.unshift(lead);}
  lead.siteDraft={siteName:$('siteName').value.trim(),title:$('siteTitle').value.trim(),phone:$('sitePhone').value.trim(),email:$('siteEmail').value.trim(),address:$('siteAddress').value.trim(),description:$('siteDescription').value.trim(),services:$('siteServices').value.trim(),button:$('siteButton').value.trim()};
  persist();renderResults();renderSaved();toast('Данные сайта сохранены отдельно для этой компании');
}
function getTemplate(){try{return localStorage.getItem('leadscout_html_template')||''}catch{return ''}}
function setTemplate(html,name){
 try{localStorage.setItem('leadscout_html_template',html);localStorage.setItem('leadscout_html_template_name',name||'custom-template.html')}
 catch(e){throw new Error('HTML-шаблон не помещается в хранилище браузера. Уменьши размер файла.')}
 renderTemplateInfo();
}
function renderTemplateInfo(){
 const name=localStorage.getItem('leadscout_html_template_name')||'';
 const message=getTemplate()?'Загружен шаблон: '+name:'Шаблон не загружен. Выбери свой HTML-файл.';
 if($('templateInfo'))$('templateInfo').textContent=message;
 if($('editorTemplateInfo'))$('editorTemplateInfo').textContent=message;
}
function showWorkspace(id){
 document.querySelectorAll('.workspace-view').forEach(v=>{const active=v.id===id;v.hidden=!active;v.classList.toggle('active',active)});
 document.querySelectorAll('.workspace-tab').forEach(v=>v.classList.toggle('active',v.dataset.view===id));
 window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.workspace-tab').forEach(v=>v.addEventListener('click',()=>showWorkspace(v.dataset.view)));
function buildCustomizedHTML(lead){
 const template=getTemplate();if(!template)throw new Error('Сначала загрузи свой HTML-шаблон.');
 const d=lead.siteDraft||{};
 const services=String(d.services||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const values={company_name:d.siteName||lead.name,title:d.title||lead.name,phone:d.phone||lead.phone||'',email:d.email||lead.email||'',address:d.address||lead.address||'',website:lead.website||'',description:d.description||'',button_text:d.button||'Оставить заявку',services_text:services.join('\n'),services_html:services.map(x=>'<li>'+esc(x)+'</li>').join('')};
 return template.replace(/\{\{([a-z_]+)\}\}/gi,(match,key)=>Object.prototype.hasOwnProperty.call(values,key)?(key==='services_html'?values[key]:esc(values[key])):match);
}
function previewSiteDraft(){
 saveSiteDraft();
 const id=$('siteLeadId').value,lead=state.saved.find(x=>x.id===id);if(!lead)return;
 try{const html=buildCustomizedHTML(lead),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}
 catch(e){toast(e.message)}
}
function downloadSiteDraft(){
 saveSiteDraft();
 const id=$('siteLeadId').value,lead=state.saved.find(x=>x.id===id);if(!lead)return;
 try{
  const html=buildCustomizedHTML(lead),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='index-'+id+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  toast('Готовый HTML из твоего шаблона скачан');
 }catch(e){toast(e.message)}
}

document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.save)saveLead(b.dataset.save);
 if(b.dataset.site)openSiteEditor(b.dataset.site);
 if(b.dataset.copy){const l=state.results.find(x=>x.id===b.dataset.copy);if(l){await navigator.clipboard.writeText(messageFor(l));toast('Текст скопирован — персонализируй перед отправкой')}}
 if(b.dataset.remove){state.saved=state.saved.filter(x=>x.id!==b.dataset.remove);persist();toast('Удалено из базы')}
 if(b.dataset.outreach){showWorkspace('clientsView');openOutreach(b.dataset.outreach);$('outreachWorkspace').scrollIntoView({behavior:'smooth',block:'start'});}
});
$('searchForm').addEventListener('submit',e=>{e.preventDefault();search()});
$('category').addEventListener('change',updateSubcategories);
updateSubcategories();
$('outreachClose').addEventListener('click',closeOutreach);
$('outreachCopy').addEventListener('click',async()=>{const id=$('outreachWorkspace').dataset.leadId;const lead=state.saved.find(x=>x.id===id);if(!lead)return;lead.outreachMessage=$('outreachMessage').value;persist();try{await navigator.clipboard.writeText(lead.outreachMessage);toast('Текст предложения скопирован')}catch{toast('Не удалось скопировать автоматически. Выдели текст вручную.')}});
$('outreachStatus').addEventListener('click',()=>{const id=$('outreachWorkspace').dataset.leadId;const lead=state.saved.find(x=>x.id===id);if(!lead)return;lead.status='Написал';lead.lastContactAt=new Date().toISOString();lead.outreachMessage=$('outreachMessage').value;persist();openOutreach(id);toast('Статус клиента обновлён')});
$('outreachMessage').addEventListener('input',()=>{const id=$('outreachWorkspace').dataset.leadId;const lead=state.saved.find(x=>x.id===id);if(lead)lead.outreachMessage=$('outreachMessage').value;});
$('filterInput').addEventListener('input',renderResults);
$('websiteFilter').addEventListener('change',renderResults);
$('exportBtn').addEventListener('click',exportCSV);
$('siteClose').addEventListener('click',closeSiteEditor);
$('siteSave').addEventListener('click',saveSiteDraft);
$('siteDownload').addEventListener('click',downloadSiteDraft);
$('sitePreview').addEventListener('click',previewSiteDraft);
$('templateUpload').addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(!/\.html?$/i.test(file.name)){toast('Выбери файл .html');e.target.value='';return}try{const html=await file.text();if(!/<html|<!doctype|<body/i.test(html))throw new Error('Файл не похож на полноценный HTML-документ');setTemplate(html,file.name);toast('HTML-шаблон загружен')}catch(err){toast(err.message||'Ошибка загрузки шаблона')}});
renderTemplateInfo();
renderSaved();
showWorkspace('searchView');