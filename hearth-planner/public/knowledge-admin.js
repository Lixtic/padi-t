(function(){
  'use strict';
  var file=document.getElementById('klFile'), preview=document.getElementById('klPreview');
  var importBtn=document.getElementById('klImport'), importStatus=document.getElementById('klImportStatus');
  var refreshBtn=document.getElementById('klRefresh'), listStatus=document.getElementById('klListStatus');
  var list=document.getElementById('klList'), payload=null, authorized=false;
  function message(el,text){el.textContent=text;}
  function escapeText(value){return String(value==null?'':value);}
  async function headers(){
    if(!window.PadiSync||!window.PadiSync.authHeader) return {};
    return await window.PadiSync.authHeader();
  }
  async function request(url,options){
    var auth=await headers();
    if(!auth.authorization&&!auth.Authorization) throw new Error('Sign in with an administrator account to continue.');
    var response=await fetch(url,Object.assign({},options||{},{headers:Object.assign({},auth,(options&&options.headers)||{})}));
    var data={}; try{data=await response.json();}catch(e){}
    if(!response.ok) throw new Error(data.message||data.error||('Request failed ('+response.status+').'));
    return data;
  }
  function renderSources(rows){
    list.textContent='';
    if(!rows.length){message(listStatus,'No sources have been imported yet.');return;}
    message(listStatus,rows.length+' source(s) found.');
    rows.forEach(function(row){
      var card=document.createElement('article');card.className='kl-item';
      var title=document.createElement('strong');title.textContent=escapeText(row.title);card.appendChild(title);
      var pill=document.createElement('span');pill.className='kl-pill';pill.textContent=escapeText(row.status||'unknown');card.appendChild(pill);
      var meta=document.createElement('p');meta.className='kl-meta';
      meta.textContent=[row.publisher,row.subject,(row.classes||[]).join(', '),row.document_type,row.chunks+' passages',row.source_url].filter(Boolean).join(' · ');
      card.appendChild(meta);
      if(row.status==='pending_review'){
        var actions=document.createElement('div');actions.className='kl-actions';
        var approve=document.createElement('button');approve.className='kl-approve';approve.type='button';approve.textContent='Approve';
        approve.addEventListener('click',async function(){
          if((row.document_type==='approved_textbook'||row.document_type==='approved_supplementary')&&!window.confirm('Have you verified this exact title and approval reference against the NaCCA approved materials register?')) return;
          if(!window.confirm('Approve this source for use in GuidEd Study Notes?')) return;
          approve.disabled=true;
          try{await request('/api/admin?action=knowledge-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:row.id,decision:'approve'})});await loadSources();}
          catch(e){message(listStatus,e.message);approve.disabled=false;}
        });
        var reject=document.createElement('button');reject.type='button';reject.textContent='Reject';
        reject.addEventListener('click',async function(){
          if(!window.confirm('Reject this source? It will not be used by Study Notes.')) return;
          reject.disabled=true;
          try{await request('/api/admin?action=knowledge-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:row.id,decision:'reject'})});await loadSources();}
          catch(e){message(listStatus,e.message);reject.disabled=false;}
        });
        actions.append(approve,reject);card.appendChild(actions);
      }
      list.appendChild(card);
    });
  }
  async function loadSources(){
    message(listStatus,'Loading source library…');
    try{var data=await request('/api/admin?action=knowledge');renderSources(data.sources||[]);}
    catch(e){message(listStatus,e.message);}
  }
  file.addEventListener('change',async function(){
    payload=null;importBtn.disabled=true;preview.value='';
    var selected=file.files&&file.files[0];if(!selected)return;
    if(selected.size>2500000){message(importStatus,'This JSON file is larger than the 2.5 MB API limit. Split the document into smaller ingestion batches.');file.value='';return;}
    try{
      var raw=await selected.text();payload=JSON.parse(raw);
      if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('The JSON root must be a document object.');
      if(!payload.title||!payload.publisher||!payload.sourceUrl||!payload.documentType||!payload.subject||!Array.isArray(payload.segments)||!payload.segments.length)throw new Error('Missing required metadata or page/section segments.');
      preview.value=JSON.stringify({title:payload.title,publisher:payload.publisher,sourceUrl:payload.sourceUrl,documentType:payload.documentType,subject:payload.subject,classes:payload.classes,curriculumCodes:payload.curriculumCodes,segments:payload.segments.length},null,2);
      importBtn.disabled=!authorized;message(importStatus,'Ready to import. The source will enter pending review.');
    }catch(e){payload=null;message(importStatus,'Could not read this file: '+e.message);}
  });
  importBtn.addEventListener('click',async function(){
    if(!payload)return;importBtn.disabled=true;message(importStatus,'Importing document passages…');
    try{var result=await request('/api/admin?action=knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});message(importStatus,result.duplicate?'This source already exists. Current status: '+result.status+'.':'Imported '+result.chunks+' passages. Status: '+result.status+'.');payload=null;file.value='';preview.value='';await loadSources();}
    catch(e){message(importStatus,e.message);importBtn.disabled=false;}
  });
  refreshBtn.addEventListener('click',loadSources);
  (async function init(){
    try{var auth=await headers();if(!auth.authorization&&!auth.Authorization)throw new Error('Sign in first. This page is restricted to GuidEd administrators.');await request('/api/admin?action=knowledge');authorized=true;message(importStatus,'Administrator access confirmed.');importBtn.disabled=!payload;await loadSources();}
    catch(e){message(importStatus,e.message);message(listStatus,'Administrator access is required to view this library.');}
  })();
})();